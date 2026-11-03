import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Camera, Check, ClipboardList, Download, FileText, FolderOpen, HardHat, ImagePlus, Plus, Printer, Save, Settings2, ShieldAlert, Trash2, Upload, X } from './icons';
import type { Category, Job, LineItem, Mode } from './types';
import { blankJob, uid } from './types';
import { addPreset, calculate, money, PRESETS } from './estimate';
import { allJobs, exportJobs, importJobs, removeJob, saveJob } from './storage';
import { AddOnPanel } from './AddOnPanel';
import { optionPrice } from './pricebook';
import { ProjectPlanner } from './ProjectPlanner';
import { AISettings } from './AISettings';
import { AIAssistant } from './AIAssistant';
import { BridgePanel } from './BridgePanel';
import { GoogleConnections } from './GoogleConnections';
import { GoogleWorkspacePanel } from './GoogleWorkspacePanel';
import { PhotoVisualizer } from './PhotoVisualizer';
import { projectCommercial, scheduleForecast } from './projectModel';

type Screen = 'home' | 'edit' | 'quote' | 'settings' | 'bridge';
type Tab = 'details' | 'items' | 'photos' | 'assistant' | 'plan';
const categoryOptions: Category[] = ['labor', 'material', 'subcontract', 'other'];
const manualQuestions: Record<string, string[]> = {
  tv: ['TV size and weight?', 'Wall material and stud locations?', 'Customer-supplied mount?', 'Cable concealment or electrical work requested?', 'Height and access conditions?'],
  furniture: ['Manufacturer, model, and number of boxes?', 'Assembly instructions available?', 'Anchoring required?', 'Stairs or difficult access?', 'Packaging disposal requested?'],
  drywall: ['Hole dimensions and number of locations?', 'Any moisture or hidden damage?', 'Texture match required?', 'Paint match and drying trips?', 'Is this a rated wall or ceiling?'],
  shelves: ['Shelf dimensions and expected load?', 'Wall substrate and backing?', 'Customer-supplied hardware?', 'Level and layout requirements?'],
  door: ['Interior or exterior door?', 'Hinge, latch, or frame issue?', 'Damage or water intrusion?', 'Replacement parts required?'],
  painting: ['Surface area and condition?', 'Number of coats and colors?', 'Ceiling and trim included?', 'Furniture protection and prep?', 'Paint supplied by whom?'],
  flooring: ['Measured square footage and waste?', 'Existing floor removal?', 'Subfloor leveling and moisture?', 'Transitions, trim, and disposal?', 'Occupied-home access?'],
  bathroom: ['Measured plan and fixture selections?', 'Waterproofing system?', 'Plumbing/electrical changes?', 'Permit and inspection requirements?', 'Unknown damage and demolition?'],
  kitchen: ['Cabinet layout and lead times?', 'Countertop specifications?', 'Plumbing/electrical relocation?', 'Temporary kitchen needs?', 'Permit and inspection requirements?']
};
const number = (value: string) => Number.isFinite(Number(value)) ? Number(value) : 0;
const prettyDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
async function imageToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please select an image file.');
  if (file.size > 20_000_000) throw new Error('Photo is over 20 MB. Choose a smaller photo.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image processing unavailable');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.73);
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [tab, setTab] = useState<Tab>('details');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [filter, setFilter] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiPin, setAiPin] = useState(() => sessionStorage.getItem('pbc-tab-access') || '');
  const [rememberToken, setRememberToken] = useState(() => sessionStorage.getItem('pbc-tab-remember') === 'true');
  const importRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => { allJobs().then(setJobs).catch(() => setNotice('Local storage is unavailable. Check browser settings.')); }, []);
  useEffect(() => {
    if (rememberToken) { sessionStorage.setItem('pbc-tab-remember','true'); sessionStorage.setItem('pbc-tab-access',aiPin); }
    else { sessionStorage.removeItem('pbc-tab-remember'); sessionStorage.removeItem('pbc-tab-access'); }
  }, [aiPin, rememberToken]);
  useEffect(() => {
    if (!job) return;
    const timer = window.setTimeout(async () => {
      try { await saveJob(job); setJobs(await allJobs()); }
      catch { setNotice('Could not save locally. Export your work and check device storage.'); }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [job]);

  const totals = useMemo(() => job ? calculate(job) : null, [job]);
  const commercial = useMemo(() => job && totals ? projectCommercial(job, totals) : null, [job,totals]);
  const schedule = useMemo(() => job ? scheduleForecast(job) : null, [job]);
  const visibleJobs = jobs.filter(j => (j.customer + ' ' + j.title + ' ' + j.address).toLowerCase().includes(filter.toLowerCase()));
  function patch<K extends keyof Job>(key: K, value: Job[K]) { setJob(j => j ? { ...j, [key]: value } : j); }
  function openJob(selected: Job) { setJob(selected); setScreen('edit'); setTab('details'); }
  function newJob(mode: Mode) { openJob(blankJob(mode)); }
  function updateItem(id: string, key: keyof LineItem, value: string | number) {
    setJob(j => j ? { ...j, items: j.items.map(item => item.id === id ? { ...item, [key]: value } : item) } : j);
  }
  function addItem() {
    setJob(j => j ? { ...j, items: [...j.items, { id: uid(), description: '', category: 'labor', qty: 1, unit: 'hr', unitCost: 35 }] } : j);
  }
  async function addPhotos(files: FileList | null) {
    if (!files || !job) return;
    setBusy(true);
    try {
      const available = Math.max(0, 8 - job.photos.length);
      const selected = Array.from(files).slice(0, available);
      if (!selected.length) { setNotice('Maximum 8 photos per estimate.'); return; }
      const converted = await Promise.all(selected.map(imageToDataUrl));
      setJob(j => j ? { ...j, photos: [...j.photos, ...converted] } : j);
      setNotice(converted.length + ' photo(s) saved on this device.');
    } catch (err) { setNotice(err instanceof Error ? err.message : 'Photo upload failed.'); }
    finally { setBusy(false); if (photoRef.current) photoRef.current.value = ''; }
  }
  async function deleteCurrent() {
    if (!job || !confirm('Permanently delete this estimate and its photos from this device?')) return;
    await removeJob(job.id); setJobs(await allJobs()); setJob(null); setScreen('home'); setNotice('Estimate deleted.');
  }
  async function handleImport(file?: File) {
    if (!file) return;
    try { const count = await importJobs(file); setJobs(await allJobs()); setNotice('Imported ' + count + ' estimate(s).'); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Import failed.'); }
    if (importRef.current) importRef.current.value = '';
  }
  const currentPreset = PRESETS.find(p => p.id === job?.preset);
  const questions = manualQuestions[job?.preset || ''] || ['Confirm measurements and quantity.', 'Check substrate, access, and concealed conditions.', 'Confirm materials, specifications, and lead times.', 'Check license scope and permits.', 'Confirm travel, disposal, and repeat visits.'];

  return (
    <div className="app-shell">
      <header className="topbar no-print">
        <button className="brand" onClick={() => setScreen('home')} aria-label="Go to estimates"><span className="brand-mark">PB</span><span><strong>PRESCOTT'S BEST</strong><small>FIELD ESTIMATOR <span className="beta">MVP</span></small></span></button>
        <div className="header-right"><button className="icon-button" title="ChatGPT bridge" aria-label="ChatGPT bridge" onClick={() => setScreen('bridge')}><FolderOpen size={19} /></button><button className="icon-button" title="AI settings" aria-label="AI settings" onClick={() => setScreen('settings')}><Settings2 size={19} /></button><span className="local-chip"><span className="live-dot" /> LOCAL-FIRST</span><button className="icon-button" title="All estimates" onClick={() => setScreen('home')}><FolderOpen size={19} /></button></div>
      </header>
      {notice && <div className="notice no-print"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss"><X size={16} /></button></div>}
      {screen === 'home' && <main className="page home-page">
        <section className="hero"><div><div className="eyebrow">FIELD OPERATIONS / ESTIMATING</div><h1>Every job starts<br /><em>with a better estimate.</em></h1><p>Fast concierge quotes. Detailed remodel bids. One workspace for every opportunity.</p></div><div className="hero-icon"><HardHat size={68} strokeWidth={1.3} /></div></section>
        <div className="section-heading"><div><span className="eyebrow dark">START HERE</span><h2>New estimate</h2></div><span className="subtle">Choose your workflow</span></div>
        <div className="mode-grid">
          <button className="mode-card" onClick={() => newJob('concierge')}><span className="mode-icon gold"><ClipboardList size={24} /></span><strong>Concierge & small jobs</strong><span>TV mounts, furniture, repairs, installs</span><span className="mode-cta">Quick quote <span>→</span></span></button>
          <button className="mode-card" onClick={() => newJob('remodel')}><span className="mode-icon blue"><HardHat size={24} /></span><strong>Remodel & construction</strong><span>Kitchens, bathrooms, flooring, renovations</span><span className="mode-cta">Detailed estimate <span>→</span></span></button>
        </div>
        <div className="section-heading recent"><div><span className="eyebrow dark">YOUR WORKSPACE</span><h2>Saved estimates <span className="count">{jobs.length}</span></h2></div><div className="action-pair"><button className="text-button" onClick={exportJobs}><Download size={15} /> Back up</button><button className="text-button" onClick={() => importRef.current?.click()}><Upload size={15} /> Restore</button><input ref={importRef} type="file" accept=".json,application/json" hidden onChange={e => handleImport(e.target.files?.[0])} /></div></div>
        <input className="search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search customer, job, or address..." aria-label="Search estimates" />
        <div className="job-list">{visibleJobs.length ? visibleJobs.map(j => <button key={j.id} className="job-row" onClick={() => openJob(j)}><span className="job-avatar">{j.mode === 'concierge' ? 'C' : 'R'}</span><span className="job-info"><strong>{j.title || 'Untitled estimate'}</strong><small>{j.customer || 'No customer'} · {prettyDate(j.updatedAt)}</small></span><span className="job-right"><strong>{money(projectCommercial(j, calculate(j)).total)}</strong><small>{j.status}</small></span></button>) : <div className="empty"><FileText size={27} /><strong>{jobs.length ? 'No matching estimates' : 'Your next job starts here'}</strong><span>{jobs.length ? 'Try a different search.' : 'Choose a workflow above to create your first quote.'}</span></div>}</div>
        <p className="privacy-foot"><ShieldAlert size={15} /> Estimates and photos stay in this browser on this device unless you export them or explicitly request AI analysis. Back up regularly.</p>
      </main>}
      {screen === 'bridge' && <main className="page editor-page ai-config-page">
        <div className="editor-header"><button className="back-button" onClick={() => setScreen('home')}>Back to dashboard</button></div>
        <div className="editor-title"><div><span className="eyebrow dark">INTEGRATIONS / LOCAL</span><h1>ChatGPT connection</h1><p>Control which jobs are available through local tools.</p></div></div>
        <BridgePanel token={aiPin} setToken={setAiPin} rememberToken={rememberToken} setRememberToken={setRememberToken} onImported={async () => setJobs(await allJobs())} />
        <div style={{ marginTop: 20 }}><PhotoVisualizer token={aiPin} /></div>
        <div style={{ marginTop: 20 }}><GoogleConnections token={aiPin} /></div>
        <div style={{ marginTop: 20 }}><GoogleWorkspacePanel token={aiPin} /></div>
      </main>}
      {screen === 'settings' && <main className="page editor-page ai-config-page">
        <div className="editor-header"><button className="back-button" onClick={() => setScreen(job ? 'edit' : 'home')}>Back to {job ? 'estimate' : 'dashboard'}</button></div>
        <div className="editor-title"><div><span className="eyebrow dark">SETTINGS / AI</span><h1>AI & learning center</h1><p>Provider keys, routing, and approved memory in one place.</p></div></div>
        <AISettings token={aiPin} setToken={setAiPin} />
      </main>}
      {job && screen === 'edit' && totals && <main className="page editor-page">
        <div className="editor-header"><button className="back-button" onClick={() => setScreen('home')}><ArrowLeft size={17} /> Estimates</button><span className="save-state"><Save size={14} /> Auto-saved locally</span></div>
        <div className="editor-title"><div><span className="eyebrow dark">{job.mode === 'concierge' ? 'QUICK SERVICE QUOTE' : 'DETAILED PROJECT ESTIMATE'}</span><h1>{job.title || 'New estimate'}</h1><p>{job.customer || 'Add customer details'} · {prettyDate(job.createdAt)}</p></div><button className="outline-button" disabled={!job.items.length} onClick={() => setScreen('quote')}><FileText size={16} /> Quote preview</button></div>
        <nav className="tabs" aria-label="Estimate sections">{([['details', '01', 'Job'], ['items', '02', 'Pricing'], ['photos', '03', 'Photos'], ['plan', '04', 'Project'], ['assistant', '05', 'AI assist']] as [Tab,string,string][]).map(([id, num, title]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><span>{num}</span> {title}</button>)}</nav>
        <div className="editor-layout"><div className="main-panel">
          {tab === 'details' && <section className="panel"><div className="panel-head"><div><span className="eyebrow dark">01 / PROJECT DETAILS</span><h2>Know the job</h2></div></div>
            <div className="field-grid"><label>Customer name<input value={job.customer} onChange={e => patch('customer', e.target.value)} placeholder="Customer or company" /></label><label>Phone<input type="tel" value={job.phone} onChange={e => patch('phone', e.target.value)} placeholder="(928) 000-0000" /></label><label className="wide">Job address<input value={job.address} onChange={e => patch('address', e.target.value)} placeholder="Street address, city, ZIP" /></label><label className="wide">Job title<input value={job.title} onChange={e => patch('title', e.target.value)} placeholder="e.g., Living room TV mount" /></label></div>
            <div className="divider-line" /><label className="field-label">Service preset<select value={job.preset} onChange={e => { if (job.items.length && !confirm('Replace existing line items with this preset?')) return; setJob(j => j ? addPreset(j, e.target.value) : j); }}><option value="">Select a preset or start from scratch</option>{PRESETS.filter(p => p.mode === job.mode).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label><p className="field-help">Presets replace current line items. All preset prices and hours are illustrative, not market-verified.</p>
            <label className="field-label">Scope of work<textarea rows={4} value={job.scope} onChange={e => patch('scope', e.target.value)} placeholder="Describe exactly what is included..." /></label><label className="field-label">Job-site notes<textarea rows={3} value={job.notes} onChange={e => patch('notes', e.target.value)} placeholder="Measurements, access, photos, customer requests, unknowns..." /></label><label className="field-label">Exclusions<textarea rows={3} value={job.exclusions} onChange={e => patch('exclusions', e.target.value)} /></label>
            <div className="caution"><AlertTriangle size={18} /><span>Confirm ROC scope, permit requirements, safety conditions, and subcontractor qualifications before accepting work. The separate GC license is pending verification.</span></div>
          </section>}
          {tab === 'items' && <section className="panel"><div className="panel-head"><div><span className="eyebrow dark">02 / COST BUILDUP</span><h2>Estimate line items</h2></div><button className="small-primary" onClick={addItem}><Plus size={16} /> Add item</button></div><p className="field-help top-help">Enter your real internal costs, not customer prices. Labor cost should include the actual burden you choose to model. Customer selling price is calculated below.</p>
            {job.items.length === 0 && <div className="empty small"><ClipboardList size={25} /><strong>No line items yet</strong><span>Choose a preset on the Job tab or add items here.</span></div>}
            <div className="line-items">{job.items.map((item, index) => <div className="line-item" key={item.id}><div className="line-heading"><span>ITEM {String(index + 1).padStart(2, '0')}</span><button className="delete-mini" aria-label="Remove item" onClick={() => patch('items', job.items.filter(i => i.id !== item.id))}><Trash2 size={16} /></button></div><input className="item-description" value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} placeholder="Describe work or material" /><div className="item-grid"><label>Type<select value={item.category} onChange={e => updateItem(item.id, 'category', e.target.value)}>{categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}</select></label><label>Qty<input type="number" min="0" step="0.25" value={item.qty} onChange={e => updateItem(item.id, 'qty', number(e.target.value))} /></label><label>Unit<input value={item.unit} onChange={e => updateItem(item.id, 'unit', e.target.value)} /></label><label>Cost / unit<input type="number" min="0" step="0.01" value={item.unitCost} onChange={e => updateItem(item.id, 'unitCost', number(e.target.value))} /></label></div><div className="item-total">Modeled cost <strong>{money(item.qty * item.unitCost)}</strong></div></div>)}</div>
            <AddOnPanel job={job} onChange={setJob} />
            <div className="divider-line" /><div className="panel-head compact"><div><span className="eyebrow dark">PRICING CONTROLS</span><h2>Margins & allowances</h2></div></div><div className="field-grid three"><label>Target margin %<input type="number" min="0" max="95" value={job.margin} onChange={e => patch('margin', number(e.target.value))} /></label><label>Contingency %<input type="number" min="0" value={job.contingency} onChange={e => patch('contingency', number(e.target.value))} /></label><label>Overhead allowance $<input type="number" min="0" value={job.overheadAllowance} onChange={e => patch('overheadAllowance', number(e.target.value))} /></label><label>Minimum charge $<input type="number" min="0" value={job.minimumCharge} onChange={e => patch('minimumCharge', number(e.target.value))} /></label><label>Discount $<input type="number" min="0" value={job.discount} onChange={e => patch('discount', number(e.target.value))} /></label><label>Tax rate %<input type="number" min="0" value={job.taxRate} onChange={e => patch('taxRate', number(e.target.value))} /></label></div><p className="field-help">Selling price = (direct costs + contingency + overhead allowance) ÷ (1 − target margin), subject to minimum and discount. Tax defaults to 0% pending job-specific verification. This is a model, not a tax determination.</p>
          </section>}
          {tab === 'photos' && <section className="panel"><div className="panel-head"><div><span className="eyebrow dark">03 / FIELD DOCUMENTATION</span><h2>Site photos</h2></div><span className="subtle">{job.photos.length} / 8 photos</span></div><p className="field-help top-help">Capture job conditions, measurements, materials, and access. Images are resized before local storage; original files remain on your device.</p><button className="photo-upload" onClick={() => photoRef.current?.click()} disabled={busy || job.photos.length >= 8}><Camera size={25} /><strong>Take or add photos</strong><span>Camera or photo library · up to 8 images</span></button><input ref={photoRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={e => addPhotos(e.target.files)} /><div className="photo-grid">{job.photos.map((src, i) => <div className="photo" key={i}><img src={src} alt={'Job site photo ' + (i + 1)} /><button aria-label="Remove photo" onClick={() => patch('photos', job.photos.filter((_, j) => i !== j))}><X size={15} /></button><span>PHOTO {i + 1}</span></div>)}</div>{!job.photos.length && <div className="photo-tip"><ImagePlus size={18} /> Add photos to document the scope and enable optional AI analysis.</div>}</section>}
          {tab === 'plan' && <ProjectPlanner job={job} onChange={setJob} />}
          {tab === 'assistant' && <AIAssistant job={job} token={aiPin} setToken={setAiPin} questions={questions} openSettings={() => setScreen('settings')} />}
        </div>
        <aside className="summary-panel"><div className="summary-head"><span className="eyebrow">LIVE ESTIMATE</span><h2>{money(commercial?.total ?? totals.total)}</h2><p>Estimated customer total</p></div><div className="summary-body"><div className="summary-row"><span>Labor cost</span><strong>{money(totals.costByCategory.labor)}</strong></div><div className="summary-row"><span>Materials cost</span><strong>{money(totals.costByCategory.material)}</strong></div><div className="summary-row"><span>Subs & other</span><strong>{money(totals.costByCategory.subcontract + totals.costByCategory.other)}</strong></div><div className="summary-row"><span>Contingency</span><strong>{money(totals.contingencyCost)}</strong></div><div className="summary-row"><span>Overhead allowance</span><strong>{money(totals.overhead)}</strong></div><div className="summary-divider" /><div className="summary-row"><span>Modeled cost</span><strong>{money(totals.totalModeledCost)}</strong></div><div className="summary-row"><span>{commercial?.mode === 'cost_plus' ? 'Cost-plus forecast before tax' : 'Fixed price before tax'}</span><strong>{money(commercial?.beforeTax ?? totals.afterDiscount)}</strong></div><div className="summary-row"><span>Tax (configurable)</span><strong>{money(commercial?.tax ?? totals.tax)}</strong></div><div className="summary-divider" /><div className="summary-row emphasized"><span>Modeled profit*</span><strong className={(commercial?.projectedProfit ?? totals.projectedProfit) < 0 ? 'negative' : 'positive'}>{money(commercial?.projectedProfit ?? totals.projectedProfit)}</strong></div><div className="summary-row"><span>Modeled margin*</span><strong>{(commercial?.projectedMargin ?? totals.projectedMargin).toFixed(1)}%</strong></div><p className="summary-disclaimer">*After listed costs and allowance only. Excludes unmodeled expenses; not actual net profit.</p><button className="primary-button full" disabled={!job.items.length} onClick={() => setScreen('quote')}><FileText size={17} /> Preview customer quote</button><button className="secondary-button full" onClick={() => { saveJob(job).then(() => setNotice('Estimate saved locally.')); }}><Save size={16} /> Save draft</button><button className="danger-button" onClick={deleteCurrent}><Trash2 size={15} /> Delete estimate</button></div></aside></div>
      </main>}
      {job && screen === 'quote' && totals && <main className="page quote-page"><div className="quote-toolbar no-print"><button className="back-button" onClick={() => setScreen('edit')}><ArrowLeft size={17} /> Edit estimate</button><div><button className="outline-button" onClick={() => window.print()}><Printer size={16} /> Print / Save PDF</button></div></div><article className="quote-document"><div className="quote-top"><div className="quote-brand"><span className="brand-mark">PB</span><div><strong>PRESCOTT'S BEST CONSTRUCTION</strong><span>Prescott Valley, Arizona · (928) 350-0940</span><span>www.prescottsbestconstruction.com</span></div></div><div className="quote-label">ESTIMATE</div></div><div className="quote-meta"><div><span>PREPARED FOR</span><strong>{job.customer || 'Customer name needed'}</strong><p>{job.address || 'Job site address not entered'}</p><p>{job.phone}</p></div><div><span>ESTIMATE DETAILS</span><p>Reference: {job.id.slice(0, 8).toUpperCase()}</p><p>Date: {prettyDate(new Date().toISOString())}</p><p>Valid for: {job.validDays} days</p></div></div><h1>{job.title || 'Proposed work'}</h1>{schedule && <p className="quote-fine">Preliminary sequential production scenario: {schedule.totalWorkDays} workdays, {schedule.totalPersonHours} person-hours. Subject to material availability, inspections, scope and crew scheduling.</p>}<h3>Scope of work</h3><p className="scope-text">{job.scope || 'Scope to be confirmed before quote acceptance.'}</p><div className="quote-line"><span>{commercial?.mode === 'cost_plus' ? 'Cost-plus projected direct costs and fee before discount' : 'Base proposed work'}</span><strong>{money(commercial?.mode === 'cost_plus' ? commercial.beforeTax + job.discount : totals.basePrice)}</strong></div>
      {(job.addOns ?? []).map(option => <div className="quote-line" key={option.id}><span>{option.included ? 'Included upgrade: ' : 'Optional (not included): '}{option.description}</span><strong>{option.included ? (commercial?.mode === 'cost_plus' ? 'Included in forecast' : money(optionPrice(job, option))) : 'Not included'}</strong></div>)}
      {job.discount > 0 && <div className="quote-line"><span>Discount</span><strong>-{money(Math.min(job.discount, totals.subtotal))}</strong></div>}
      {totals.tax > 0 && <div className="quote-line"><span>Tax</span><strong>{money(commercial?.tax ?? totals.tax)}</strong></div>}<div className="quote-total"><span>ESTIMATED TOTAL</span><strong>{money(commercial?.total ?? totals.total)}</strong></div>{commercial?.mode === 'cost_plus' && <p className="quote-fine">COST-PLUS FORECAST, NOT A FIXED PRICE: Estimated reimbursable costs {money(commercial.projectedReimbursableCosts)}, including {money(commercial.projectedReserve)} forecast risk reserve; estimated contractor fee {money(commercial.projectedFee)}. Final billing depends on actual eligible receipts, labor, selections, change orders and the signed contract. Fee and tax handling must be confirmed.</p>}<h3>Exclusions & conditions</h3><p className="scope-text">{job.exclusions}</p><p className="quote-fine">Estimate is subject to site verification, customer product selections, distributor quotes and delivery confirmation, agreed scope, and any required permits. Hidden conditions or scope changes may require a written revised estimate. Payment schedule and final terms to be agreed before work begins. No work is authorized by this draft alone.</p><div className="quote-bottom"><div>Prepared by Prescott's Best Construction</div><span>ROC #343141 · B-3 General Remodeling and Repair (verify scope before contracting)</span></div></article><div className="quote-warning no-print"><AlertTriangle size={17} /> Preview only. Review scope, quantities, tax, license authority, and all pricing before sending. Printing does not send or approve the quote.</div></main>}
      <footer className="app-footer no-print"><span>© {new Date().getFullYear()} Prescott's Best Construction</span><span>PRIVATE FIELD TOOL · v0.1</span></footer>
    </div>
  );
}
