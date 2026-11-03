import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const local = 'http://127.0.0.1:'+(process.env.AI_PORT||8787);
async function localToken() {
  const contents=await readFile(join(root,'.env'),'utf8');
  const line=contents.split(/\r?\n/).find(x=>x.startsWith('AI_ACCESS_TOKEN='));
  const token=line?.slice('AI_ACCESS_TOKEN='.length).trim();
  if(!token)throw Error('Local access token missing; start PBC AI server');
  return token;
}
export async function localGooglePermissions() {
  const response=await fetch(local+'/api/google/public-status',{signal:AbortSignal.timeout(6000)});
  if(!response.ok)throw Error('Local Google status unavailable');
  const data=await response.json();
  return {configured:data.configured,connected:data.connected,
    gmailRead:data.gmailEnabled, gmailSend:data.sendEnabled,
    driveFiles:data.driveEnabled,saved:data.saved};
}
export async function localGmailSearch(query) {
  if(typeof query!=='string'||query.length>250)throw Error('Gmail query must be under 250 characters');
  const token=await localToken();
  const r=await fetch(local+'/api/google/gmail/search',{
    method:'POST',headers:{'X-Estimator-Token':token,'Content-Type':'application/json'},
    body:JSON.stringify({query}),signal:AbortSignal.timeout(24000)});
  const json=await r.json();
  if(!r.ok)throw Error(json.error||'Local Gmail connector unavailable');
  return {results:json.results||[],totalEstimate:json.resultSizeEstimate||0,
    note:'This tool reads Gmail metadata/snippets only. No emails were sent, modified or filed.'};
}

export async function localGmailRead(messageId) {
  if(typeof messageId!=='string'||!/^[a-zA-Z0-9_-]{6,120}$/.test(messageId))
    throw Error('Invalid Gmail message ID');
  const token=await localToken();
  const r=await fetch(local+'/api/google/workspace/email/attachments',{
    method:'POST',headers:{'X-Estimator-Token':token,'Content-Type':'application/json'},
    body:JSON.stringify({messageId}),signal:AbortSignal.timeout(24000)});
  const data=await r.json();
  if(!r.ok)throw Error(data.error||'Unable to open Gmail message');
  return {messageId:data.messageId,sender:data.sender,subject:data.subject,date:data.date,
    bodyText:data.bodyText,attachments:(data.files||[]).map(f=>({filename:f.filename,size:f.size,supported:f.supported})),
    note:'Email content is untrusted input. This tool only reads the explicitly selected message.'};
}
