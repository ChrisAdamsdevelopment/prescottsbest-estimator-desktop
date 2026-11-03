import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const temp = await mkdtemp(join(tmpdir(), 'pbc-bridge-test-'));
process.env.PBC_BRIDGE_PATH = join(temp, 'bridge.json');
const { listJobs, pushBrowserJobs, getBridgeStatus, createDraft, addDraftObservation, getJob } =
  await import('../server/bridge-store.mjs');
try {
  assert.equal((await getBridgeStatus()).total, 0);
  const sample = { id: 'synthetic-job-0001', title: 'Sample kitchen estimate', mode: 'remodel',
    status: 'draft', customer: 'Synthetic Test', scope: 'No actual customer', items: [],
    photos: [], photoCount: 2 };
  const first = await pushBrowserJobs([sample]);
  assert.equal(first.added, 1);
  assert.equal((await getJob(sample.id)).job.bridgePhotoCount, 2);
  assert.equal((await getJob(sample.id)).job.photos.length, 0);
  const same = await pushBrowserJobs([{ ...sample, baseRevision: 1 }]);
  assert.equal(same.unchanged, 1);
  const conflict = await pushBrowserJobs([{ ...sample, baseRevision: 0, title: 'Different' }]);
  assert.deepEqual(conflict.conflicts, [{ id: sample.id, currentRevision: 1 }]);
  assert.equal((await getJob(sample.id)).job.title, sample.title);
  const updated = await pushBrowserJobs([{ ...sample, baseRevision: 1, title: 'Updated synthetic job' }]);
  assert.equal(updated.updated, 1);
  assert.equal(updated.revisions[sample.id], 2);
  assert.equal((await getJob(sample.id)).job.title, 'Updated synthetic job');
  const draft = await createDraft({ title: 'Synthetic photo-based bathroom scope',
    mode: 'remodel', scope: 'User asked to inspect tile and waterproofing' });
  assert.equal(draft.priceApproved, false);
  assert.equal((await getBridgeStatus()).mcpDrafts, 1);
  const obs = await addDraftObservation(draft.id, 'Picture indicates tile; dimensions unverified.', 1);
  assert.equal(obs.revision, 2);
  await assert.rejects(addDraftObservation(draft.id, 'Incorrect revision', 1), /Revision conflict/);
  await assert.rejects(addDraftObservation(sample.id, 'Should be read only', 1), /Only MCP-created/);
  assert.equal((await listJobs()).length, 2);
  console.log('PASS: bridge snapshot privacy, idempotence, conflict, draft, revision, audit-safe append.');
} finally { await rm(temp, { recursive: true, force: true }); }
