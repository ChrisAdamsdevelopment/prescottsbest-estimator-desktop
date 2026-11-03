import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
const repo=resolve(import.meta.dirname,'../../PBC_BID_PORTAL');
const tmp=await mkdtemp(join(tmpdir(),'pbc-mcp-hosted-'));
const port=19144,key='test-only-not-a-real-secret-0123456789abcdef';
const child=spawn(process.execPath,[join(repo,'server.mjs')],{cwd:repo,env:{
 ...process.env,PORT:String(port),DATA_DIR:tmp,PORTAL_ADMIN_KEY:key},stdio:'ignore'});
try{
 for(let i=0;i<80;i++){
  try{const r=await fetch('http://127.0.0.1:'+port+'/healthz');if(r.ok)break;}catch{}
  await pause(90);
 }
 process.env.PBC_PORTAL_URL='http://127.0.0.1:'+port;
 process.env.PBC_PORTAL_ADMIN_KEY=key;
 process.env.PBC_MCP_ENABLE_WRITES='1';
 const client=await import('../server/portal-client.mjs');
 const proposal=JSON.parse(await readFile(join(repo,'examples','demo-proposal.json'),'utf8'));
 const before=await client.portalStatus();
 assert.deepEqual(before.proposals,[]);
 const pub=await client.portalPublish({jobId:'synthetic-garage-001',ownerApproved:true,
 confirmation:'PUBLISH REVIEWED PROPOSAL',proposal});
 assert.equal(pub.published,true);
 assert.ok(pub.privateCustomerLink.includes('#/invite/'));
 const after=await client.portalStatus();
 assert.equal(after.proposals.length,1);
 assert.equal(after.proposals[0].status,'sent');
 const revoked=await client.portalRevoke(pub.proposalId,true);
 assert.equal(revoked.revoked,true);
 assert.equal((await client.portalStatus()).proposals[0].status,'revoked');
 console.log('PASS PBC local MCP portal client: HTTPS-safe URL configuration, approved synthetic publish, status and explicit revoke. No external hosting or emails.');
}finally{
 child.kill();await pause(130);await rm(tmp,{recursive:true,force:true});
}
