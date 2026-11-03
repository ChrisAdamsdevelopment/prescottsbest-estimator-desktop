import { readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { checkApprovalReplies } from './approval-check.mjs';
import { emailAttachments, importAttachment } from './email-attachments.mjs';

const driveScope = 'https://www.googleapis.com/auth/drive.file';
const sendScope = 'https://www.googleapis.com/auth/gmail.send';
const readScope = 'https://www.googleapis.com/auth/gmail.readonly';
const statePath = process.env.PBC_WORKSPACE_PATH || join(dirname(fileURLToPath(import.meta.url)), '.google-workspaces.json');
const ROOT = 'Prescotts Best Construction - Project Records';
const FOLDERS = [
  ['subcontractors','Subcontractor Bids - Internal'],
  ['suppliers','Supplier Quotes - Internal'],
  ['estimates','Estimates and Revisions - Internal'],
  ['records','Job Costs, Receipts and Contracts - Internal'],
  ['photos','Site Documentation - Internal'],
  ['memory','Project Memory - Internal'],
  ['client','Customer Review - Selected Documents ONLY']
];
const emailRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const newState = () => ({ version:1, rootId:null, projects:{}, outbox:{}, approvals:{}, audit:[] });
async function state() {
  try { const d=JSON.parse(await readFile(statePath,'utf8')); if(d.version !== 1) throw Error('Unexpected workspace data version'); return d; }
  catch(e) { if(e.code === 'ENOENT') return newState(); throw e; }
}
async function persist(s) {
  const temp = statePath+'.tmp';
  await writeFile(temp, JSON.stringify(s,null,2), {mode:0o600});
  await rename(temp,statePath);
}
function audit(s, action, id, meta={}) {
  s.audit.push({at:new Date().toISOString(),action,id,...meta});
  if(s.audit.length>2000) s.audit.splice(0,s.audit.length-2000);
}
async function body(req, limit=50000) {
  let n=0, parts=[];
  for await(const b of req) {n+=b.length;if(n>limit)throw Error('Request too large');parts.push(b);}
  const x=JSON.parse(Buffer.concat(parts).toString('utf8'));
  if(!x || typeof x !== 'object' || Array.isArray(x))throw Error('Invalid request');
  return x;
}
async function googleRequest(token, path, {method='GET', data, binary, mime}={}) {
  const r=await fetch('https://www.googleapis.com/'+path, {method,
    headers:{Authorization:'Bearer '+token,...(data ? {'Content-Type':'application/json'}:{}),...(mime ? {'Content-Type':mime}:{})},
    body: data ? JSON.stringify(data) : binary,
    signal:AbortSignal.timeout(25000)});
  const text=await r.text();
  if(!r.ok)throw Error('Google '+r.status+' '+(text.includes('insufficient') ? 'insufficient OAuth scope' : 'API request failed'));
  return text ? JSON.parse(text) : {};
}
async function findFolder(token,name,parent) {
  const q="name = '"+name.replace(/'/g,"\\'")+"' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"+
    (parent ? " and '"+parent+"' in parents" : '');
  const url='drive/v3/files?fields=files(id,name,webViewLink),nextPageToken&pageSize=25&q='+encodeURIComponent(q);
  return (await googleRequest(token,url)).files?.[0] || null;
}
async function makeFolder(token,name,parent) {
  const found=await findFolder(token,name,parent);
  if(found) return found;
  return googleRequest(token,'drive/v3/files?fields=id,name,webViewLink',{method:'POST',data:{
    name,mimeType:'application/vnd.google-apps.folder',...(parent ? {parents:[parent]}:{})
  }});
}
function projectInfo(p) { return {jobId:p.jobId,title:p.title,createdAt:p.createdAt,
  rootId:p.rootId,folderUrl:'https://drive.google.com/drive/folders/'+p.rootId,
  folders:p.folders,shares:p.shares || (p.share ? [p.share] : []),share:p.share || null}; }
export async function listWorkspaces() {
  const s=await state();
  return { projects:Object.values(s.projects).map(projectInfo), approvals:Object.values(s.approvals).map(a=>({
    id:a.id,jobId:a.jobId,email:a.email,revision:a.revision,status:a.status,createdAt:a.createdAt,receivedAt:a.receivedAt||null
  }))};
}
async function createProject(token,jobId,title) {
  if(typeof jobId !== 'string' || !/^[\w-]{4,100}$/.test(jobId))throw Error('Invalid job ID');
  if(typeof title !== 'string' || title.trim().length<3 || title.length>160)throw Error('Invalid job title');
  const s=await state();
  if(s.projects[jobId])return {project:projectInfo(s.projects[jobId]),existing:true};
  const root=await makeFolder(token,ROOT,null);
  s.rootId=root.id;
  // Unique job ID in folder title prevents accidental collision between identically named jobs.
  const jobFolder=await makeFolder(token,title.trim().replace(/[\\/:*?"<>|]/g,'-')+' - '+jobId.slice(0,12),root.id);
  const folders={};
  for(const [key,name] of FOLDERS) {
    const folder=await makeFolder(token,name,jobFolder.id);
    folders[key]={id:folder.id,url:'https://drive.google.com/drive/folders/'+folder.id};
  }
  const p={jobId,title:title.trim(),createdAt:new Date().toISOString(),rootId:jobFolder.id,folders,shares:[],share:null};
  s.projects[jobId]=p;
  audit(s,'workspace_created',jobId);
  await persist(s);
  return {project:projectInfo(p),existing:false};
}
async function uploadDocument(token,input) {
  const {jobId,folderKey,name,contentBase64,mimeType}=input;
  const s=await state(), project=s.projects[jobId];
  if(!project)throw Error('First create a Drive workspace for this job');
  if(!project.folders[folderKey])throw Error('Unknown destination folder');
  if(typeof name!=='string'||name.length<2||name.length>180||/[\\/\x00-\x1F]/.test(name))throw Error('Invalid file name');
  const supported=['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','text/csv'];
  if(!supported.includes(mimeType))throw Error('Unsupported file format');
  if(typeof contentBase64!=='string'||contentBase64.length>11_000_000)throw Error('File too large (maximum 8 MB)');
  const binary=Buffer.from(contentBase64,'base64');
  if(binary.length<1||binary.length>8_000_000)throw Error('File cannot be empty or exceed 8 MB');
  const boundary='pbc-'+randomUUID().replace(/-/g,'');
  const meta={name,parents:[project.folders[folderKey].id]};
  const payload=Buffer.concat([
    Buffer.from('--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+boundary+'\r\nContent-Type: '+mimeType+'\r\n\r\n'),
    binary,Buffer.from('\r\n--'+boundary+'--')]);
  const result=await googleRequest(token,'upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,mimeType,size',
    {method:'POST',binary:payload,mime:'multipart/related; boundary='+boundary});
  audit(s,'document_uploaded',jobId,{fileId:result.id,folderKey});
  await persist(s);
  return {id:result.id,name:result.name,folderKey,url:result.webViewLink||'https://drive.google.com/file/d/'+result.id+'/view'};
}
async function shareReview(token,{jobId,email,confirmed}) {
  if(confirmed!==true)throw Error('You must confirm the exact recipient before sharing');
  if(typeof email !== 'string'||!emailRegex.test(email)||email.length>240)throw Error('Invalid recipient email');
  const s=await state(),p=s.projects[jobId];if(!p)throw Error('Unknown job');
  const shares=p.shares || (p.share ? [p.share] : []);
  if(shares.some(row=>row.email.toLowerCase()===email.toLowerCase()))return {alreadyShared:true,share:shares.find(row=>row.email.toLowerCase()===email.toLowerCase())};
  const id=p.folders.client.id;
  await googleRequest(token,'drive/v3/files/'+encodeURIComponent(id)+'/permissions?sendNotificationEmail=false&fields=id',
    {method:'POST',data:{type:'user',role:'reader',emailAddress:email}});
  p.share={email,permission:'reader',folderId:id,url:p.folders.client.url,sharedAt:new Date().toISOString()};
  p.shares=[...shares,p.share];
  audit(s,'client_folder_shared',jobId,{recipient:email});
  await persist(s);
  return {alreadyShared:false,share:p.share};
}
function cleanText(v,max,label) {
  if(typeof v!=='string'||!v.trim()||v.length>max||/[\x00-\x08\x0B-\x1F]/.test(v))throw Error('Invalid '+label);
  return v.trim();
}
function rawMessage({to,subject,text}) {
  if(!emailRegex.test(to)||to.length>240)throw Error('Invalid recipient');
  if(/[\r\n]/.test(subject))throw Error('Email subject must be one line');
  const header='To: '+to+'\r\nSubject: =?UTF-8?B?'+Buffer.from(subject).toString('base64')+'?=\r\n'+
    'MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n';
  return Buffer.from(header+Buffer.from(text,'utf8').toString('base64')).toString('base64url');
}
async function sendApprovedEmail(token,input) {
  const {jobId,to,subject,text,confirmed,requestId,approvalRevision}=input;
  if(confirmed!==true)throw Error('Review and confirm the exact email before sending');
  const cleanSubject=cleanText(subject,180,'subject');
  const cleanBody=cleanText(text,12000,'message');
  const rev=approvalRevision ? cleanText(approvalRevision,80,'revision') : null;
  const outgoingText=rev ? cleanBody+'\n\nAPPROVAL REQUEST - revision '+rev+'\n'+
    'To approve this exact revision, reply with a new FIRST line:\nAPPROVE PBCAPP-'+requestId+'\n'+
    'We will record the reply for contractor review. An emailed reply is not a verified digital signature.' : cleanBody;
  if(!emailRegex.test(to))throw Error('Invalid recipient');
  if(typeof requestId!=='string'||!/^[a-f0-9-]{36}$/.test(requestId))throw Error('Missing idempotency key');
  const s=await state(),p=s.projects[jobId];if(!p)throw Error('Create a project workspace first');
  const shares=p.shares || (p.share ? [p.share] : []);
  if(!shares.some(row=>row.email.toLowerCase()===to.toLowerCase()))
    throw Error('Share the customer-review folder with this exact recipient before sending its link.');
  if(s.outbox[requestId])return {alreadySent:s.outbox[requestId].status==='sent',...s.outbox[requestId]};
  // State is persisted before network delivery so retries cannot duplicate an uncertain send.
  s.outbox[requestId]={status:'sending',jobId,to,at:new Date().toISOString()};
  await persist(s);
  try {
    const result=await googleRequest(token,'gmail/v1/users/me/messages/send',
      {method:'POST',data:{raw:rawMessage({to,subject:cleanSubject,text:outgoingText})}});
    s.outbox[requestId]={status:'sent',jobId,to,at:new Date().toISOString(),messageId:result.id,threadId:result.threadId};
    if(approvalRevision) {
      const a={id:requestId,jobId,email:to,revision:rev,status:'awaiting-reply',createdAt:new Date().toISOString(),messageId:result.id,threadId:result.threadId};
      s.approvals[requestId]=a;
    }
    audit(s,'operator_approved_email_sent',jobId,{to,messageId:result.id});
    await persist(s);
    return {alreadySent:false,...s.outbox[requestId],approvalRequested:Boolean(approvalRevision),approvalReference:rev?'PBCAPP-'+requestId:null};
  } catch(e) {
    s.outbox[requestId].status='unconfirmed';
    await persist(s);
    throw Error('Delivery outcome unconfirmed; check Sent Gmail before retrying. '+e.message);
  }
}
async function reviewApproval({id,jobId,reviewNote,confirmed}) {
  if(confirmed!==true)throw Error('Contractor review confirmation required');
  if(typeof id!=='string'||!/^[-a-f0-9]{36}$/.test(id))throw Error('Invalid approval request');
  const note=cleanText(reviewNote,1000,'review note');
  const s=await state(),a=s.approvals[id];
  if(!a||a.jobId!==jobId)throw Error('Approval request not found for job');
  if(a.status!=='reply-received')throw Error('No qualifying customer reply has been recorded for this revision');
  a.status='contractor-reviewed';a.reviewedAt=new Date().toISOString();a.reviewNote=note;
  audit(s,'contractor_reviewed_reply_evidence',jobId,{approvalId:id});
  await persist(s);
  return {id,jobId,revision:a.revision,status:a.status,reviewedAt:a.reviewedAt,
    note:'Reviewed email evidence only; this does not create a signed contract or final acceptance.'};
}
// Serialize state-changing operations inside this local server to avoid conflicting file snapshots.
let operationTail=Promise.resolve();
async function serialized(fn) {
  let release;
  const next=new Promise(resolve=>{release=resolve;});
  const previous=operationTail; operationTail=next;
  await previous;
  try { return await fn(); } finally { release(); }
}
export async function handleWorkspace(req,res,path,send,googleToken) {
  try {
    if(req.method==='GET'&&path==='/api/google/workspace/list')return send(res,200,await listWorkspaces());
    if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
    const input=await body(req,path.endsWith('/upload') ? 12_000_000 : 35_000);
    if(path==='/api/google/workspace/create')
      return send(res,200,await serialized(async()=>createProject(await googleToken([driveScope]),input.jobId,input.title)));
    if(path==='/api/google/workspace/upload')
      return send(res,200,await serialized(async()=>uploadDocument(await googleToken([driveScope]),input)));
    if(path==='/api/google/workspace/share')
      return send(res,200,await serialized(async()=>shareReview(await googleToken([driveScope]),input)));
    if(path==='/api/google/workspace/email/attachments')
      return send(res,200,await emailAttachments(await googleToken([readScope]),input.messageId,googleRequest));
    if(path==='/api/google/workspace/email/import')
      return send(res,200,await serialized(async()=>importAttachment(await googleToken([readScope,driveScope]),input,googleRequest,uploadDocument)));
    if(path==='/api/google/workspace/approvals/check')
      return send(res,200,await serialized(async()=>checkApprovalReplies(await googleToken([readScope]),await state(),googleRequest,audit,persist)));
    if(path==='/api/google/workspace/approvals/review')
      return send(res,200,await serialized(async()=>reviewApproval(input)));
    if(path==='/api/google/workspace/send')
      return send(res,200,await serialized(async()=>sendApprovedEmail(await googleToken([sendScope]),input)));
    return send(res,404,{error:'Unknown workspace action'});
  } catch(e) {return send(res,400,{error:e.message||'Google workspace action failed'});}
}
