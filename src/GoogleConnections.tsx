import { useCallback, useEffect, useRef, useState } from 'react';
type GoogleStatus = { configured: boolean; connected: boolean; saved: boolean; email: string | null; name: string | null;
  gmailEnabled: boolean; sendEnabled: boolean; driveEnabled: boolean; tokenPersistence: string; sessionNotice?: string; };
type Mail = { id: string; threadId: string; subject: string; from: string; date: string; snippet: string };
async function request(path: string, token: string, data?: unknown) {
  const res = await fetch('/api/google/' + path, { method: data === undefined ? 'GET' : 'POST',
    headers: { 'X-Estimator-Token': token, 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Google connection failed');
  return json;
}
export function GoogleConnections({ token }: { token: string }) {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('newer_than:7d');
  const [mail, setMail] = useState<Mail[]>([]);
  const [checkedAt, setCheckedAt] = useState('');
  const requestSequence = useRef(0);
  const refresh = useCallback(async (notify = false) => {
    const sequence = ++requestSequence.current;
    try {
      let data: GoogleStatus;
      if (token.length >= 16) {
        try { data = await request('status', token) as GoogleStatus; }
        catch { const r = await fetch('/api/google/public-status'); data = await r.json() as GoogleStatus; }
      } else {
        const r = await fetch('/api/google/public-status'); data = await r.json() as GoogleStatus;
      }
      if (sequence !== requestSequence.current) return;
      setStatus(data);
      setCheckedAt(new Date().toLocaleTimeString());
      if (notify) setMessage('Google connection status updated.');
    } catch (e) {
      if (sequence !== requestSequence.current) return;
      setStatus(null);
      if (notify) setMessage(e instanceof Error ? e.message : 'Unable to check status');
    }
  }, [token]);
  useEffect(() => {
    const initial = window.setTimeout(() => { void refresh(); }, 450);
    const onFocus = () => { void refresh(); };
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 12000);
    return () => { window.clearTimeout(initial); requestSequence.current++; window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisible); window.clearInterval(interval); };
  }, [refresh]);
  async function connect(service: 'identity' | 'gmail' | 'gmail-send' | 'drive') {
    // Open synchronously on button click to avoid popup blockers after the async API call.
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    setBusy(true);
    try {
      const result = await request('start', token, { service });
      if (popup) popup.location.replace(result.url);
      else setMessage('Your browser blocked the Google authorization window. Allow popups for localhost, then try again.');
      if (popup) setMessage('Approve the requested Google ' + service + ' permission in the new tab. Status refreshes when you return.');
    } catch (e) {
      if (popup) popup.close();
      setMessage(e instanceof Error ? e.message : 'Unable to connect');
    } finally { setBusy(false); }
  }
  async function disconnect() {
    if (!window.confirm('Disconnect Google and delete the locally saved Google authorization?')) return;
    setBusy(true);
    try { setStatus(await request('disconnect', token, {})); setMail([]); setMessage('Google authorization and saved session deleted.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to disconnect'); }
    finally { setBusy(false); }
  }
  async function search() {
    setBusy(true);
    try {
      const result = await request('gmail/search', token, { query });
      setMail(result.results || []);
      setMessage('Read-only Gmail search complete. No messages sent or changed.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Gmail search failed'); }
    finally { setBusy(false); }
  }
  const ready = Boolean(status?.connected);
  return <section className="panel google-connector-panel">
    <div className="panel-head"><div><span className="eyebrow dark">GOOGLE / OPTIONAL</span><h2>Google & Gmail connection</h2></div></div>
    <p className="ai-help">Your Google login and Gmail permissions are separate. Connections are verified against the local server automatically, including when you return from the Google consent window.</p>
    <div className="connection-status-list" aria-live="polite">
      <div><strong>OAuth credentials</strong><span className={status?.configured ? 'connection-ok' : 'connection-warning'}>{status?.configured ? 'Configured' : 'Not configured'}</span></div>
      <div><strong>Google account</strong><span className={ready ? 'connection-ok' : 'connection-warning'}>{ready ? 'Connected' : 'Not connected'}</span></div>
      <div><strong>Gmail read-only</strong><span className={status?.gmailEnabled ? 'connection-ok' : 'connection-warning'}>{status?.gmailEnabled ? 'Authorized' : 'Needs separate approval'}</span></div>
      <div><strong>Gmail send</strong><span className={status?.sendEnabled ? 'connection-ok' : 'connection-warning'}>{status?.sendEnabled ? 'Authorized' : 'Needs approval'}</span></div>
      <div><strong>Google Drive files</strong><span className={status?.driveEnabled ? 'connection-ok' : 'connection-warning'}>{status?.driveEnabled ? 'Authorized' : 'Needs approval'}</span></div>
      <div><strong>Saved after restart</strong><span className={status?.saved ? 'connection-ok' : 'connection-warning'}>{status?.saved ? 'Encrypted on this PC' : 'Not yet saved'}</span></div>
    </div>
    {ready && <p className="ai-help">Connected account: <strong>{status?.email}</strong></p>}
    {!ready && status?.configured && <p className="ai-help">Choose Connect Google to authorize this account. The account remains available after restarting only once a refresh token is saved with Windows encryption.</p>}
    {ready && !status?.gmailEnabled && <p className="ai-help"><strong>Next:</strong> Choose Allow Gmail read-only and approve that permission in Google's window.</p>}
    {ready && !status?.saved && <p className="ai-help">This session is connected but not yet saved to disk. Reconnecting using Google's consent screen allows the new Windows-encrypted session storage to take effect.</p>}
    {status?.sessionNotice && <p className="ai-help">{status.sessionNotice}</p>}
    <div className="ai-actions">
      <button className="secondary-button" disabled={busy || token.length < 16 || !status?.configured} onClick={() => connect('identity')}>{ready ? 'Reconnect Google' : 'Connect Google'}</button>
      <button className="secondary-button" disabled={busy || !ready || token.length < 16} onClick={() => connect('gmail')}>Allow Gmail read-only</button>
      <button className="secondary-button" disabled={busy || !ready || token.length < 16} onClick={() => connect('gmail-send')}>Allow Gmail send</button>
      <button className="primary-button" disabled={busy || !ready || token.length < 16} onClick={() => connect('drive')}>Allow Drive project files</button>
      <button className="secondary-button" disabled={busy || token.length < 16} onClick={() => { void refresh(true); }}>Refresh status</button>
      <button className="secondary-button" disabled={busy || !ready} onClick={disconnect}>Disconnect</button>
    </div>
    <p className="ai-help">Last checked: {checkedAt || 'Waiting for local access token'}. This does not connect Google Workspace or enable email sending. The server keeps no unencrypted Google refresh token on disk.</p>
    {status?.gmailEnabled && <div className="gmail-search">
      <label className="field-label">Gmail search (read-only)<input value={query} onChange={e => setQuery(e.target.value)} maxLength={250}/></label>
      <button className="primary-button" disabled={busy} onClick={search}>Search Gmail</button>
      {mail.map(m => <article key={m.id} className="gmail-result"><strong>{m.subject || '(No subject)'}</strong><small>{m.from} · {m.date}</small><p>{m.snippet}</p></article>)}
    </div>}
    {message && <p className="ai-help" role="status">{message}</p>}
  </section>;
}
