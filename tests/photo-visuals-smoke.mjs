import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const dir=await mkdtemp(join(tmpdir(),'pbc-visual-test-'));
const project=join(dir,'construction');
process.env.PBC_VISUAL_ROOT=join(dir,'library');
process.env.PBC_PROJECT_ROOT=project;
const api=await import('../server/photo-visuals.mjs');
const jobId='test-job-0001';
const tinyPng='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==';
try{
 await mkdir(join(project,'Assets'),{recursive:true});
 const asset=join(project,'Assets','before.png');
 await writeFile(asset,Buffer.from(tinyPng,'base64'));
 let r=await api.importVisualLocal({jobId,kind:'before',path:asset,label:'Test site wall',
  choices:{trim:'white casing'},notes:'Preserve real wall geometry'});
 assert.equal(r.kind,'before');assert.ok(r.sha256.length===64);
 const before=await api.listVisuals(jobId);
 assert.equal(before.records.length,1);assert.ok(!before.records[0].filename);
 const downloaded=await api.openVisual(r.id);
 assert.ok(downloaded.imageDataUrl.startsWith('data:image/png;base64,'));
 assert.equal(Buffer.from(downloaded.imageDataUrl.split(',')[1],'base64').compare(Buffer.from(tinyPng,'base64')),0);
 const second=await api.addVisualFromData({jobId,kind:'after',label:'Finished door concept',
  notes:'Same wall, do not relocate electrical panel',choices:{door:'white exterior door'},
  imageDataUrl:'data:image/png;base64,'+tinyPng});
 assert.equal((await api.listVisuals(jobId)).records.length,2);
 assert.equal((await api.markVisualApproved(second.id,true)).customerApproved,true);
 assert.equal((await api.openVisual(second.id)).customerApproved,true);
 const published=await api.markVisualPublished(second.id,'1abcDEF_123456789abcdef',true);
 assert.ok(published.url.startsWith('https://drive.google.com/file/d/'));
 assert.equal((await api.listVisuals(jobId)).records.find(x=>x.id===second.id).driveFile.id,'1abcDEF_123456789abcdef');
 assert.ok(api.makeVisualBrief({jobId,kind:'after',label:'Door',notes:'retain panel',
  choices:{door:'white'} }).prompt.includes('actual camera position'));
 await assert.rejects(()=>api.addVisualFromData({jobId,kind:'before',label:'malware',
  imageDataUrl:'data:image/png;base64,'+Buffer.from('<html>not an image</html>').toString('base64')}));
 const external=join(dir,'not-project.png');await writeFile(external,Buffer.from(tinyPng,'base64'));
 await assert.rejects(()=>api.importVisualLocal({jobId,kind:'before',label:'Unsafe',path:external}));
 console.log('PASS: project-bound local picture import, immutable revisions, content-type validation, preview, approval gate, prompt generation and path isolation.');
} finally {await rm(dir,{recursive:true,force:true})}
