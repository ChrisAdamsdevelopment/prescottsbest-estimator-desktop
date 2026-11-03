import { execFileSync } from 'node:child_process';
import { readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const sessionPath = process.env.GOOGLE_SESSION_PATH ||
  join(dirname(fileURLToPath(import.meta.url)), '.google-session.dpapi.json');
function protect(input, mode) {
  if (process.platform !== 'win32') throw new Error('Persistent Google sessions require Windows DPAPI');
  const ps = mode === 'protect'
    ? "Add-Type -AssemblyName System.Security -ErrorAction Stop;$ErrorActionPreference='Stop';$v=[Console]::In.ReadToEnd();$b=[Text.Encoding]::UTF8.GetBytes($v);$c=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($c))"
    : "Add-Type -AssemblyName System.Security -ErrorAction Stop;$ErrorActionPreference='Stop';$v=[Console]::In.ReadToEnd();$b=[Convert]::FromBase64String($v);$c=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($c))";
  return execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command', ps], {
    input, encoding: 'utf8', timeout: 15000, windowsHide: true, maxBuffer: 1_000_000
  }).trim();
}
export async function loadSession() {
  try {
    const wrapped = JSON.parse(await readFile(sessionPath, 'utf8'));
    if (wrapped.format !== 'pbc-google-dpapi-v1' || typeof wrapped.encrypted !== 'string') return null;
    const saved = JSON.parse(protect(wrapped.encrypted, 'unprotect'));
    if (!saved.refreshToken || !saved.profile?.email || !Array.isArray(saved.scopes)) return null;
    return { ...saved, accessToken: '', expiresAt: 0, savedAt: wrapped.savedAt };
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    console.error('Unable to load locally protected Google session:', e.message);
    return null;
  }
}
export async function saveSession(connection) {
  if (!connection?.refreshToken) throw new Error('Google did not issue a refresh token; reconnect using consent.');
  const safe = { refreshToken: connection.refreshToken, profile: connection.profile,
    scopes: connection.scopes };
  const encrypted = protect(JSON.stringify(safe), 'protect');
  const savedAt = new Date().toISOString();
  const tmp = sessionPath + '.tmp';
  await writeFile(tmp, JSON.stringify({ format: 'pbc-google-dpapi-v1', encrypted, savedAt }), {
    mode: 0o600
  });
  await rename(tmp, sessionPath);
  try { await chmod(sessionPath, 0o600); } catch { /* Windows uses ACLs plus per-user DPAPI. */ }
  return savedAt;
}
export async function clearSession() {
  const { unlink } = await import('node:fs/promises');
  try { await unlink(sessionPath); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
