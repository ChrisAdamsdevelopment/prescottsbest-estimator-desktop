import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const folder = await mkdtemp(join(tmpdir(), 'pbc-google-mock-'));
process.env.PBC_WORKSPACE_PATH = join(folder, 'workspace.json');
const calls = [];
let lastSend, approvalId, approvalThread;
const responder = value => ({ ok:true,status:200,text:async()=>JSON.stringify(value) });
globalThis.fetch = async (input, options={}) => {
  const u=new URL(String(input)); const path=u.pathname; const method=options.method||'GET';
  calls.push({path,method});
  if(path==='/drive/v3/files' && method==='GET')return responder({files:[]});
  if(path==='/drive/v3/files' && method==='POST')return responder({id:'folder'+calls.length,name:'mock folder'});
  if(path.endsWith('/permissions'))return responder({id:'permission'+calls.length});
  if(path==='/upload/drive/v3/files')return responder({id:'uploaded'+calls.length,name:'mock test file',mimeType:'application/pdf'});
  if(path==='/gmail/v1/users/me/messages/send') {
    lastSend=JSON.parse(options.body);
    return responder({id:'sent001',threadId:'thread001'});
  }
  if(path==='/gmail/v1/users/me/messages')return responder({messages:[{id:'incoming1'}]});
  if(path==='/gmail/v1/users/me/messages/incoming1')return responder({id:'incoming1',threadId:approvalThread,
    payload:{headers:[{name:'From',value:'Customer <customer@example.com>'}],
      mimeType:'text/plain',body:{data:Buffer.from('APPROVE PBCAPP-'+approvalId+'\nPlease proceed.').toString('base64url')}}});
  if(path==='/gmail/v1/users/me/messages/fakeemail001')return responder({
    id:'fakeemail001',payload:{headers:[{name:'From',value:'Sub <vendor@example.com>'},{name:'Subject',value:'Bid'}],
      parts:[{filename:'proposal.pdf',mimeType:'application/pdf',body:{attachmentId:'att00123',size:12}},
        {mimeType:'text/html',body:{data:Buffer.from('<p>Example <b>bid</b> text</p>').toString('base64url')}}]}});
  if(path==='/gmail/v1/users/me/messages/fakeemail001/attachments/att00123')return responder({
    data:Buffer.from('SYNTHETICPDF').toString('base64url')});
  throw Error('Unexpected mocked Google API call: '+method+' '+path);
};
const {handleWorkspace}=await import('../server/google-workspace.mjs');
const scopes=['https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.readonly'];
const auth=async wanted=> {
  if(wanted.some(s=>!scopes.includes(s)))throw Error('scope missing');
  return 'FAKE_TEST_GOOGLE_TOKEN';
};
async function call(endpoint,data,token=auth) {
  const body=data===undefined?[]:[Buffer.from(JSON.stringify(data))];
  const req=Object.assign(Readable.from(body),{method:data===undefined?'GET':'POST'});
  let response;const send=(_res,status,result)=> {response={status,result};return response;};
  return handleWorkspace(req,{},'/api/google/workspace/'+endpoint,send,token);
}
try {
  const jobId='synthetic-remodel-001';
  let r=await call('create',{jobId,title:'Synthetic Cost Plus Kitchen'});
  assert.equal(r.status,200);assert.equal(r.result.existing,false);
  assert.ok(r.result.project.folders.subcontractors.id);
  assert.ok(r.result.project.folders.suppliers.id);
  assert.ok(r.result.project.folders.memory.id);
  assert.ok(r.result.project.folders.client.id);
  r=await call('create',{jobId,title:'Synthetic Cost Plus Kitchen'});
  assert.equal(r.result.existing,true);
  const before=calls.length;
  r=await call('share',{jobId,email:'customer@example.com',confirmed:false});
  assert.equal(r.status,400); assert.equal(calls.length,before);
  r=await call('share',{jobId,email:'customer@example.com',confirmed:true});
  assert.equal(r.status,200);
  r=await call('share',{jobId,email:'second@example.com',confirmed:true});
  assert.equal(r.status,200);
  r=await call('list');
  assert.equal(r.result.projects[0].shares.length,2);
  const requestId=randomUUID();
  r=await call('send',{jobId,to:'nobody@example.com',subject:'Estimate',text:'Preview',
    requestId,confirmed:true,approvalRevision:'Rev 1'});
  assert.equal(r.status,400);assert.match(r.result.error,/Share/);
  const beforeSend=calls.filter(c=>c.path.endsWith('/messages/send')).length;
  const sendInput={jobId,to:'customer@example.com',subject:'Estimate - Rev 1',text:'Please review the estimate',
    requestId,confirmed:true,approvalRevision:'Rev 1'};
  r=await call('send',sendInput);
  assert.equal(r.status,200);assert.equal(r.result.status,'sent');
  assert.equal(calls.filter(c=>c.path.endsWith('/messages/send')).length,beforeSend+1);
  assert.ok(lastSend.raw);
  approvalId=requestId;approvalThread='thread001';
  r=await call('send',sendInput);
  assert.equal(r.result.alreadySent,true);
  assert.equal(calls.filter(c=>c.path.endsWith('/messages/send')).length,beforeSend+1);
  r=await call('approvals/check',{});
  assert.equal(r.status,200);
  assert.equal(r.result.results[0].status,'reply-received');
  r=await call('approvals/review',{id:requestId,jobId,reviewNote:'Verified sender and revision separately',confirmed:true});
  assert.equal(r.result.status,'contractor-reviewed');
  r=await call('upload',{jobId,folderKey:'subcontractors',name:'bid.pdf',
    mimeType:'application/pdf',contentBase64:Buffer.from('MOCKPDF').toString('base64')});
  assert.equal(r.status,200);
  r=await call('email/attachments',{messageId:'fakeemail001'});
  assert.equal(r.result.files.length,1);
  assert.ok(r.result.bodyText.includes('Example'));
  assert.ok(r.result.bodyText.includes('bid'));
  r=await call('email/import',{jobId,folderKey:'subcontractors',messageId:'fakeemail001',
    attachmentId:'att00123',confirmed:true});
  assert.equal(r.status,200);
  console.log('PASS Google workflow mock: project folders, client isolation, explicit sharing,');
  console.log('     email idempotency, approval reply evidence, bid upload and Gmail attachment filing.');
  console.log('Mocked external API requests:',calls.length,'; real Google API requests: 0');
} finally {await rm(folder,{recursive:true,force:true});}
