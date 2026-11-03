import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { listJobs, getJob, createDraft, addDraftObservation, getBridgeStatus } from './bridge-store.mjs';
import { listWorkspaces } from './google-workspace.mjs';
import { localGooglePermissions, localGmailSearch, localGmailRead } from './mcp-google-read.mjs';
import { listVisuals, importVisualLocal, makeVisualBrief, openVisual } from './photo-visuals.mjs';
import { portalStatus, portalLeads, portalPublish, portalRevoke } from './portal-client.mjs';

const writesAllowed = process.env.PBC_MCP_ENABLE_WRITES === '1';
const formatted = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const failed = e => ({ isError: true, content: [{ type: 'text', text: e.message || 'Tool failed' }] });
const wrap = fn => async args => { try { return formatted(await fn(args)); } catch (e) { return failed(e); } };

serveStdio(() => {
  const server = new McpServer({ name: 'prescotts-best-construction-local', version: '0.1.0' });
  server.registerTool('pbc_portal_status', {
    description:'Read published customer proposal statuses, questions and approval-review evidence from the separately hosted Render portal. Requires private local portal configuration; no extra AI API calls.',
    inputSchema:z.object({})
  },wrap(()=>portalStatus()));
  server.registerTool('pbc_portal_leads', {
    description:'Read private homeowner remodeling requests and notification status from hosted Render backend; requires local operator secret. Does not send or modify email.',
    inputSchema:z.object({})
  },wrap(()=>portalLeads()));
  server.registerTool('pbc_portal_publish_reviewed', {
    description:'Publish an exact OWNER-APPROVED customer-safe revision and optional reviewed AI render to the private Render customer portal, returning a private customer link. NEVER sends email or signs a contract. Requires explicit confirmation and enabled local MCP writes.',
    inputSchema:z.object({
      jobId:z.string().min(4).max(100),visualId:z.string().uuid().optional(),
      ownerApproved:z.boolean(),confirmation:z.literal('PUBLISH REVIEWED PROPOSAL'),
      proposal:z.object({
        title:z.string().min(3).max(160),revision:z.string().min(1).max(60),projectRef:z.string().max(100).optional(),
        scope:z.string().min(3).max(3500),terms:z.string().min(3).max(3500),
        customerName:z.string().max(150).optional(),location:z.string().max(180).optional(),
        mode:z.enum(['cost_plus','fixed']),
        items:z.array(z.object({label:z.string().min(1).max(160),amount:z.number().min(0).max(10000000)})).min(1).max(50),
        direct:z.number().min(0),contingency:z.number().min(0),fee:z.number().min(0),total:z.number().min(0),
        expiresInDays:z.number().int().min(1).max(90),demo:z.boolean()
      })
    })
  },wrap(input=>portalPublish(input)));
  server.registerTool('pbc_portal_revoke', {
    description:'Revoke an existing private hosted customer proposal link. Explicit authorized operator action; does not modify original local estimate.',
    inputSchema:z.object({id:z.string().uuid(),confirmed:z.boolean()})
  },wrap(({id,confirmed})=>portalRevoke(id,confirmed)));
  server.registerTool('pbc_google_permissions', {
    description:'Read local Google OAuth identity/Gmail read/Gmail send/Drive permission booleans. Never returns tokens.',
    inputSchema:z.object({})
  },wrap(()=>localGooglePermissions()));
  server.registerTool('pbc_google_workspaces', {
    description:'Read previously created local Google Drive project folder metadata and approval evidence statuses. No new folders are created.',
    inputSchema:z.object({})
  },wrap(()=>listWorkspaces()));
  server.registerTool('pbc_gmail_search', {
    description:'Read up to 10 matching Gmail email subjects, senders and snippets through the locally authorized Gmail account. No mail is sent, changed or deleted. Requires operator-authorized Gmail readonly.',
    inputSchema:z.object({query:z.string().min(1).max(250)})
  },wrap(({query})=>localGmailSearch(query)));
  server.registerTool('pbc_gmail_read', {
    description:'Read the plain-text body and attachment names of one explicitly selected Gmail message, without modifying or sending email. Requires authorized Gmail readonly permission.',
    inputSchema:z.object({messageId:z.string().min(6).max(120)})
  },wrap(({messageId})=>localGmailRead(messageId)));
  server.registerTool('pbc_photo_visuals', {
    description:'Read image version metadata, selected finishes and review status for one project; no image binaries and no AI generation API calls.',
    inputSchema:z.object({jobId:z.string().min(4).max(100)})
  },wrap(({jobId})=>listVisuals(jobId)));
  server.registerTool('pbc_photo_visual_image', {
    description:'Return a selected saved site or rendered project image as MCP image content for visual inspection. Read only; no external model API or Drive sharing.',
    inputSchema:z.object({id:z.string().uuid()})
  },async ({id})=>{
    try{
      const v=await openVisual(id);
      return {content:[{type:'text',text:JSON.stringify({id,kind:v.kind,label:v.label,customerApproved:v.customerApproved})},
        {type:'image',data:v.imageDataUrl.split(',')[1],mimeType:v.imageDataUrl.slice(5,v.imageDataUrl.indexOf(';'))}]};
    }catch(e){return failed(e)}
  });
  server.registerTool('pbc_photo_visual_brief', {
    description:'Build a precise prompt for editing the actual site photo in ChatGPT, using chosen door, trim, paint, hardware and fixtures. Does not generate an image.',
    inputSchema:z.object({jobId:z.string().min(4).max(100),kind:z.enum(['after']).default('after'),
      label:z.string().max(140),notes:z.string().max(1500).optional(),
      choices:z.object({door:z.string().max(180).optional(),trim:z.string().max(180).optional(),
        paint:z.string().max(180).optional(),hardware:z.string().max(180).optional(),
        fixtures:z.string().max(180).optional(),other:z.string().max(180).optional()}).optional()})
  },wrap(input=>makeVisualBrief(input)));
  server.registerTool('pbc_photo_visual_import_local', {
    description:'Import an operator-saved site or ChatGPT rendered image from an existing file under the authorized Prescott construction project root into a versioned local gallery. Does not send anything to Drive. Requires PBC_MCP_ENABLE_WRITES=1.',
    inputSchema:z.object({jobId:z.string().min(4).max(100),kind:z.enum(['before','after','reference']),
      label:z.string().max(140),path:z.string().min(4).max(850),
      notes:z.string().max(1500).optional(),
      choices:z.object({door:z.string().max(180).optional(),trim:z.string().max(180).optional(),
        paint:z.string().max(180).optional(),hardware:z.string().max(180).optional(),
        fixtures:z.string().max(180).optional(),other:z.string().max(180).optional()}).optional()})
  },wrap(input=>{
    if(!writesAllowed)throw Error('MCP writes disabled. Set PBC_MCP_ENABLE_WRITES=1 on this computer to import local pictures.');
    return importVisualLocal(input);
  }));
  server.registerTool('pbc_status', {
    description: 'Read local estimator bridge health, synchronized snapshot counts, and draft counts. No AI provider API is used.',
    inputSchema: z.object({})
  }, wrap(() => getBridgeStatus()));
  server.registerTool('pbc_list_jobs', {
    description: 'List jobs shared to the bridge and MCP-generated drafts. Local browser jobs only appear after explicit user sync.',
    inputSchema: z.object({})
  }, wrap(() => listJobs()));
  server.registerTool('pbc_get_job', {
    description: 'Inspect one shared job with line items, scope and costs. Photographs are not mirrored. Read-only.',
    inputSchema: z.object({ id: z.string().min(4).max(90) })
  }, wrap(({ id }) => getJob(id)));
  server.registerTool('pbc_create_draft', {
    description: 'Create a new unpriced construction estimate DRAFT in the local bridge for later explicit import in the app. Never issues quotes or sends messages. Requires PBC_MCP_ENABLE_WRITES=1 on this computer.',
    inputSchema: z.object({
      title: z.string().min(3).max(180),
      mode: z.enum(['concierge', 'remodel']),
      customer: z.string().max(160).optional(),
      scope: z.string().max(5000).optional(),
      notes: z.string().max(5000).optional()
    })
  }, wrap(input => {
    if (!writesAllowed) throw new Error('MCP writes disabled. Set PBC_MCP_ENABLE_WRITES=1 to allow local unpriced drafts.');
    return createDraft(input);
  }));
  server.registerTool('pbc_add_draft_observation', {
    description: 'Append an observation (such as ChatGPT photo interpretation) to an MCP-created draft only. Requires exact revision to prevent edits colliding. Does not add priced items.',
    inputSchema: z.object({ id: z.string().min(4).max(90), note: z.string().min(4).max(1200),
      expectedRevision: z.number().int().positive() })
  }, wrap(({ id, note, expectedRevision }) => {
    if (!writesAllowed) throw new Error('MCP writes disabled.');
    return addDraftObservation(id, note, expectedRevision);
  }));
  server.registerTool('pbc_estimate_summary', {
    description: 'Calculate local deterministic pricing, cost-plus vs fixed-price forecast, crew timing, and risk flags for a shared estimate. No external AI APIs are called.',
    inputSchema: z.object({ id: z.string().min(4).max(90) })
  }, wrap(async ({ id }) => {
    const { job, revision } = await getJob(id);
    const { calculate, projectCommercial, scheduleForecast } = await import('./.engine.mjs');
    const totals = calculate(job);
    const commercial = projectCommercial(job, totals);
    const schedule = scheduleForecast(job);
    return { id, revision, title: job.title, mode: job.mode, pricingMode: commercial.mode,
      totals, commercial, schedule, flags: [
        'DRAFT DATA ONLY: prices/hours may be illustrative; never interpret as approved quote or actual net profit.',
        'Verify ROC scope, tax treatment, vendor quotes, permit/insurance, customer signoff and crew capacity.'
      ] };
  }));
  server.registerTool('pbc_compare_estimates', {
    description: 'Compare two shared jobs using the same exact deterministic estimator engine as the browser app, without any AI API calls.',
    inputSchema: z.object({ firstId: z.string().min(4).max(90), secondId: z.string().min(4).max(90) })
  }, wrap(async ({ firstId, secondId }) => {
    const [a,b] = await Promise.all([getJob(firstId), getJob(secondId)]);
    const { calculate, projectCommercial } = await import('./.engine.mjs');
    const commercial = job => projectCommercial(job, calculate(job));
    const one = commercial(a.job), two = commercial(b.job);
    return { first: { id: firstId, title: a.job.title, total: one.total, estimatedProfit: one.projectedProfit },
      second: { id: secondId, title: b.job.title, total: two.total, estimatedProfit: two.projectedProfit },
      delta: { total: Number((two.total-one.total).toFixed(2)), estimatedProfit: Number((two.projectedProfit-one.projectedProfit).toFixed(2)) },
      note: 'Comparison is scenario math, NOT a recommendation or approved price.' };
  }));
  server.registerTool('pbc_compare_supplier_quotes', {
    description: 'Compare entered supplier quotes for a particular selection using confirmed exact-spec status, validity, quantity and delivered cost. Does not query live supplier pricing.',
    inputSchema: z.object({ id: z.string().min(4).max(90), selectionId: z.string().min(1).max(90) })
  }, wrap(async ({ id, selectionId }) => {
    const { job } = await getJob(id);
    const selection = (job.selections || []).find(x => x.id === selectionId);
    if (!selection) throw new Error('Unknown selection');
    const { compareSupplierQuotes } = await import('./.engine.mjs');
    return { selection: { name: selection.name, spec: selection.spec },
      comparison: compareSupplierQuotes(selection, job.supplierQuotes || []),
      note: 'Comparison uses user-entered, unverified quotes. Check actual vendor documentation before purchasing.' };
  }));
  return server;
});
