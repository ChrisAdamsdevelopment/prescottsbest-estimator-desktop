const allowed = new Set(['application/pdf','image/png','image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','text/csv']);
function attachments(payload) {
  return [payload,...(payload?.parts||[]).flatMap(attachments)];
}
export async function emailAttachments(token,messageId,googleRequest) {
  if(typeof messageId!=='string'||!/^[a-zA-Z0-9_-]{6,120}$/.test(messageId))throw Error('Invalid Gmail message');
  const message=await googleRequest(token,'gmail/v1/users/me/messages/'+encodeURIComponent(messageId)+'?format=full');
  const all=attachments(message.payload);
  const headers=message.payload?.headers||[];
  const sender=headers.find(h=>h.name?.toLowerCase()==='from')?.value || '';
  const subject=headers.find(h=>h.name?.toLowerCase()==='subject')?.value || '(No subject)';
  const date=headers.find(h=>h.name?.toLowerCase()==='date')?.value || '';
  const plain=all.find(x=>x.mimeType==='text/plain' && x.body?.data);
  const html=all.find(x=>x.mimeType==='text/html' && x.body?.data);
  const encoded=plain?.body?.data || (message.payload?.mimeType==='text/plain' ? message.payload.body?.data : '');
  const htmlEncoded=html?.body?.data || (message.payload?.mimeType==='text/html' ? message.payload.body?.data : '');
  let bodyText=encoded ? Buffer.from(encoded,'base64url').toString('utf8') : '';
  if(!bodyText && htmlEncoded) {
    bodyText=Buffer.from(htmlEncoded,'base64url').toString('utf8')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
      .replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/p\s*>/gi,'\n')
      .replace(/<[^>]+>/g,' ')
      .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<')
      .replace(/&gt;/gi,'>').replace(/&quot;/gi,'"');
  }
  if(!bodyText)bodyText=message.snippet||'';
  bodyText=bodyText.slice(0,30000);

  const files=all.filter(p=>p.filename && (p.body?.attachmentId||p.body?.data)).map(p=>({
    filename:p.filename,mimeType:p.mimeType,attachmentId:p.body?.attachmentId||null,
    inline:Boolean(!p.body?.attachmentId),size:p.body?.size||0,
    supported:allowed.has(p.mimeType) && (p.body?.size||0)<=8_000_000
  }));
  return {messageId,sender,subject,date,bodyText,files};
}
export async function importAttachment(token,{jobId,folderKey,messageId,attachmentId,confirmed},
  googleRequest,uploadDocument) {
  if(confirmed!==true)throw Error('Select and approve this attachment import');
  if(!['subcontractors','suppliers','estimates','records'].includes(folderKey))throw Error('Incoming email documents must enter an internal folder');
  const list=await emailAttachments(token,messageId,googleRequest);
  const file=list.files.find(f=>f.attachmentId===attachmentId||(!f.attachmentId&&attachmentId==='inline:'+f.filename));
  if(!file||!file.supported)throw Error('Attachment unavailable, too large or unsupported');
  const message=await googleRequest(token,'gmail/v1/users/me/messages/'+encodeURIComponent(messageId)+'?format=full');
  const original=attachments(message.payload).find(p=>p.filename===file.filename&&(p.body?.attachmentId||null)===file.attachmentId);
  let data=original?.body?.data;
  if(file.attachmentId) {
    const attachment=await googleRequest(token,'gmail/v1/users/me/messages/'+encodeURIComponent(messageId)+
      '/attachments/'+encodeURIComponent(file.attachmentId));
    data=attachment.data;
  }
  if(!data)throw Error('Gmail attachment did not contain content');
  const bytes=Buffer.from(data,'base64url');
  if(bytes.length<1||bytes.length>8_000_000)throw Error('Attachment exceeds file limit');
  const result=await uploadDocument(token,{jobId,folderKey,name:file.filename,
    mimeType:file.mimeType,contentBase64:bytes.toString('base64')});
  return {...result,origin:'Gmail attachment',from:list.sender,messageId};
}
