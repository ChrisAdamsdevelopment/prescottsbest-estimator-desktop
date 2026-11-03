import { useEffect, useMemo, useState } from 'react';
import type { Job } from './types';
import { getLessons, relevantLessons, storeLesson } from './assistantMemory';
import type { AssistantLesson } from './assistantMemory';
type Route = 'auto' | 'economy' | 'quality' | 'gemini' | 'openai' | 'anthropic';
export function AIAssistant({ job, token, setToken, questions, openSettings }: {
  job: Job; token: string; setToken: (x: string) => void; questions: string[]; openSettings: () => void;
}) {
  const [route, setRoute] = useState<Route>('auto');
  const [sendPhotos, setSendPhotos] = useState(false);
  const [sendLessons, setSendLessons] = useState(false);
  const [sendProject, setSendProject] = useState(false);
  const [question, setQuestion] = useState('');
  const [fallback, setFallback] = useState(false);
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState('');
  const [metadata, setMetadata] = useState('');
  const [lessons, setLessons] = useState<AssistantLesson[]>([]);
  const [correction, setCorrection] = useState('');
  const [feedback, setFeedback] = useState('');
  useEffect(() => { getLessons().then(setLessons).catch(() => setFeedback('Local memory unavailable on this device.')); }, [job.id]);
  const relevant = useMemo(() => relevantLessons(lessons, job.mode, job.title + ' ' + job.scope + ' ' + job.notes), [lessons, job.mode, job.title, job.scope, job.notes]);
  async function analyze() {
    setBusy(true); setAnalysis(''); setMetadata(''); setFeedback('');
    try {
      const res = await fetch('/api/analyze', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Estimator-Token': token },
        body: JSON.stringify({ title: job.title, mode: job.mode, scope: job.scope, notes: job.notes,
          question,
          projectContext: sendProject ? {
            contract: job.contract,
            items: job.items.slice(0, 15).map(({ description, category, qty, unit, unitCost }) => ({ description, category, qty, unit, unitCost })),
            selections: (job.selections || []).slice(0, 8).map(({ name, spec, manufacturer, model, quantity, unit, allowanceCost }) => ({ name, spec, manufacturer, model, quantity, unit, allowanceCost })),
            phases: (job.workPhases || []).slice(0, 10).map(({ name, personHours, crewSize, hoursPerDay, loadedCostPerHour, extraDays }) => ({ name, personHours, crewSize, hoursPerDay, loadedCostPerHour, extraDays })),
            actuals: (job.actualExpenses || []).slice(0, 10).map(({ category, description, amount }) => ({ category, description, amount }))
          } : null,
          images: sendPhotos ? job.photos.slice(0, 3) : [],
          lessons: sendLessons ? relevant.map(l => l.note) : [],
          routing: route, allowFallback: fallback })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI request failed');
      setAnalysis(data.analysis || 'No analysis text returned.');
      setMetadata('Used ' + data.provider + ' / ' + data.model + '. ' + data.routingReason +
        (data.tried?.length > 1 ? '. Tried: ' + data.tried.join(', ') : ''));
    } catch (e) { setAnalysis('AI unavailable: ' + (e instanceof Error ? e.message : 'connection error') +
      '. The manual checklist below is still available offline.'); }
    finally { setBusy(false); }
  }
  async function saveCorrection() {
    try {
      await storeLesson(job.mode, correction, 'feedback');
      setLessons(await getLessons());
      setCorrection(''); setFeedback('Correction saved locally; it can guide future analyses if you opt to include lessons.');
    } catch (e) { setFeedback(e instanceof Error ? e.message : 'Unable to save correction'); }
  }
  return <section className="panel">
    <div className="panel-head"><div><span className="eyebrow dark">AI / FIELD ASSISTANCE</span><h2>Your estimating copilot</h2></div></div>
    <p className="ai-help">Ask for a second look at job scope, materials, unknowns and safety flags. AI suggestions are drafts. Dimensions, costs, permits and licensing must be independently checked.</p>
    <div className="ai-welcome"><span>1</span><div><strong>Connect your model providers</strong><p>Use your own API keys. Routine work can use Gemini first; complex work can use a deeper model.</p><button className="secondary-button" onClick={openSettings}>Open AI Settings</button></div></div>
    <label className="field-label">Local AI access token<input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="From START_AI.bat on this PC" /></label>
    <div className="ai-divider" />
    <div className="ai-welcome"><span>2</span><div><strong>Choose how to analyze</strong><p>Auto selects based on job complexity and configured providers. Your choice is shown after every analysis.</p></div></div>
    <label className="field-label">Ask a question about this job<textarea rows={3} maxLength={2000} value={question} onChange={e => setQuestion(e.target.value)} placeholder="What should I verify before quoting this bathroom remodel?" /></label>
    <div className="ai-quick-prompts">
      {['What scope risks should I check?', 'Review supplier and material risks', 'What should I verify in the crew plan?', 'How can I improve cost accuracy?'].map(q => <button key={q} type="button" onClick={() => setQuestion(q)}>{q}</button>)}
    </div>
    <label className="field-label">AI routing<select value={route} onChange={e => setRoute(e.target.value as Route)}>
      <option value="auto">Smart auto (recommended)</option><option value="economy">Economy</option>
      <option value="quality">Quality / deeper review</option>
      <option value="gemini">Only Gemini</option><option value="openai">Only OpenAI</option><option value="anthropic">Only Claude</option>
    </select></label>
    <div className="ai-toggles">
      <label className="ai-checkbox"><input type="checkbox" checked={sendPhotos} onChange={e => setSendPhotos(e.target.checked)} disabled={!job.photos.length} /> Share up to 3 job photos ({job.photos.length} available)</label>
      <label className="ai-checkbox"><input type="checkbox" checked={sendProject} onChange={e => setSendProject(e.target.checked)} /> Share line-item costs, selections, crew hours and expense summaries</label>
      <label className="ai-checkbox"><input type="checkbox" checked={sendLessons} onChange={e => setSendLessons(e.target.checked)} disabled={!relevant.length} /> Include {relevant.length} relevant approved memory notes</label>
      <label className="ai-checkbox"><input type="checkbox" checked={fallback} onChange={e => setFallback(e.target.checked)} /> Allow fallback to another provider if a request fails</label>
    </div>
    <p className="ai-help">Only when you click Analyze, the selected provider receives your job title, scope, notes and question. Photos, cost details, and approved memory notes are shared only if selected. Fallback may send the same material to another provider.</p>
    <button className="primary-button ai-analyze-button" onClick={analyze} disabled={!token.trim() || busy}>{busy ? 'Reviewing job...' : 'Analyze job scope'}</button>
    {metadata && <p className="ai-model-info">{metadata}</p>}
    {analysis && <div className="ai-response"><strong>AI suggestions — verify before quoting</strong><pre>{analysis}</pre>
      {!analysis.startsWith('AI unavailable:') && <div className="ai-feedback"><p>Make the next analysis more useful</p>
        <button className="secondary-button" onClick={() => setFeedback('Thanks. This rating alone is not used for training; save a specific lesson below if useful.')}>Useful</button>
        <button className="secondary-button" onClick={() => setFeedback('Describe exactly what should change, then save your correction.')}>Needs correction</button>
        <label className="field-label">What should the assistant remember from this job?<textarea rows={2} maxLength={450} value={correction} onChange={e => setCorrection(e.target.value)} placeholder="Example: Always ask about existing waterproofing before budgeting a shower remodel." /></label>
        <button className="secondary-button" disabled={correction.trim().length < 4} onClick={saveCorrection}>Save this learning</button>
        {feedback && <p className="ai-help" role="status">{feedback}</p>}
      </div>}
    </div>}
    <div className="divider-line" /><h3>Field checklist (works offline)</h3>
    <p className="ai-help">Use this checklist even when AI providers are unavailable.</p>
    <div className="checklist">{questions.map((q, i) => <label key={i}><input type="checkbox" /><span>{q}</span></label>)}</div>
    <div className="caution"><span>Do not accept AI measurements, prices, structural assumptions, permits or license claims without verification.</span></div>
  </section>;
}
