import { Buffer } from 'node:buffer';

function parts(payload) {
  if (!payload) return [];
  return [payload, ...(payload.parts || []).flatMap(parts)];
}
function emailFrom(headers=[]) {
  const value=(headers.find(h=>h.name?.toLowerCase()==='from')?.value || '').trim();
  const angle=value.match(/<([^<>]+)>/);
  return (angle ? angle[1] : value).toLowerCase().trim();
}
function plainBody(payload) {
  const plain=parts(payload).find(p=>p.mimeType==='text/plain' && p.body?.data);
  const encoded=plain?.body?.data || payload?.body?.data;
  if (!encoded) return '';
  return Buffer.from(encoded,'base64url').toString('utf8').slice(0,5000);
}
export async function checkApprovalReplies(token,s,googleRequest,audit,persist) {
  const results=[];
  for(const a of Object.values(s.approvals).filter(x=>x.status==='awaiting-reply').slice(0,25)) {
    try {
      const query='from:'+a.email+' newer_than:30d "PBCAPP-'+a.id+'"';
      const index=await googleRequest(token,'gmail/v1/users/me/messages?maxResults=25&q='+encodeURIComponent(query));
      for(const m of index.messages || []) {
        const d=await googleRequest(token,'gmail/v1/users/me/messages/'+encodeURIComponent(m.id)+'?format=full');
        if(d.id===a.messageId || d.threadId!==a.threadId) continue;
        if(emailFrom(d.payload?.headers)!==a.email.toLowerCase())continue;
        // A quoted copy of the original request MUST NOT count as approval.
        const firstLines=plainBody(d.payload).split(/\r?\n/).slice(0,8).filter(x=>!x.trim().startsWith('>'));
        if(!firstLines.some(x=>x.trim().toUpperCase()==='APPROVE PBCAPP-'+a.id.toUpperCase()))continue;
        a.status='reply-received';
        a.receivedAt=new Date().toISOString();
        a.replyMessageId=d.id;
        audit(s,'customer_approval_reply_detected',a.jobId,{approvalId:a.id,replyMessageId:d.id});
        await persist(s);
        break;
      }
      results.push({id:a.id,status:a.status,revision:a.revision,jobId:a.jobId});
    } catch(e) { results.push({id:a.id,status:'check-error',detail:e.message}); }
  }
  return {checkedAt:new Date().toISOString(),results,
    note:'Email replies are unverified approval evidence. Contractor must verify identity and exact revision before marking final acceptance.'};
}
