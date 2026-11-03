import { useEffect, useState } from 'react';
import { allJobs, saveJob } from './storage';
import type { Job } from './types';

type BridgeStatus = { connected: boolean; total: number; mcpDrafts: number; browserSnapshots: number; lastUpdated: string };
const revisionKey = 'pbc-bridge-revisions-v1';
function readRevisions(): Record<string, number> { try { return JSON.parse(localStorage.getItem(revisionKey) || '{}'); } catch { return {}; } }
function writeRevisions(values: Record<string, number>) { localStorage.setItem(revisionKey, JSON.stringify(values)); }
const call = async (route: string, token: string, data?: unknown) => {
  const response = await fetch('/api/bridge/' + route, {
    method: data ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Estimator-Token': token },
    ...(data ? { body: JSON.stringify(data) } : {})
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Local bridge unavailable');
  return payload;
};
export function BridgePanel({ token, setToken, rememberToken, setRememberToken, onImported }: {
  token: string; setToken: (value: string) => void; rememberToken: boolean;
  setRememberToken: (value: boolean) => void; onImported: () => Promise<void>;
}) {
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true);
    try {
      setStatus(await call('status', token));
      setMessage('Connected to private local bridge.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Bridge unavailable'); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (token.length >= 16) void refresh(); else setStatus(null); }, [token]);
  async function share() {
    if (!window.confirm('Share job names, addresses, line items, supplier/crew information and notes with the local MCP bridge? Photos and saved AI keys will NOT be copied.')) return;
    setBusy(true);
    try {
      const revisions = readRevisions();
      const jobs = (await allJobs()).map(job => ({ ...job, baseRevision: revisions[job.id] || 0,
        photoCount: job.photos.length, photos: [] }));
      const result = await call('push', token, { jobs });
      writeRevisions({ ...revisions, ...result.revisions });
      setMessage('Shared ' + result.added + ' new snapshots, updated ' + result.updated + '. ' + result.unchanged +
        ' unchanged; ' + result.conflicts.length + ' revision conflicts left untouched.');
      setStatus(await call('status', token));
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Share failed'); }
    finally { setBusy(false); }
  }
  async function importDrafts() {
    setBusy(true);
    try {
      const [local, response] = await Promise.all([allJobs(), call('jobs', token)]);
      const existing = new Set(local.map(j => j.id));
      const newDrafts = response.incomingDrafts.filter((j: { id: string; status: string }) => !existing.has(j.id) && j.status === 'draft') as Array<Job & { bridgeRevision: number }>;
      const versions = readRevisions();
      for (const draft of newDrafts) {
        const { bridgeRevision, ...fields } = draft;
        await saveJob({ ...fields, photos: [] } as Job);
        versions[draft.id] = bridgeRevision;
      }
      writeRevisions(versions);
      await onImported();
      setMessage('Imported ' + newDrafts.length + ' new ChatGPT drafts. Existing local jobs were never overwritten.');
      setStatus(await call('status', token));
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Import failed'); }
    finally { setBusy(false); }
  }
  return <div className="bridge-grid">
    <section className="panel bridge-panel">
      <div className="panel-head"><div><span className="eyebrow dark">LOCAL INTEGRATION</span><h2>ChatGPT & MCP bridge</h2></div></div>
      <p className="ai-help">Let a connected MCP client or this chat (via Desktop Commander) work with project drafts and approved job snapshots without making separate model API calls.</p>
      <label className="field-label">Private local access token
        <input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" placeholder="Shown in START_AI.bat" />
      </label>
      <label className="ai-checkbox"><input type="checkbox" checked={rememberToken} onChange={e => setRememberToken(e.target.checked)} /> Keep this access token until I close this browser tab (optional; shared computers should leave this off)</label>
      <button className="secondary-button" disabled={busy || token.length < 16} onClick={refresh}>Check local bridge</button>
      <div className="bridge-stat">
        <strong>{status ? 'Bridge connected' : 'Not connected yet'}</strong>
        <span>{status ? status.browserSnapshots + ' shared snapshots · ' + status.mcpDrafts + ' conversation drafts' : 'Start START_AI.bat on this computer and enter its token.'}</span>
      </div>
      <div className="bridge-actions">
        <div><strong>Share existing estimates</strong><p>Copies scope, project economics, contact details and notes into the private local bridge; excludes all photos and API keys. Snapshots use revision checks and never silently overwrite conflicts.</p>
          <button className="primary-button" disabled={busy || !status} onClick={share}>Share local job snapshots</button></div>
        <div><strong>Import drafts from ChatGPT</strong><p>New chat-created unpriced estimates come into your browser as editable drafts. Existing jobs are never overwritten.</p>
          <button className="secondary-button" disabled={busy || !status} onClick={importDrafts}>Import new drafts</button></div>
      </div>
      {message && <p className="ai-help" role="status">{message}</p>}
    </section>
    <section className="panel bridge-panel">
      <div className="panel-head"><div><span className="eyebrow dark">WHAT'S POSSIBLE</span><h2>Talk, don't duplicate work</h2></div></div>
      <p className="ai-help">Examples: "Create a bathroom remodel draft", "Look at my shared jobs", "Compare the itemized estimates", or "Add these observations from the photo I uploaded in ChatGPT."</p>
      <p className="ai-help">The local MCP server runs with local tool clients. ChatGPT's direct custom MCP connection additionally requires an eligible connection and a supported secure tunnel/HTTPS deployment.</p>
      <p className="ai-help">When you use this chat, Desktop Commander can read the same bridge from your authorized computer. Sending emails, ordering materials and modifying approved quotes remain separate approval workflows.</p>
    </section>
  </div>;
}
