import { useEffect, useState } from 'react';
import { allJobs } from './storage';
import type { Job } from './types';

type Folder = { id:string; url:string };
type Project = { jobId:string; title:string; rootId:string; folderUrl:string;
  folders:Record<string,Folder>; share?:{email:string;url:string;sharedAt:string}|null;
  shares?:Array<{email:string;url:string;sharedAt:string}> };
type Approval = {id:string;jobId:string;email:string;revision:string;status:string;createdAt:string;receivedAt?:string;reviewedAt?:string};
type MailResult={id:string;subject:string;from:string;date:string;snippet:string};
type MailAttachment={filename:string;attachmentId:string|null;size:number;supported:boolean;inline:boolean};
const folderLabels:Record<string,string> = {
  subcontractors:'Subcontractor bids (private)',suppliers:'Supplier quotes (private)',
  estimates:'Estimates and revisions (private)', records:'Receipts and job costs (private)',
  photos:'Site documentation (private)',memory:'Project memory (private)',
  client:'Customer review (share only selected documents)'
};
async function api(path:string, token:string, payload?:unknown) {
  const r=await fetch('/api/google/workspace/'+path,{
    method:payload===undefined?'GET':'POST',
    headers:{'X-Estimator-Token':token,'Content-Type':'application/json'},
    ...(payload===undefined?{}:{body:JSON.stringify(payload)})
  });
  const value=await r.json();
  if(!r.ok)throw Error(value.error||'Workspace request failed');
  return value;
}
function asBase64(file:File):Promise<string> {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');
    reader.onerror=()=>reject(Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
}
export function GoogleWorkspacePanel({token}:{token:string}) {
  const [jobs,setJobs]=useState<Job[]>([]);
  const [projects,setProjects]=useState<Project[]>([]);
  const [approvals,setApprovals]=useState<Approval[]>([]);
  const [jobId,setJobId]=useState('');
  const [folder,setFolder]=useState('subcontractors');
  const [file,setFile]=useState<File|null>(null);
  const [recipient,setRecipient]=useState('');
  const [subject,setSubject]=useState('');
  const [message,setMessage]=useState('');
  const [revision,setRevision]=useState('Revision 1');
  const [approvalRequested,setApprovalRequested]=useState(false);
  const [checkedShare,setCheckedShare]=useState(false);
  const [checkedSend,setCheckedSend]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const [mailQuery,setMailQuery]=useState('newer_than:30d (bid OR quote OR estimate)');
  const [mailResults,setMailResults]=useState<MailResult[]>([]);
  const [selectedMessage,setSelectedMessage]=useState('');
  const [mailAttachments,setMailAttachments]=useState<MailAttachment[]>([]);
  const [mailBody,setMailBody]=useState('');
  const [mailSender,setMailSender]=useState('');
  const [selectedAttachment,setSelectedAttachment]=useState('');
  const [checkedImport,setCheckedImport]=useState(false);
  async function refresh() {
    if(token.length<16)return;
    try {
      const value=await api('list',token);
      setProjects(value.projects||[]);
      setApprovals(value.approvals||[]);
    } catch(e) {setNotice(e instanceof Error?e.message:'Unable to load workspace');}
  }
  useEffect(()=>{void allJobs().then(list=>{setJobs(list);setJobId(id=>id||list[0]?.id||'');});},[]);
  useEffect(()=>{void refresh();},[token]);
  const current=jobs.find(j=>j.id===jobId);
  const project=projects.find(p=>p.jobId===jobId);
  async function run(fn:()=>Promise<string>) {
    setBusy(true);setNotice('');
    try {setNotice(await fn());await refresh();}
    catch(e) {setNotice(e instanceof Error?e.message:'Action failed');}
    finally {setBusy(false);}
  }
  function changeJob(id:string) {
    setJobId(id);setCheckedShare(false);setCheckedSend(false);setRequestId(crypto.randomUUID());
    const j=jobs.find(x=>x.id===id);
    if(j) {setSubject('Prescotts Best Construction - '+j.title);setMessage('Please review the documents for '+j.title+'.\n\nWe are available to answer questions about the estimate and scope.');}
  }
  async function create() {
    if(!current||!window.confirm('Create private Google Drive project folders for "'+current.title+'"?'))return;
    await run(async()=>{
      const r=await api('create',token,{jobId:current.id,title:current.title});
      return r.existing?'Drive folders already exist.':'Private Drive project folders created.';
    });
  }
  async function upload() {
    if(!file||!project)return;
    if(folder==='client'&&!window.confirm('You selected CUSTOMER REVIEW. Confirm that this document is approved for the customer to see.'))return;
    await run(async()=>{
      const contentBase64=await asBase64(file);
      const r=await api('upload',token,{jobId,folderKey:folder,name:file.name,mimeType:file.type||'application/octet-stream',contentBase64});
      setFile(null);
      return 'Uploaded '+r.name+' to '+folderLabels[folder]+'.';
    });
  }
  async function share() {
    if(!project||!recipient||!checkedShare)return;
    if(!window.confirm('Share ONLY the Customer Review folder with '+recipient+' as a Google Drive reader?'))return;
    await run(async()=>{
      const r=await api('share',token,{jobId,email:recipient,confirmed:true});
      return r.alreadyShared?'This recipient already has the recorded folder permission.':'Customer-review folder shared with '+recipient+'.';
    });
    setCheckedShare(false);
  }
  async function send() {
    if(!project||!checkedSend||!recipient)return;
    const body=message.trim()+'\n\nCustomer review folder: '+project.folders.client.url;
    if(!window.confirm('SEND email to '+recipient+' now?\n\nSubject: '+subject+'\n\n'+body.slice(0,350)))return;
    await run(async()=>{
      const r=await api('send',token,{jobId,to:recipient,subject,text:body,confirmed:true,requestId,
        approvalRevision:approvalRequested?revision:''});
      setCheckedSend(false);
      setRequestId(crypto.randomUUID());
      return r.status==='sent'? (r.alreadySent?'Email was already sent; no duplicate was sent.':
        'Gmail sent the message to '+recipient+(r.approvalRequested?'. Approval reference: '+r.approvalReference:'')) :
        'Previous send is unconfirmed. Check Gmail Sent; do not resend without verifying.';
    });
  }
  async function searchBidMail() {
    await run(async()=>{
      const result=await fetch('/api/google/gmail/search',{method:'POST',headers:{'X-Estimator-Token':token,'Content-Type':'application/json'},body:JSON.stringify({query:mailQuery})});
      const data=await result.json();if(!result.ok)throw Error(data.error||'Gmail search failed');
      setMailResults(data.results||[]);return 'Found '+(data.results?.length||0)+' recent messages. No attachments were imported.';
    });
  }
  async function viewAttachments(id:string) {
    setSelectedMessage(id);setSelectedAttachment('');setCheckedImport(false);setMailBody('');setMailSender('');
    await run(async()=>{const d=await api('email/attachments',token,{messageId:id});
      setMailAttachments(d.files||[]);setMailBody(d.bodyText||'No plain-text body available.');setMailSender(d.sender||'');
      return 'Opened email: '+(d.files?.length||0)+' attachments. Body is displayed as text only.';});
  }
  async function importBid() {
    if(!project||!selectedMessage||!selectedAttachment||!checkedImport)return;
    if(!window.confirm('Import the selected email attachment into this job\'s PRIVATE '+folderLabels[folder]+' folder?'))return;
    await run(async()=>{const r=await api('email/import',token,{jobId,folderKey:folder,messageId:selectedMessage,
      attachmentId:selectedAttachment,confirmed:true});setCheckedImport(false);
      return 'Filed '+r.name+' from Gmail in this private job folder.';});
  }
  async function checkReplies() {
    await run(async()=>{
      const r=await api('approvals/check',token,{});
      return 'Checked '+r.results.length+' pending approval requests. Replies received remain evidence awaiting contractor review.';
    });
  }
  async function reviewReply(a:Approval) {
    const note=window.prompt('Contractor review note: what did you verify about this reply and revision?');
    if(!note||note.trim().length<4)return;
    if(!window.confirm('Record review of email evidence for '+a.revision+'? This is NOT a signed contract or final acceptance.'))return;
    await run(async()=>{
      await api('approvals/review',token,{id:a.id,jobId:a.jobId,reviewNote:note.trim(),confirmed:true});
      return 'Contractor review logged. Written agreement/identity confirmation remains separate.';
    });
  }
  return <section className="panel google-workspace-panel">
    <div className="panel-head"><div><span className="eyebrow dark">PROJECT OPERATIONS / GOOGLE</span><h2>Drive project records & Gmail delivery</h2></div></div>
    <p className="ai-help">Use an existing saved estimate to build its private Drive filing system. Nothing is uploaded, shared, or emailed without an explicit action and recipient review. The customer folder is separate from internal costing.</p>
    <label className="field-label">Choose an estimate
      <select value={jobId} onChange={e=>changeJob(e.target.value)}>
        <option value="">Select a saved job</option>
        {jobs.map(j=><option key={j.id} value={j.id}>{j.title||'Untitled job'} ({j.mode})</option>)}
      </select>
    </label>
    {!jobs.length&&<p className="ai-help">Save an estimate on the dashboard first; then return here.</p>}
    <div className="ai-actions">
      <button className="primary-button" disabled={busy||!current||!token} onClick={create}>{project?'Folder already created':'Create private project folders'}</button>
      <button className="secondary-button" disabled={busy||!token} onClick={()=>void refresh()}>Refresh project records</button>
    </div>
    {project&&<>
      <p className="ai-help">Project Drive: <a href={project.folderUrl} target="_blank" rel="noopener noreferrer">Open project record</a></p>
      <div className="workspace-folders">
        {Object.entries(project.folders).map(([key,value])=>
          <a key={key} href={value.url} target="_blank" rel="noopener noreferrer">{folderLabels[key]||key}</a>)}
      </div>
      <div className="divider-line"/>
      <h3>Upload a bid, estimate, receipt or project memory</h3>
      <label className="field-label">Destination folder
        <select value={folder} onChange={e=>setFolder(e.target.value)}>
          {Object.keys(project.folders).map(key=><option key={key} value={key}>{folderLabels[key]||key}</option>)}
        </select>
      </label>
      <label className="field-label">Document (PDF, image, Word, Excel or text; max 8 MB)
        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.txt,.csv" onChange={e=>setFile(e.target.files?.[0]||null)}/>
      </label>
      <button className="secondary-button" disabled={busy||!file} onClick={upload}>Upload document to selected Drive folder</button>
      <div className="divider-line"/>
      <h3>File a subcontractor bid received in Gmail</h3>
      <p className="ai-help">Search only when you choose. Select a message and attachment, review its sender, and explicitly import it into a PRIVATE job folder. No inbox-wide automatic copying.</p>
      <label className="field-label">Search query<input value={mailQuery} maxLength={250} onChange={e=>setMailQuery(e.target.value)}/></label>
      <button className="secondary-button" disabled={busy} onClick={searchBidMail}>Search Gmail for bids</button>
      {mailResults.length>0&&<label className="field-label">Matching emails
        <select value={selectedMessage} onChange={e=>{void viewAttachments(e.target.value);}}>
          <option value="">Select a message</option>
          {mailResults.map(m=><option key={m.id} value={m.id}>{m.subject||'(No subject)'} — {m.from}</option>)}
        </select>
      </label>}
      {selectedMessage&&<div className="workspace-mail-preview"><strong>From: {mailSender}</strong><pre>{mailBody}</pre></div>}
      {mailAttachments.length>0&&<label className="field-label">Attachment to import
        <select value={selectedAttachment} onChange={e=>{setSelectedAttachment(e.target.value);setCheckedImport(false);}}>
          <option value="">Select an attachment</option>
          {mailAttachments.filter(a=>a.supported).map(a=><option key={a.attachmentId||a.filename} value={a.attachmentId||'inline:'+a.filename}>{a.filename} ({Math.round(a.size/1024)} KB)</option>)}
        </select>
      </label>}
      {selectedAttachment&&<label className="ai-checkbox"><input type="checkbox" checked={checkedImport} onChange={e=>setCheckedImport(e.target.checked)}/> I verified the sender, attachment, and job folder.</label>}
      {selectedAttachment&&<button className="secondary-button" disabled={busy||!checkedImport||!['subcontractors','suppliers','estimates','records'].includes(folder)} onClick={importBid}>Import attachment into private job folder</button>}
      <div className="divider-line"/>
      <h3>Share customer-approved documents</h3>
      <p className="ai-help">Only Customer Review is shared; internal bids, receipts, pricing notes, and project memory stay private unless deliberately copied there.</p>
      <label className="field-label">Customer email<input type="email" value={recipient} onChange={e=>{setRecipient(e.target.value);setCheckedShare(false);setCheckedSend(false);}} placeholder="customer@example.com"/></label>
      <label className="ai-checkbox"><input type="checkbox" checked={checkedShare} onChange={e=>setCheckedShare(e.target.checked)}/> I reviewed the recipient and the files in Customer Review.</label>
      <button className="secondary-button" disabled={busy||!checkedShare||!recipient} onClick={share}>Share customer-review folder (reader)</button>
      {(project.shares|| (project.share?[project.share]:[])).map(s=><p key={s.email} className="ai-help">Reader access: {s.email} · <a href={s.url} target="_blank" rel="noopener noreferrer">Customer review folder</a></p>)}
      <div className="divider-line"/>
      <h3>Compose an email with the customer-review link</h3>
      <label className="field-label">Subject<input value={subject} maxLength={180} onChange={e=>{setSubject(e.target.value);setCheckedSend(false);}}/></label>
      <label className="field-label">Message<textarea rows={5} value={message} onChange={e=>{setMessage(e.target.value);setCheckedSend(false);}} maxLength={10000}/></label>
      <p className="ai-help">The customer-review folder link will be appended. Upload and share the customer files before sending.</p>
      <label className="ai-checkbox"><input type="checkbox" checked={approvalRequested} onChange={e=>{setApprovalRequested(e.target.checked);setCheckedSend(false);}}/> Request approval of a specific revision by email reply</label>
      {approvalRequested&&<label className="field-label">Revision<input value={revision} maxLength={80} onChange={e=>{setRevision(e.target.value);setCheckedSend(false);}}/></label>}
      <label className="ai-checkbox"><input type="checkbox" checked={checkedSend} onChange={e=>setCheckedSend(e.target.checked)}/> I have reviewed the recipient and message, and authorize sending.</label>
      <button className="primary-button" disabled={busy||!checkedSend||!recipient||!subject||!message||!(project.shares||(project.share?[project.share]:[])).some(s=>s.email.toLowerCase()===recipient.toLowerCase())} onClick={send}>Send through Gmail</button>
      <p className="ai-help">Email replies provide evidence for review; they are not a verified digital signature.</p>
    </>}
    {approvals.length>0&&<div className="workspace-approvals">
      <div className="divider-line"/><h3>Approval requests</h3>
      {approvals.filter(a=>!jobId||a.jobId===jobId).map(a=><div key={a.id} className="workspace-approval-row"><p className="ai-help">{a.email} · {a.revision} · {a.status} {a.receivedAt?'('+new Date(a.receivedAt).toLocaleString()+')':''}</p>{a.status==='reply-received'&&<button className="secondary-button" disabled={busy} onClick={()=>reviewReply(a)}>Record contractor review</button>}</div>)}
      <button className="secondary-button" disabled={busy} onClick={checkReplies}>Check Gmail for approval replies</button>
    </div>}
    {notice&&<p className="ai-help" role="status">{notice}</p>}
  </section>;
}
