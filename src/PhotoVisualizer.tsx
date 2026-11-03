import {useEffect,useState} from 'react';
import {allJobs} from './storage';
type Visual={id:string;jobId:string;label:string;kind:'before'|'after'|'reference';
  notes:string;source:string;size:number;createdAt:string;sha256:string;
  customerApproved:boolean;mimeType:string;choices:Record<string,string>;driveFile?:{id:string;url:string;at:string}};
type Option={id:string;title:string};
const initial={door:'',trim:'',paint:'',hardware:'',fixtures:'',other:''};
async function api(path:string,token:string,body?:unknown){
 const r=await fetch('/api/visuals/'+path,{method:body?'POST':'GET',headers:{
  'Content-Type':'application/json','X-Estimator-Token':token},
  ...(body?{body:JSON.stringify(body)}:{})});
 const d=await r.json();if(!r.ok)throw Error(d.error||'Photo visualizer unavailable');
 return d;
}
async function toData(file:File):Promise<string>{
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>7500000)
  throw Error('Choose a PNG/JPEG/WebP image under 7.5 MB');
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result));
  reader.onerror=()=>reject(new Error('Could not open image'));
  reader.readAsDataURL(file);
 });
}
export function PhotoVisualizer({token}:{token:string}){
 const [jobs,setJobs]=useState<Option[]>([]);
 const [jobId,setJobId]=useState('');
 const [kind,setKind]=useState<'before'|'after'|'reference'>('before');
 const [label,setLabel]=useState('Garage side-entry door');
 const [notes,setNotes]=useState('');
 const [choices,setChoices]=useState(initial);
 const [records,setRecords]=useState<Visual[]>([]);
 const [preview,setPreview]=useState<string>('');
 const [selected,setSelected]=useState('');
 const [brief,setBrief]=useState('');
 const [status,setStatus]=useState('');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{if(token.length<16)return;
   Promise.all([allJobs().catch(()=>[]),fetch('/api/bridge/jobs',{headers:{'X-Estimator-Token':token}})
    .then(r=>r.ok?r.json():{jobs:[]}).catch(()=>({jobs:[]}))]).then(([local,remote])=>{
     const options=[...local.map(j=>({id:j.id,title:j.title||'Untitled'})),
       ...(remote.jobs||[]).map((j:{id:string;title:string})=>({id:j.id,title:j.title}))];
     const distinct=Array.from(new Map(options.map(j=>[j.id,j])).values());
     setJobs(distinct);
     if(!jobId&&distinct.length)setJobId(distinct[0].id);
   }).catch(()=>setStatus('Could not load jobs from browser/bridge.'));
 },[token]);
 async function refresh(id=jobId){
   if(!id||token.length<16)return;
   try{const r=await api('list?jobId='+encodeURIComponent(id),token);
     setRecords(r.records);setStatus(r.records.length+' local visual version(s).');
   }catch(e){setStatus(String(e))}
 }
 useEffect(()=>{setSelected('');setPreview('');setBrief('');void refresh(jobId)},[jobId,token]);
 async function upload(file:File|null){
   if(!file||!jobId)return;
   setBusy(true);
   try{
     const data=await toData(file);
     const result=await api('upload',token,{jobId,kind,label,notes,choices,imageDataUrl:data});
     await refresh();setStatus('Saved '+kind+' photo '+result.id.slice(0,8)+' to private local project library.');
   }catch(e){setStatus(e instanceof Error?e.message:'Upload failed')}
   finally{setBusy(false)}
 }
 async function view(id:string){
   setBusy(true);
   try{const result=await api('image?id='+encodeURIComponent(id),token);
     setSelected(id);setPreview(result.imageDataUrl);
   }catch(e){setStatus(String(e))}
   finally{setBusy(false)}
 }
 async function prompt(){
   try{const r=await api('brief',token,{jobId,kind:'after',label,notes,choices});
     setBrief(r.prompt);await navigator.clipboard.writeText(r.prompt);
     setStatus('Design brief copied. Attach the original site photo in ChatGPT, ask for the edit, then import the finished picture here.');
   }catch(e){setStatus(e instanceof Error?e.message:'Copy blocked; use the brief text below.')}
 }
 async function publish(){
   const item=records.find(r=>r.id===selected);
   if(!item||item.kind!=='after'||!item.customerApproved)return;
   if(item.driveFile){setStatus('This version is already linked to Google Drive.');return;}
   if(!window.confirm('Upload this APPROVED design concept to the Customer Review folder for this exact project? Anyone with an existing folder share can view it. No email will be sent automatically.'))return;
   setBusy(true);
   try{
     const image=await api('image?id='+encodeURIComponent(item.id),token);
     const ext=image.imageDataUrl.startsWith('data:image/png;')?'png':image.imageDataUrl.startsWith('data:image/webp;')?'webp':'jpg';
     const fileName='PBC_Reviewed_Design_Concept_'+item.id.slice(0,8)+'.'+ext;
     const response=await fetch('/api/google/workspace/upload',{method:'POST',headers:{
       'Content-Type':'application/json','X-Estimator-Token':token},body:JSON.stringify({
       jobId:item.jobId,folderKey:'client',name:fileName,mimeType:item.mimeType,
       contentBase64:image.imageDataUrl.split(',')[1]})});
     const result=await response.json();
     if(!response.ok)throw Error(result.error||'Drive upload failed');
     await api('published',token,{id:item.id,fileId:result.id,confirmed:true});
     await refresh();setStatus('Reviewed visual uploaded to customer-review Google Drive folder. Email delivery is a separate manual step.');
   }catch(e){setStatus(e instanceof Error?e.message:'Drive publishing unsuccessful')}
   finally{setBusy(false)}
 }
 async function approve(){
   if(!selected||!window.confirm('Mark this exact AFTER image as reviewed for possible customer sharing? Confirm visual still needs field/code/product verification.'))return;
   try{await api('approve',token,{id:selected,confirmed:true});await refresh();setStatus('Marked reviewed locally. Sharing still requires separate Google Drive upload/permissions.')}
   catch(e){setStatus(String(e))}
 }
 if(token.length<16)return <section className="panel photo-visualizer"><h2>Photo-to-finished-project visualizer</h2>
   <p className="ai-help">Enter the private local bridge token above to use the visual library.</p></section>;
 return <section className="panel photo-visualizer">
  <div className="panel-head"><div><span className="eyebrow dark">PROJECT DESIGN / PHOTO EDITING</span>
   <h2>Site photo → realistic finished view</h2></div></div>
  <p className="ai-help">Keep photos and visual revisions under the same job. Specify actual products and finish choices, then use ChatGPT image editing to transform the original site photograph. Generated images are concepts—not verified dimensions, permits or final product matches.</p>
  <label className="field-label">Linked estimate or MCP project
   <select value={jobId} onChange={e=>setJobId(e.target.value)}><option value="">Choose an estimate</option>
    {jobs.map(j=><option key={j.id} value={j.id}>{j.title} · {j.id.slice(0,8)}</option>)}</select></label>
  <div className="field-grid">
   <label>Photo type<select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}>
    <option value="before">Before — original site</option><option value="after">After — AI-generated finished view</option>
    <option value="reference">Reference — finish/product sample</option></select></label>
   <label>Design label<input value={label} onChange={e=>setLabel(e.target.value)} maxLength={140}/></label>
   {(['door','trim','paint','hardware','fixtures','other'] as const).map(key=><label key={key}>{key[0].toUpperCase()+key.slice(1)} selection
    <input value={choices[key]} maxLength={180} placeholder={'Chosen '+key+' / SKU if known'}
     onChange={e=>setChoices(v=>({...v,[key]:e.target.value}))}/></label>)}
   <label className="wide">Work scope, placement and constraints
    <textarea rows={3} value={notes} maxLength={1500} onChange={e=>setNotes(e.target.value)}
    placeholder="Existing wall, outlet/panel clearance, finish match, swing, trim size, which items must remain unchanged..." /></label>
  </div>
  <div className="bridge-actions">
   <div><strong>1. Keep original and rendered versions</strong>
    <p className="ai-help">Upload from your camera, saved site photos or downloaded ChatGPT image; images are stored privately on this Windows computer.</p>
    <input type="file" accept="image/png,image/jpeg,image/webp" capture={kind==='before'?'environment':undefined}
     disabled={!jobId||busy} onChange={e=>{void upload(e.target.files?.[0]||null);e.currentTarget.value='';}}/>
   </div>
   <div><strong>2. Generate a photo-specific ChatGPT design brief</strong>
    <p className="ai-help">This copies a prompt to use with the actual BEFORE photo in ChatGPT. It does not secretly call paid image APIs or automatically upload a photo into ChatGPT.</p>
    <button className="secondary-button" disabled={!jobId||busy} onClick={()=>void prompt()}>Copy photorealistic edit brief</button>
   </div>
  </div>
  {brief&&<label className="field-label">Ready for ChatGPT<textarea rows={6} value={brief} readOnly/></label>}
  <div className="panel-head"><h3>Visual versions ({records.length})</h3>
   <button className="secondary-button" onClick={()=>void refresh()} disabled={busy||!jobId}>Refresh</button></div>
  <div className="photo-version-grid">{records.map(r=><button type="button" key={r.id}
    className="photo-version-button" onClick={()=>void view(r.id)}>
     <strong>{r.kind.toUpperCase()} · {r.label}</strong>
     <small>{new Date(r.createdAt).toLocaleString()} · {(r.size/1024).toFixed(0)} KB</small>
     <small>{r.customerApproved?'Reviewed for possible sharing':'Not reviewed for customer sharing'}</small>
    </button>)}</div>
  {preview&&<div className="visual-preview"><img src={preview} alt="Selected before or proposed project visual"/>
   <p className="ai-help">Image is labeled as original site or AI concept in the version history. Actual material appearance must be checked against approved product SKUs/samples.</p>
   {records.some(r=>r.id===selected&&r.kind==='after'&&!r.customerApproved)&&
    <button className="secondary-button" onClick={()=>void approve()}>Mark this design version reviewed</button>}
   {records.some(r=>r.id===selected&&r.kind==='after'&&r.customerApproved&&!r.driveFile)&&
    <button className="secondary-button" disabled={busy} onClick={()=>void publish()}>Publish reviewed render to customer Drive folder</button>}
   {records.find(r=>r.id===selected)?.driveFile&&
    <a href={records.find(r=>r.id===selected)?.driveFile?.url} target="_blank" rel="noopener noreferrer">View published version in Google Drive</a>}
  </div>}
  {status&&<p role="status" className="ai-help">{status}</p>}
 </section>;
}
