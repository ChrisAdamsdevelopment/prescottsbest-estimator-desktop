import { readFile, writeFile, rename, mkdir, open, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const bridgePath = process.env.PBC_BRIDGE_PATH || join(dirname(fileURLToPath(import.meta.url)), '.bridge-jobs.json');
const lockPath = bridgePath + '.lock';
const blank = () => ({ version: 1, updatedAt: new Date().toISOString(), records: {}, audit: [] });
export async function readState() {
  try {
    const d = JSON.parse(await readFile(bridgePath, 'utf8'));
    if (d.version !== 1 || !d.records || typeof d.records !== 'object') throw new Error('Unexpected bridge schema');
    return d;
  } catch (e) { if (e.code === 'ENOENT') return blank(); throw e; }
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function transaction(fn) {
  await mkdir(dirname(bridgePath), { recursive: true });
  let lock;
  for (let i = 0; i < 40; i++) {
    try { lock = await open(lockPath, 'wx'); break; }
    catch (e) { if (e.code !== 'EEXIST') throw e; await sleep(75); }
  }
  if (!lock) throw new Error('Bridge busy. Retry.');
  try {
    const state = await readState();
    const result = await fn(state);
    state.updatedAt = new Date().toISOString();
    const temp = bridgePath + '.' + randomUUID() + '.tmp';
    await writeFile(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
    await rename(temp, bridgePath);
    return result;
  } finally { await lock.close(); await unlink(lockPath).catch(() => {}); }
}
const allowed = ['id', 'createdAt', 'updatedAt', 'customer', 'phone', 'address', 'title', 'notes', 'mode',
  'preset', 'scope', 'exclusions', 'items', 'addOns', 'contract', 'selections', 'supplierQuotes',
  'workPhases', 'actualExpenses', 'margin', 'contingency', 'overheadAllowance', 'minimumCharge',
  'discount', 'taxRate', 'validDays', 'status'];
export function sanitizeJob(job) {
  if (!job || typeof job !== 'object' || typeof job.id !== 'string' || !/^[\w-]{4,90}$/.test(job.id)) throw new Error('Invalid job ID');
  if (typeof job.title !== 'string' || job.title.length > 300 || !['concierge','remodel'].includes(job.mode) ||
    !Array.isArray(job.items) || job.items.length > 150) throw new Error('Invalid job fields');
  const out = Object.fromEntries(allowed.filter(k => job[k] !== undefined).map(k => [k, job[k]]));
  out.photos = []; // No photographs mirrored into the MCP bridge.
  out.bridgePhotoCount = Number.isInteger(job.photoCount) && job.photoCount >= 0 ? job.photoCount : (Array.isArray(job.photos) ? job.photos.length : 0);
  if (JSON.stringify(out).length > 300_000) throw new Error('Job details exceed 300KB limit');
  return out;
}
function audit(state, action, jobId, details = {}) {
  state.audit.push({ at: new Date().toISOString(), action, jobId, ...details });
  if (state.audit.length > 2000) state.audit.splice(0, state.audit.length - 2000);
}
export async function pushBrowserJobs(jobs) {
  if (!Array.isArray(jobs) || jobs.length > 150) throw new Error('Maximum 150 jobs per sync batch');
  return transaction(state => {
    const result = { added: 0, updated: 0, unchanged: 0, conflicts: [], revisions: {} };
    for (const raw of jobs) {
      const job = sanitizeJob(raw);
      const before = state.records[job.id];
      if (before) {
        // Optimistic revision check: never overwrite a record changed by another tool/device.
        if (raw.baseRevision !== before.revision) {
          result.conflicts.push({ id: job.id, currentRevision: before.revision });
          continue;
        }
        if (JSON.stringify(before.job) === JSON.stringify(job)) {
          result.unchanged++;
        } else {
          before.job = job;
          before.source = 'browser'; // Imported MCP drafts are now owned by browser after explicit update.
          before.revision++;
          before.lastModified = new Date().toISOString();
          audit(state, 'browser_snapshot_updated', job.id, { revision: before.revision });
          result.updated++;
        }
        result.revisions[job.id] = before.revision;
        continue;
      }
      state.records[job.id] = { source: 'browser', revision: 1, job, lastModified: new Date().toISOString() };
      result.revisions[job.id] = 1;
      audit(state, 'browser_snapshot_uploaded', job.id);
      result.added++;
    }
    return result;
  });
}
export async function listJobs() {
  const state = await readState();
  return Object.values(state.records).map(({ job, source, revision }) => ({
    id: job.id, title: job.title, customer: job.customer, mode: job.mode, status: job.status,
    updatedAt: job.updatedAt, source, revision, itemCount: job.items?.length || 0,
    photoCountOnOriginalDevice: job.bridgePhotoCount || 0
  })).sort((a,b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}
export async function getJob(id) {
  const record = (await readState()).records[id];
  if (!record) throw new Error('No job with ID ' + id);
  return record;
}
export async function createDraft({ title, mode, customer = '', scope = '', notes = '' }) {
  if (typeof title !== 'string' || title.trim().length < 3 || title.length > 180 ||
      !['concierge', 'remodel'].includes(mode) || typeof scope !== 'string' ||
      scope.length > 5000 || typeof notes !== 'string' || notes.length > 5000 ||
      typeof customer !== 'string' || customer.length > 160) throw new Error('Invalid draft details');
  return transaction(state => {
    const now = new Date().toISOString();
    const job = { id: randomUUID(), createdAt: now, updatedAt: now, customer, phone: '', address: '',
      title: title.trim(), notes, mode, preset: '', scope, exclusions: 'Scope, quantities, labor, materials, tax and license must be verified by the contractor.',
      items: [], addOns: [], photos: [], margin: 0, contingency: 0, overheadAllowance: 0,
      minimumCharge: 0, discount: 0, taxRate: 0, validDays: 14, status: 'draft',
      contract: { mode: mode === 'remodel' ? 'cost_plus' : 'fixed', feeBasis: 'percent',
        feePercent: 0, fixedFee: 0, note: 'DRAFT ONLY. No company-approved fee or rate entered.' },
      selections: [], supplierQuotes: [], workPhases: [], actualExpenses: [] };
    state.records[job.id] = { source: 'mcp', revision: 1, job, lastModified: now };
    audit(state, 'mcp_draft_created', job.id);
    return { id: job.id, title: job.title, mode: job.mode, status: job.status, priceApproved: false };
  });
}
export async function addDraftObservation(id, note, expectedRevision) {
  if (typeof note !== 'string' || note.trim().length < 4 || note.length > 1200) throw new Error('Observation must contain 4–1200 characters');
  return transaction(state => {
    const record = state.records[id];
    if (!record) throw new Error('Unknown job');
    if (record.source !== 'mcp' || record.job.status !== 'draft') throw new Error('Only MCP-created uncommitted drafts can be edited here');
    if (record.revision !== expectedRevision) throw new Error('Revision conflict: reload job before editing');
    record.job.notes = [record.job.notes, note.trim()].filter(Boolean).join('\n').slice(0, 9000);
    record.job.updatedAt = new Date().toISOString();
    record.revision++;
    record.lastModified = record.job.updatedAt;
    audit(state, 'mcp_observation_added', id, { revision: record.revision });
    return { id, revision: record.revision, notes: record.job.notes };
  });
}
export async function getBridgeStatus() {
  const state = await readState();
  const counts = { total: Object.keys(state.records).length, mcpDrafts: 0, browserSnapshots: 0 };
  for (const row of Object.values(state.records)) if (row.source === 'mcp') counts.mcpDrafts++; else counts.browserSnapshots++;
  return { connected: true, ...counts, lastUpdated: state.updatedAt, photoMirroring: false,
    readOnlyBrowserSnapshots: true };
}

export async function setDraftEstimate(id, input, expectedRevision) {
  if (!input || !Array.isArray(input.items) || input.items.length > 80 ||
      !Number.isInteger(expectedRevision) || expectedRevision < 1) throw Error('Invalid draft item update');
  const items = input.items.map(row => {
    if (!row || typeof row.description !== 'string' || row.description.length < 3 ||
      row.description.length > 220 || !['labor','material','other','subcontract'].includes(row.category) ||
      !Number.isFinite(row.qty) || row.qty < 0 || row.qty > 10000 ||
      !Number.isFinite(row.unitCost) || row.unitCost < 0 || row.unitCost > 100000 ||
      typeof row.unit !== 'string' || row.unit.length > 24)
      throw Error('Invalid estimate item');
    return {id:randomUUID(),description:row.description,category:row.category,qty:row.qty,unit:row.unit,unitCost:row.unitCost};
  });
  if(!Number.isFinite(input.feePercent)||input.feePercent<0||input.feePercent>45 ||
    !Number.isFinite(input.contingency)||input.contingency<0||input.contingency>30)
    throw Error('Fee and contingency outside pilot limits');
  return transaction(s=>{
    const record=s.records[id];
    if(!record||record.source!=='mcp'||record.job.status!=='draft')throw Error('Only MCP-created unapproved drafts can be updated');
    if(record.revision!==expectedRevision)throw Error('Revision conflict');
    record.job.items=items;
    record.job.contingency=input.contingency;
    record.job.contract={mode:'cost_plus',feeBasis:'percent',feePercent:input.feePercent,fixedFee:0,
      note:'ILLUSTRATIVE TEST RATE ONLY - owner approval and signed cost-plus terms required. No binding proposal.'};
    record.job.address=typeof input.address==='string'?input.address.slice(0,140):record.job.address;
    record.job.exclusions=typeof input.exclusions==='string'?input.exclusions.slice(0,3000):record.job.exclusions;
    if(Array.isArray(input.workPhases))record.job.workPhases=input.workPhases.slice(0,20);
    record.job.updatedAt=new Date().toISOString();
    record.revision++;record.lastModified=record.job.updatedAt;
    audit(s,'mcp_draft_budget_updated',id,{revision:record.revision,itemCount:items.length,priceApproved:false});
    return {id,revision:record.revision,itemCount:items.length,priceApproved:false};
  });
}
