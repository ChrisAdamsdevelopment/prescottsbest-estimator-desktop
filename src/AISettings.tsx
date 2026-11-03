import { useEffect, useState } from 'react';
import { deleteLesson, getLessons, storeLesson } from './assistantMemory';
import type { AssistantLesson, LessonCategory } from './assistantMemory';
type Provider = 'gemini' | 'openai' | 'anthropic';
type ProviderState = { configured: boolean; enabled: boolean; model: string };
type PublicConfig = { policy: string; providers: Record<Provider, ProviderState> };
type VerifyResult = { checkedAt: string; providers: Record<Provider,{ authorized: boolean; modelListed: boolean; status: string }> };
const providers: { id: Provider; name: string; detail: string; url: string }[] = [
  { id: 'gemini', name: 'Google Gemini', detail: 'Good for routine analysis. Free-tier requests may be used by Google to improve products; do not share confidential client content without permission.', url: 'https://aistudio.google.com/app/apikey' },
  { id: 'openai', name: 'OpenAI', detail: 'Useful for detailed visual review and complex scopes.', url: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', name: 'Anthropic Claude', detail: 'Useful for detailed reasoning and long, complicated scopes.', url: 'https://console.anthropic.com/settings/keys' }
];
const defaults: PublicConfig = { policy: 'auto', providers: {
  gemini: { configured: false, enabled: false, model: 'gemini-3.5-flash-lite' },
  openai: { configured: false, enabled: false, model: 'gpt-5.5' },
  anthropic: { configured: false, enabled: false, model: 'claude-sonnet-5-5' }
} };
function request(path: string, token: string, body?: unknown) {
  return fetch(path, { method: body ? 'POST' : 'GET', headers: {
    'Content-Type': 'application/json', 'X-Estimator-Token': token
  }, ...(body ? { body: JSON.stringify(body) } : {}) }).then(async res => {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'AI server error');
    return data;
  });
}
export function LearningMemory() {
  const [lessons, setLessons] = useState<AssistantLesson[]>([]);
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<LessonCategory>('all');
  const [message, setMessage] = useState('');
  const reload = () => getLessons().then(setLessons).catch(() => setMessage('Browser memory is unavailable.'));
  useEffect(() => { void reload(); }, []);
  async function add() {
    try { await storeLesson(category, note); setNote(''); await reload(); setMessage('Lesson saved on this device.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not save'); }
  }
  return <section className="panel ai-settings-section">
    <div className="panel-head"><div><span className="eyebrow dark">PERSONALIZATION</span><h2>Teach your assistant</h2></div></div>
    <p className="ai-help">Save how you and Andrew prefer to work: preferred estimate language, approved estimating habits, and lessons learned. Review or delete any lesson. These notes stay on this browser and are only sent to an AI provider when you explicitly choose to include them.</p>
    <label className="field-label">What should it remember?<textarea rows={3} maxLength={450} value={note} onChange={e => setNote(e.target.value)} placeholder="Example: On custom kitchen remodels, ask for exact manufacturer, finish and distributor quote before pricing materials." /></label>
    <div className="ai-actions"><label>Applies to<select value={category} onChange={e => setCategory(e.target.value as LessonCategory)}>
      <option value="all">All jobs</option><option value="concierge">Small jobs</option><option value="remodel">Remodels</option>
    </select></label><button className="primary-button" onClick={add} disabled={note.trim().length < 4}>Save lesson</button></div>
    {message && <p role="status" className="ai-help">{message}</p>}
    <div className="ai-lesson-list">{lessons.length ? lessons.map(l => <div key={l.id} className="ai-lesson">
      <span><small>{l.category === 'all' ? 'All jobs' : l.category} · {new Date(l.createdAt).toLocaleDateString()}</small>{l.note}</span>
      <button type="button" onClick={async () => { await deleteLesson(l.id); await reload(); }} aria-label="Delete memory">Delete</button>
    </div>) : <p className="ai-help">No saved lessons yet. Your assistant starts without personal preferences.</p>}</div>
  </section>;
}
export function AISettings({ token, setToken }: { token: string; setToken: (x: string) => void }) {
  const [config, setConfig] = useState<PublicConfig>(defaults);
  const [keys, setKeys] = useState<Record<Provider, string>>({ gemini: '', openai: '', anthropic: '' });
  const [removes, setRemoves] = useState<Record<Provider, boolean>>({ gemini: false, openai: false, anthropic: false });
  const [status, setStatus] = useState('');
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const [verified, setVerified] = useState<VerifyResult | null>(null);
  useEffect(() => { fetch('/api/health').then(r => r.json()).then(d => setOnline(d.status === 'ok')).catch(() => setOnline(false)); }, []);
  async function unlock() {
    try { const c = await request('/api/config', token) as PublicConfig; setConfig(c); setOpened(true); setStatus('Settings unlocked. Keys are never displayed again after saving.'); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Unable to connect'); }
  }
  function patch(n: Provider, field: keyof ProviderState, value: boolean | string) {
    setConfig(c => ({ ...c, providers: { ...c.providers, [n]: { ...c.providers[n], [field]: value } } }));
  }
  async function save() {
    setBusy(true); setStatus('');
    try {
      const payload = { policy: config.policy, providers: Object.fromEntries(providers.map(({ id }) => [id, {
        model: config.providers[id].model, enabled: config.providers[id].enabled, key: keys[id], remove: removes[id]
      }])) };
      const c = await request('/api/config', token, payload) as PublicConfig;
      setConfig(c); setKeys({ gemini: '', openai: '', anthropic: '' }); setRemoves({ gemini: false, openai: false, anthropic: false });
      setStatus('Saved to the private AI server. No provider calls made.');
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Unable to save'); }
    finally { setBusy(false); }
  }
  async function verifyKeys() {
    setBusy(true); setStatus('Checking provider credentials and model availability without generating AI responses...');
    try { const result = await request('/api/provider-check', token) as VerifyResult;
      setVerified(result); setStatus('Provider checks complete. Results are current; no AI generation charges incurred.'); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Provider checks failed'); }
    finally { setBusy(false); }
  }
  async function test(n: Provider) {
    setBusy(true); setStatus('Testing ' + n + ' (this makes one small API call).');
    try { const result = await request('/api/test-provider', token, { provider: n }); setStatus(result.provider + ' connection successful with ' + result.model); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Provider test failed'); }
    finally { setBusy(false); }
  }
  return <div className="ai-settings-grid">
    <section className="panel ai-settings-section">
      <div className="panel-head"><div><span className="eyebrow dark">AI CONTROL CENTER</span><h2>Provider connections</h2></div></div>
      <p className="ai-help">Paste a key once, choose a model, then save. Keys are held by the local Node AI server in a private file outside the browser bundle. The server's file is not encrypted; protect the Windows account and never publish this development server.</p>
      <div className="ai-status"><strong>{online ? 'Local AI server detected' : 'AI server offline'}</strong><span>{online ? 'Unlock with the local access token below.' : 'Double-click START_AI.bat, then return here.'}</span></div>
      <label className="field-label">Private access token (shown when START_AI.bat starts)
        <input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" placeholder="Enter the local access token" />
      </label>
      {!opened ? <button className="primary-button" disabled={!token || !online} onClick={unlock}>Unlock AI settings</button> : <>
        <label className="field-label">Routing preference<select value={config.policy} onChange={e => setConfig(c => ({ ...c, policy: e.target.value }))}>
          <option value="auto">Smart auto: simple = economical, complex = deeper review</option>
          <option value="economy">Economy: Gemini first</option><option value="quality">Quality: Claude/OpenAI first</option>
          <option value="gemini">Only Gemini</option><option value="openai">Only OpenAI</option><option value="anthropic">Only Anthropic</option>
        </select></label>
        <div className="ai-provider-grid">{providers.map(p => <div className="ai-provider-card" key={p.id}>
          <div className="ai-provider-title"><strong>{p.name}</strong><span>{config.providers[p.id].configured && !removes[p.id] ? 'Key saved' : 'No key saved'}</span></div>
          {verified && <p className="ai-help" role="status">{verified.providers[p.id]?.authorized ? verified.providers[p.id].modelListed ? 'Verified: credential valid and model listed' : 'Credential valid; check selected model' : verified.providers[p.id]?.status}</p>}
          <p className="ai-help">{p.detail} <a href={p.url} target="_blank" rel="noopener noreferrer">Get API key</a></p>
          <label className="field-label">API key<input type="password" autoComplete="new-password" value={keys[p.id]} onChange={e => { setKeys(k => ({ ...k, [p.id]: e.target.value })); if (e.target.value.trim() && !config.providers[p.id].configured) patch(p.id, 'enabled', true); }} placeholder={config.providers[p.id].configured ? 'Leave blank to keep existing key' : 'Paste your API key'} /></label>
          <label className="field-label">Model ID<input value={config.providers[p.id].model} onChange={e => patch(p.id, 'model', e.target.value)} /></label>
          <div className="ai-actions"><label className="ai-checkbox"><input type="checkbox" checked={config.providers[p.id].enabled} onChange={e => patch(p.id, 'enabled', e.target.checked)} /> Enabled</label>
            <label className="ai-checkbox"><input type="checkbox" checked={removes[p.id]} onChange={e => setRemoves(m => ({ ...m, [p.id]: e.target.checked }))} /> Remove saved key</label></div>
          <button className="secondary-button" disabled={busy || !config.providers[p.id].configured || !config.providers[p.id].enabled || removes[p.id]} onClick={() => test(p.id)}>Test connection</button>
        </div>)}</div>
        <div className="ai-actions"><button className="primary-button" disabled={busy} onClick={save}>{busy ? 'Working...' : 'Save keys & routing'}</button>
          <button className="secondary-button" disabled={busy} onClick={verifyKeys}>Verify saved keys without AI generation</button></div>
      </>}
      {status && <p className="ai-help" role="status">{status}</p>}
    </section>
    <LearningMemory />
  </div>;
}
