import { randomBytes, createHash } from 'node:crypto';
import { loadSession, saveSession, clearSession } from './google-session.mjs';
import { handleWorkspace } from './google-workspace.mjs';

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
const gmailScope = 'https://www.googleapis.com/auth/gmail.readonly';
const sendScope = 'https://www.googleapis.com/auth/gmail.send';
const driveScope = 'https://www.googleapis.com/auth/drive.file';
const baseScopes = ['openid','email','profile'];
const callback = 'http://127.0.0.1:' + (process.env.AI_PORT || '8787') + '/api/google/callback';
const pending = new Map();
let connection = await loadSession(); // Windows DPAPI stores a refresh token encrypted to this OS user.
let sessionNotice = connection ? 'Saved Google session loaded' : 'Authorization not saved yet';
function base64url(b) { return b.toString('base64url'); }
async function readBody(req) {
  let parts = [], n = 0;
  for await (const part of req) { n += part.length; if (n > 15_000) throw new Error('Request too large'); parts.push(part); }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
const err = (status, message) => ({ status, data: { error: message } });
function html(res, code, text) {
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" });
  res.end('<!DOCTYPE html><meta charset="utf-8"><title>Prescott’s Best Google Connection</title>' +
    '<body style="font:16px system-ui;padding:50px;max-width:540px;margin:auto"><h1>Prescott’s Best Construction</h1>' +
    '<p>' + text + '</p><p>You can close this tab and return to the estimator.</p></body>');
}
function connectedStatus() {
  return { configured: Boolean(CLIENT_ID), connected: Boolean(connection),
    email: connection?.profile?.email || null, name: connection?.profile?.name || null,
    gmailEnabled: connection?.scopes?.includes(gmailScope) || false,
    sendEnabled: connection?.scopes?.includes(sendScope) || false,
    driveEnabled: connection?.scopes?.includes(driveScope) || false,
    saved: Boolean(connection?.savedAt), sessionNotice,
    tokenPersistence: connection?.savedAt ? 'Windows DPAPI (encrypted for this Windows user)' : 'Not saved; reconnect to save securely' };
}
export async function googleToken(scopes = []) {
  if (!connection || scopes.some(scope => !connection.scopes?.includes(scope))) throw new Error('Required Google permission is not authorized: ' + scopes.join(', '));
  return tokenFetch();
}
async function tokenFetch() {
  if (!connection) throw new Error('Google is not connected');
  if (Date.now() < connection.expiresAt - 60000) return connection.accessToken;
  if (!connection.refreshToken) throw new Error('Google session expired. Reconnect.');
  const params = new URLSearchParams({ client_id: CLIENT_ID,
    grant_type: 'refresh_token', refresh_token: connection.refreshToken });
  if (CLIENT_SECRET) params.set('client_secret', CLIENT_SECRET);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', body: params, signal: AbortSignal.timeout(12000)
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error('Google session refresh failed. Reconnect.');
  connection.accessToken = data.access_token;
  connection.expiresAt = Date.now() + data.expires_in * 1000;
  if (data.scope) connection.scopes = [...new Set(data.scope.split(' '))];
  return connection.accessToken;
}
async function gmailSearch(q) {
  if (!connection?.scopes.includes(gmailScope)) throw new Error('Connect Gmail read-only first');
  if (typeof q !== 'string' || q.length > 250) throw new Error('Search must be 250 characters or fewer');
  const token = await tokenFetch();
  const u = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  u.searchParams.set('q', q); u.searchParams.set('maxResults', '10');
  const res = await fetch(u, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('Gmail search returned ' + res.status);
  const index = await res.json();
  const out = [];
  for (const message of (index.messages || []).slice(0, 10)) {
    const d = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent(message.id) + '?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date', {
      headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) });
    if (!d.ok) continue;
    const item = await d.json();
    const h = Object.fromEntries((item.payload?.headers || []).map(x => [x.name.toLowerCase(), x.value]));
    out.push({ id: item.id, threadId: item.threadId, subject: h.subject || '', from: h.from || '',
      date: h.date || '', snippet: item.snippet || '' });
  }
  return { results: out, resultSizeEstimate: index.resultSizeEstimate || 0 };
}
export async function handleGoogle(req, res, path, send, authorized) {
  if (path === '/api/google/callback' && req.method === 'GET') {
    const url = new URL(req.url, callback);
    const flow = pending.get(url.searchParams.get('state'));
    if (!flow || Date.now() - flow.created > 300000) return html(res, 400, 'Connection expired or invalid. Try again.');
    pending.delete(flow.state);
    if (url.searchParams.get('error')) return html(res, 400, 'Google authorization was not completed.');
    try {
      const code = url.searchParams.get('code');
      if (!code) throw new Error('Missing authorization code');
      const params = new URLSearchParams({ client_id: CLIENT_ID, code, code_verifier: flow.verifier,
        grant_type: 'authorization_code', redirect_uri: callback });
      if (CLIENT_SECRET) params.set('client_secret', CLIENT_SECRET);
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', body: params, signal: AbortSignal.timeout(15000) });
      const data = await r.json();
      if (!r.ok || !data.access_token || !data.id_token) throw new Error('Google token exchange failed');
      const check = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(data.id_token), {
        signal: AbortSignal.timeout(12000) });
      if (!check.ok) throw new Error('Invalid ID token');
      const identity = await check.json();
      if (identity.aud !== CLIENT_ID || !['accounts.google.com','https://accounts.google.com'].includes(identity.iss) ||
          identity.nonce !== flow.nonce || Number(identity.exp) * 1000 < Date.now())
        throw new Error('Google ID token verification failed');
      const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: 'Bearer ' + data.access_token }, signal: AbortSignal.timeout(12000) });
      if (!profileResponse.ok) throw new Error('Unable to retrieve Google profile');
      const profile = await profileResponse.json();
      const previous = connection?.profile?.email === profile.email ? connection : null;
      connection = { profile: { email: profile.email || '', name: profile.name || '' },
        scopes: data.scope?.split(' ') || flow.scopes, accessToken: data.access_token,
        refreshToken: data.refresh_token || previous?.refreshToken || null,
        expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
      try {
        connection.savedAt = await saveSession(connection);
        sessionNotice = 'Google account authorization saved with Windows encryption';
      } catch (e) {
        sessionNotice = 'Connected but not saved: ' + e.message;
        console.error('Google session save issue:', e.message);
      }
      return html(res, 200, 'Google connected. ' + (connection.savedAt ? 'Your authorization is saved securely for this Windows user.' : 'Your authorization was not saved; check the app status.') + ' Return to the app to check Gmail permissions.');
    } catch (e) { console.error('Google OAuth error:', e.message); return html(res, 400, 'Unable to verify the Google connection. Check your OAuth configuration.'); }
  }
  if (path === '/api/google/public-status' && req.method === 'GET') {
    const s = connectedStatus();
    return send(res, 200, { configured:s.configured, connected:s.connected, gmailEnabled:s.gmailEnabled,
      sendEnabled:s.sendEnabled, driveEnabled:s.driveEnabled,
      saved:s.saved, email:null, tokenPersistence:s.tokenPersistence });
  }
  if (!authorized) return send(res, 401, { error: 'Private local access token required' });
  if (path === '/api/google/status' && req.method === 'GET') {
    if (connection?.refreshToken && Date.now() >= connection.expiresAt - 60_000) {
      try { await tokenFetch(); } catch (e) { sessionNotice = 'Saved Google authorization needs reconnection: ' + e.message; connection = null; }
    }
    return send(res, 200, connectedStatus());
  }
  if (path === '/api/google/disconnect' && req.method === 'POST') {
    connection = null; await clearSession(); sessionNotice = 'Google disconnected and saved authorization deleted';
    return send(res, 200, connectedStatus());
  }
  if (path === '/api/google/start' && req.method === 'POST') {
    if (!CLIENT_ID) return send(res, 503, { error: 'Set GOOGLE_OAUTH_CLIENT_ID in your local .env and restart START_AI.bat' });
    const input = await readBody(req);
    if (!['identity','gmail','gmail-send','drive'].includes(input.service)) return send(res, 400, { error: 'Unknown service' });
    const state = base64url(randomBytes(24)), nonce = base64url(randomBytes(24)),
      verifier = base64url(randomBytes(48)), challenge = base64url(createHash('sha256').update(verifier).digest());
    const scopes = input.service === 'gmail' ? [...baseScopes, gmailScope] :
      input.service === 'gmail-send' ? [...baseScopes, sendScope] :
      input.service === 'drive' ? [...baseScopes, driveScope] : baseScopes;
    pending.set(state, { state, nonce, verifier, created: Date.now(), scopes });
    for (const [id, record] of pending) if (Date.now() - record.created > 300000) pending.delete(id);
    const params = new URLSearchParams({ client_id: CLIENT_ID, response_type: 'code',
      redirect_uri: callback, scope: scopes.join(' '), code_challenge: challenge, code_challenge_method: 'S256',
      state, nonce, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' });
    return send(res, 200, { url: 'https://accounts.google.com/o/oauth2/v2/auth?' + params });
  }
  if (path.startsWith('/api/google/workspace/')) return handleWorkspace(req, res, path, send, googleToken);
  if (path === '/api/google/gmail/search' && req.method === 'POST') {
    try { const input = await readBody(req); return send(res, 200, await gmailSearch(input?.query || '')); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }
  return send(res, 404, { error: 'Unknown Google connector route' });
}
