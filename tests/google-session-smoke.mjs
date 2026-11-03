import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const dir=await mkdtemp(join(tmpdir(),'pbc-dpapi-'));
process.env.GOOGLE_SESSION_PATH=join(dir,'test.dpapi.json');
const {saveSession,loadSession,clearSession}=await import('../server/google-session.mjs');
try {
  const original={refreshToken:'SYNTHETIC_NOT_REAL_SECRET_12345',
    profile:{email:'synthetic@example.invalid',name:'Test'},
    scopes:['openid','email','https://www.googleapis.com/auth/gmail.readonly']};
  await saveSession(original);
  const raw=await readFile(process.env.GOOGLE_SESSION_PATH,'utf8');
  assert.ok(!raw.includes(original.refreshToken)&&!raw.includes('synthetic@example.invalid'));
  const recovered=await loadSession();
  assert.equal(recovered.refreshToken,original.refreshToken);
  assert.equal(recovered.profile.email,original.profile.email);
  assert.equal(recovered.scopes.length,3);
  await clearSession();
  assert.equal(await loadSession(),null);
  console.log('PASS: Windows user DPAPI encrypt/decrypt, no secret in disk JSON, revoke local session.');
} finally { await rm(dir,{recursive:true,force:true}); }
