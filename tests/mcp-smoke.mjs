import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const root = fileURLToPath(new URL('../', import.meta.url));
const folder = await mkdtemp(join(tmpdir(), 'pbc-mcp-'));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(root, 'scripts', 'mcp-launch.mjs')],
  env: { ...process.env, PBC_BRIDGE_PATH: join(folder, 'bridge.json'), PBC_WORKSPACE_PATH: join(folder, 'workspace.json'), PBC_VISUAL_ROOT: join(folder,'visuals'), PBC_PROJECT_ROOT: folder, PBC_MCP_ENABLE_WRITES: '1' }
});
const client = new Client({ name: 'pbc-integration-test', version: '1.0.0' });
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  for (const name of ['pbc_status', 'pbc_list_jobs', 'pbc_get_job', 'pbc_create_draft', 'pbc_add_draft_observation', 'pbc_estimate_summary', 'pbc_compare_estimates', 'pbc_compare_supplier_quotes', 'pbc_google_permissions', 'pbc_google_workspaces', 'pbc_gmail_search', 'pbc_gmail_read', 'pbc_photo_visuals', 'pbc_photo_visual_image', 'pbc_photo_visual_brief', 'pbc_photo_visual_import_local', 'pbc_portal_status', 'pbc_portal_leads', 'pbc_portal_publish_reviewed', 'pbc_portal_revoke']) {
    assert.ok(tools.some(t => t.name === name), 'Missing MCP tool ' + name);
  }
  const ws = await client.callTool({ name:'pbc_google_workspaces', arguments:{} });
  assert.equal(JSON.parse(ws.content[0].text).projects.length,0);
  const before = await client.callTool({ name: 'pbc_status', arguments: {} });
  assert.equal(JSON.parse(before.content[0].text).total, 0);
  const made = await client.callTool({ name: 'pbc_create_draft', arguments: {
    title: 'Synthetic MCP basement remodel', mode: 'remodel', scope: 'Test only; do not quote'
  } });
  assert.ok(!made.isError, JSON.stringify(made));
  const draft = JSON.parse(made.content[0].text);
  const fetched = await client.callTool({ name: 'pbc_get_job', arguments: { id: draft.id } });
  assert.equal(JSON.parse(fetched.content[0].text).job.status, 'draft');
  const calculated = await client.callTool({ name: 'pbc_estimate_summary', arguments: { id: draft.id } });
  assert.equal(JSON.parse(calculated.content[0].text).totals.total, 0);
  const compared = await client.callTool({ name: 'pbc_compare_estimates', arguments: { firstId: draft.id, secondId: draft.id } });
  assert.equal(JSON.parse(compared.content[0].text).delta.total, 0);
  const observed = await client.callTool({ name: 'pbc_add_draft_observation', arguments: {
    id: draft.id, note: 'Photo appears to show demo area; no dimensions can be confirmed.', expectedRevision: 1
  } });
  assert.equal(JSON.parse(observed.content[0].text).revision, 2);
  const localFile=join(folder,'real-photo.png');
  await writeFile(localFile,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64'));
  const savedVisual=await client.callTool({name:'pbc_photo_visual_import_local',arguments:{
    jobId:draft.id,kind:'before',label:'Site condition photo',path:localFile,notes:'Test photo only',
    choices:{trim:'white casing'}
  }});
  assert.ok(!savedVisual.isError,JSON.stringify(savedVisual));
  const record=JSON.parse(savedVisual.content[0].text);
  const visualList=await client.callTool({name:'pbc_photo_visuals',arguments:{jobId:draft.id}});
  assert.equal(JSON.parse(visualList.content[0].text).records.length,1);
  const visualImage=await client.callTool({name:'pbc_photo_visual_image',arguments:{id:record.id}});
  assert.ok(visualImage.content.some(x=>x.type==='image'&&x.mimeType==='image/png'));
  const brief=await client.callTool({name:'pbc_photo_visual_brief',arguments:{jobId:draft.id,kind:'after',
    label:'Door finish',notes:'Use original site photo',choices:{door:'white steel'}}});
  assert.ok(JSON.parse(brief.content[0].text).prompt.includes('original site photo'));
  console.log('PASS: MCP initialization, estimating tools, local photo import, image retrieval, design brief, and write gate.');
} finally { await client.close(); await rm(folder, { recursive: true, force: true }); }
