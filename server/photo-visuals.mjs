import {readFile,writeFile,rename,mkdir,realpath} from 'node:fs/promises';
import {dirname,join,resolve,relative,extname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
const parent=dirname(fileURLToPath(import.meta.url));
const root=process.env.PBC_VISUAL_ROOT||join(parent,'.visual-library');
const images=join(root,'images');
const registry=join(root,'index.json');
const projectRoot=resolve(process.env.PBC_PROJECT_ROOT||join(parent,'../../..'));
const regex=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;
const kinds=['before','after','reference'];
const empty=()=>({version:1,records:[]});
async function readIndex(){
 try{const data=JSON.parse(await readFile(registry,'utf8'));if(data.version!==1||!Array.isArray(data.records))throw Error('Invalid visual catalog');return data}
 catch(e){if(e.code==='ENOENT')return empty();throw e}
}
async function saveIndex(s){
 await mkdir(root,{recursive:true});
 const temp=registry+'.tmp';
 await writeFile(temp,JSON.stringify(s,null,2),{mode:0o600});
 await rename(temp,registry);
}
function checkId(s){if(typeof s!=='string'||!/^[a-zA-Z0-9_-]{4,100}$/.test(s))throw Error('Invalid job ID');return s}
function clean(s,len=200){if(typeof s!=='string'||s.length>len||/[\x00-\x08\x0b-\x1f]/.test(s))throw Error('Invalid text');return s.trim()}
function safeMeta(m){
 if(!m||typeof m!=='object')throw Error('Visual metadata required');
 const jobId=checkId(m.jobId),kind=m.kind;
 if(!kinds.includes(kind))throw Error('Invalid visual kind');
 const choices={};
 for(const key of ['door','trim','paint','hardware','fixtures','other'])choices[key]=clean(m.choices?.[key]||'',180);
 return {jobId,kind,choices,notes:clean(m.notes||'',1500),label:clean(m.label||'Project visual',140)};
}
function signature(bytes){return createHash('sha256').update(bytes).digest('hex')}
async function saveImage(meta,bytes,mime,source='operator upload'){
 if(bytes.length<10||bytes.length>7_500_000)throw Error('Image must be under 7.5 MB');
 if(!['image/png','image/jpeg','image/webp'].includes(mime))throw Error('Unsupported image format');
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if((mime==='image/png'&&!png)||(mime==='image/jpeg'&&!jpg)||(mime==='image/webp'&&!webp))
  throw Error('Image file signature does not match its declared format');
 const s=await readIndex();
 if(s.records.length>=250)throw Error('Visual catalog capacity reached; back up and archive old projects');
 const id=randomUUID(),extension=mime==='image/jpeg'?'.jpg':mime==='image/png'?'.png':'.webp';
 await mkdir(images,{recursive:true});
 await writeFile(join(images,id+extension),bytes,{flag:'wx',mode:0o600});
 const record={id,...safeMeta(meta),mimeType:mime,size:bytes.length,
  sha256:signature(bytes),filename:id+extension,source:clean(source,180),
  createdAt:new Date().toISOString(),customerApproved:false};
 s.records.push(record);
 await saveIndex(s);
 return {...record,privateLocal:true};
}
export async function addVisualFromData(input){
 const match=regex.exec(input?.imageDataUrl||'');
 if(!match||input.imageDataUrl.length>10_200_000)throw Error('Select a PNG, JPG or WebP under 7.5 MB');
 return saveImage(input,Buffer.from(match[2],'base64'),'image/'+match[1],'operator browser upload');
}
export async function importVisualLocal(input){
 const candidate=resolve(clean(input.path,850));
 if(!isAbsolute(candidate))throw Error('Absolute project path required');
 const realRoot=await realpath(projectRoot),realFile=await realpath(candidate);
 const rel=relative(realRoot,realFile);
 if(rel.startsWith('..')||isAbsolute(rel)||rel==='')throw Error('Only project-folder images may be imported');
 const ext=extname(realFile).toLowerCase();
 const mime=ext==='.png'?'image/png':ext==='.jpg'||ext==='.jpeg'?'image/jpeg':ext==='.webp'?'image/webp':'';
 if(!mime)throw Error('Only PNG, JPEG and WebP are supported');
 const buf=await readFile(realFile);
 return saveImage(input,buf,mime,relative(realRoot,realFile));
}
export async function listVisuals(jobId){
 const s=await readIndex();
 return {jobId:jobId||null,records:s.records.filter(r=>!jobId||r.jobId===checkId(jobId))
  .map(({filename,...safe})=>safe).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))};
}
export async function openVisual(id){
 const s=await readIndex(),r=s.records.find(x=>x.id===id);
 if(!r)throw Error('Unknown visual image');
 const data=await readFile(join(images,r.filename));
 return {id,imageDataUrl:'data:'+r.mimeType+';base64,'+data.toString('base64'),
  label:r.label,kind:r.kind,choices:r.choices,customerApproved:r.customerApproved};
}
export async function markVisualApproved(id,confirmed){
 if(confirmed!==true)throw Error('Operator must approve visualization for customer review');
 const s=await readIndex(),r=s.records.find(x=>x.id===id);
 if(!r||r.kind!=='after')throw Error('Only rendered after images may be reviewed');
 r.customerApproved=true;r.approvedAt=new Date().toISOString();
 await saveIndex(s);
 return {id,customerApproved:true,approvedAt:r.approvedAt};
}
export async function markVisualPublished(id,fileId,confirmed){
 if(confirmed!==true)throw Error('Explicit customer-review folder publishing confirmation required');
 if(typeof fileId!=='string'||!/^[a-zA-Z0-9_-]{12,100}$/.test(fileId))throw Error('Invalid Google Drive file ID');
 const s=await readIndex(),r=s.records.find(x=>x.id===id);
 if(!r||r.kind!=='after'||!r.customerApproved)throw Error('Only reviewed AFTER visuals may be published');
 if(r.driveFile&&r.driveFile.id!==fileId)throw Error('Already linked to a different Drive file; reconcile first');
 r.driveFile={id:fileId,url:'https://drive.google.com/file/d/'+fileId+'/view',at:new Date().toISOString()};
 await saveIndex(s);
 return r.driveFile;
}
export function makeVisualBrief(meta){
 const m=safeMeta(meta);
 return {jobId:m.jobId,prompt:[
 'Edit the UPLOADED EXISTING SITE PHOTO, preserving the actual camera position, perspective, lighting, room geometry and unchanged objects.',
 'Show the proposed finished renovation in that SAME physical space, not a generic illustration or new room.',
 'Project type: '+m.label+'. Notes: '+m.notes,
 'Customer selected products and finishes (only if specified): Door '+m.choices.door+
 '; Trim '+m.choices.trim+'; Paint '+m.choices.paint+'; Hardware '+m.choices.hardware+
 '; Fixtures '+m.choices.fixtures+'; Other '+m.choices.other+'.',
 'Keep electrical-panel access, overhead garage-door track, door swing and plausible clearances visibly considered; if unverified, do not depict compliance as established.',
 'Photorealistic concept, consistent with the site image. Do not add unrelated furniture, invent window or structural dimensions, or alter project scope.',
 'No prices, measurements, logos or captions embedded in the image. Render for design discussion only, not as a code-compliant drawing.'
 ].join('\n'),instructions:'In ChatGPT, attach the BEFORE photo and use this prompt. Download the resulting image or save it to the authorized project folder; then import that AFTER image into the app. This does not automatically invoke an image model.'};
}
export async function handleVisuals(req,res,path,send,readJSON){
 try{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&path==='/api/visuals/list')return send(res,200,await listVisuals(url.searchParams.get('jobId')||undefined));
  if(req.method==='GET'&&path==='/api/visuals/image')return send(res,200,await openVisual(url.searchParams.get('id')||''));
  if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
  const input=await readJSON(req,path.endsWith('/upload')?10_400_000:20_000);
  if(path==='/api/visuals/upload')return send(res,200,await addVisualFromData(input));
  if(path==='/api/visuals/brief')return send(res,200,makeVisualBrief(input));
  if(path==='/api/visuals/approve')return send(res,200,await markVisualApproved(input?.id,input?.confirmed));
  if(path==='/api/visuals/published')return send(res,200,await markVisualPublished(input?.id,input?.fileId,input?.confirmed));
  return send(res,404,{error:'Unknown photo visualization route'});
 }catch(e){return send(res,400,{error:e.message||'Photo visualization request failed'})}
}
