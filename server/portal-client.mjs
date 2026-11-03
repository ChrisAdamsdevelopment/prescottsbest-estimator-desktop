import {openVisual,listVisuals} from './photo-visuals.mjs';
function config(){
 const url=process.env.PBC_PORTAL_URL?.replace(/\/+$/,'')||'';
 const key=process.env.PBC_PORTAL_ADMIN_KEY||'';
 if(!url||key.length<32)throw Error('Hosted portal is not configured. Set PBC_PORTAL_URL and PBC_PORTAL_ADMIN_KEY privately in the local .env after connecting Render.');
 const u=new URL(url);
 if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))
  throw Error('Portal must use HTTPS (or localhost for controlled testing)');
 if(u.username||u.password||u.search||u.hash)throw Error('Portal URL must be a plain trusted service origin');
 return {url,key};
}
async function request(path,payload){
 const {url,key}=config();
 const r=await fetch(url+path,{method:payload?'POST':'GET',headers:{
  Authorization:'Bearer '+key,...(payload?{'Content-Type':'application/json'}:{})},
  ...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(25000)});
 const data=await r.json();
 if(!r.ok)throw Error('Portal '+r.status+': '+(data.error||'Request failed'));
 return {url,data};
}
export async function portalStatus(){
 const {data}=await request('/api/admin/proposals');
 return {configured:true,proposals:data.proposals.map(p=>({id:p.id,title:p.title,revision:p.revision,status:p.status,
   createdAt:p.createdAt,total:p.total,expiresAt:p.expiresAt,approval:p.approval||null})),
  questions:data.questions,audit:data.audit};
}
export async function portalLeads(){
 const {data}=await request('/api/admin/leads');
 return {notificationTo:data.notificationTo,leads:data.leads};
}
export async function portalPublish(input){
 if(process.env.PBC_MCP_ENABLE_WRITES!=='1')throw Error('Portal publication is disabled until the local MCP write switch is enabled.');
 if(input.ownerApproved!==true||input.confirmation!=='PUBLISH REVIEWED PROPOSAL')
  throw Error('Owner must explicitly approve the exact customer-visible snapshot before publishing.');
 if(typeof input.jobId!=='string'||input.jobId.length<4)throw Error('Local project ID required');
 const proposal=input.proposal;
 if(!proposal||!Array.isArray(proposal.items))throw Error('Reviewed customer-visible estimate is required');
 const photos=[];
 if(input.visualId){
  const meta=(await listVisuals(input.jobId)).records.find(x=>x.id===input.visualId);
  if(!meta||meta.kind!=='after'||!meta.customerApproved)throw Error('Selected rendered concept must be approved in the local visual gallery.');
  const image=await openVisual(input.visualId);
  photos.push({kind:'after',label:meta.label,mimeType:meta.mimeType,base64:image.imageDataUrl.split(',')[1]});
 }
 const {url,data}=await request('/api/admin/publish',{...proposal,photos});
 return {published:true,proposalId:data.id,revision:data.revision,expiresAt:data.expiresAt,
  privateCustomerLink:url+'/'+data.linkFragment,
  warning:'This link grants access to the specific proposal. Send only after verifying the recipient. No email has been sent. Customer approval is not a signed construction agreement.'};
}
export async function portalRevoke(id,confirmed){
 if(process.env.PBC_MCP_ENABLE_WRITES!=='1'||confirmed!==true)throw Error('Explicit revoke confirmation and local writes required');
 const {data}=await request('/api/admin/revoke',{id});
 return data;
}
