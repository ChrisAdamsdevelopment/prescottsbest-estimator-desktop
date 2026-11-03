import { useState } from 'react';
import type { Job, Selection, SupplierQuote, WorkPhase, ActualExpense } from './types';
import { uid } from './types';
import { calculate, money } from './estimate';
import { compareSupplierQuotes, landedQuoteCost, projectCommercial, rfqDraft, scheduleForecast } from './projectModel';

export function ProjectPlanner({ job, onChange }: { job: Job; onChange: (next: Job) => void }) {
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState('');
  const contract = job.contract ?? { mode: 'fixed' as const, feeBasis: 'percent' as const, feePercent: 20, fixedFee: 0, note: '' };
  const selections = job.selections ?? [];
  const quotes = job.supplierQuotes ?? [];
  const phases = job.workPhases ?? [];
  const actuals = job.actualExpenses ?? [];
  const forecast = projectCommercial(job, calculate(job));
  const schedule = scheduleForecast(job);
  const patchContract = (value: Partial<typeof contract>) => onChange({ ...job, contract: { ...contract, ...value } });
  const updateSelection = (id: string, change: Partial<Selection>) => onChange({ ...job, selections: selections.map(x => x.id === id ? { ...x, ...change } : x) });
  const updateQuote = (id: string, change: Partial<SupplierQuote>) => onChange({ ...job, supplierQuotes: quotes.map(x => x.id === id ? { ...x, ...change } : x) });
  const updatePhase = (id: string, change: Partial<WorkPhase>) => onChange({ ...job, workPhases: phases.map(x => x.id === id ? { ...x, ...change } : x) });
  const updateExpense = (id: string, change: Partial<ActualExpense>) => onChange({ ...job, actualExpenses: actuals.map(x => x.id === id ? { ...x, ...change } : x) });
  const addSelection = () => {
    const id = uid();
    onChange({ ...job, selections: [...selections, { id, name: '', category: 'Windows / doors', spec: '', manufacturer: '', model: '', quantity: 1, unit: 'ea', allowanceCost: 0, chosenQuoteId: '', approvedByCustomer: false }] });
    setExpanded(id);
  };
  const addQuote = (selectionId: string) => {
    const id = uid();
    onChange({ ...job, supplierQuotes: [...quotes, { id, selectionId, supplier: '', supplierRef: '', status: 'requested', exactSpec: false, unitCost: 0, quantity: selections.find(s => s.id === selectionId)?.quantity ?? 1, shipping: 0, taxAndFees: 0, leadDays: 0, validUntil: '', notes: '' }] });
    setExpanded(selectionId);
  };
  const choose = (s: Selection, q: SupplierQuote) => {
    const ranked = compareSupplierQuotes(s, quotes);
    if (!ranked.ranked.some(x => x.id === q.id)) { setMessage('Only a current, supplier-confirmed, exact-specification quote with enough quantity can be chosen.'); return; }
    updateSelection(s.id, { chosenQuoteId: q.id });
    setMessage('Vendor quote chosen for planning. No purchase order has been placed.');
  };
  const syncSelected = (s: Selection) => {
    const quote = quotes.find(q => q.id === s.chosenQuoteId);
    const eligible = compareSupplierQuotes(s, quotes).ranked.some(q => q.id === quote?.id);
    if (!s.approvedByCustomer || !quote || !eligible) { setMessage('Customer approval and a current exact-spec supplier confirmation are required.'); return; }
    const itemId = 'selected-supplier-' + s.id;
    const item = { id: itemId, category: 'material' as const, description: s.name + ' — ' + s.manufacturer + ' ' + s.model + ' (supplier ' + quote.supplier + ', quote ' + quote.supplierRef + ')', qty: 1, unit: 'lot', unitCost: landedQuoteCost(quote) };
    onChange({ ...job, items: [...job.items.filter(x => x.id !== itemId), item] });
    setMessage('Confirmed delivered supplier cost added to the estimate. Check for duplicate material allowances and remove them.');
  };
  const syncLabor = () => {
    if (!confirm('Replace all existing labor line items with the planned crew-hours/labor-cost scenario? Review rates and any duplicate tasks afterward.')) return;
    const hours = schedule.totalPersonHours;
    const costPerHour = hours > 0 ? schedule.plannedLaborCost / hours : 0;
    onChange({ ...job, items: [...job.items.filter(x => x.category !== 'labor'), { id: 'planned-field-labor', category: 'labor', description: 'Planned field labor — confirm crew and hours', qty: hours, unit: 'person-hour', unitCost: costPerHour }] });
    setMessage('Labor plan applied to the estimating cost base. Recheck subcontractor and labor scope.');
  };
  const copyRfq = async (s: Selection) => {
    try { await navigator.clipboard.writeText(rfqDraft(s, job.customer, job.address)); setMessage('RFQ copied. Paste into an email to a supplier; nothing was sent.'); }
    catch { setMessage('Clipboard unavailable. Use an HTTPS or localhost browser context.'); }
  };
  const fieldNum = (label: string, val: number, change: (n: number) => void, step = '1') => <label>{label}<input type="number" min="0" step={step} value={val} onChange={e => change(Number(e.target.value) || 0)}/></label>;
  return <div className="operations-workspace">
    <div className="panel">
      <div className="panel-head"><div><span className="eyebrow dark">CONTRACT & FINANCIAL MODEL</span><h2>Cost-plus or fixed price</h2></div></div>
      <p className="field-help">High-end custom remodels normally use cost-plus. Only the signed contract determines reimbursable costs, fees, changes, and invoicing. All values start as illustrative until Andrew enters his approved terms.</p>
      <div className="operations-grid">
        <label>Contract pricing model<select value={contract.mode} onChange={e => patchContract({mode: e.target.value as 'cost_plus'|'fixed'})}><option value="cost_plus">Cost-plus / open-book (default for new remodels)</option><option value="fixed">Fixed-price quote</option></select></label>
        {contract.mode === 'cost_plus' && <label>Contractor fee model<select value={contract.feeBasis} onChange={e => patchContract({feeBasis:e.target.value as 'percent'|'fixed'})}><option value="percent">Cost plus percentage fee</option><option value="fixed">Cost plus fixed fee</option></select></label>}
        {contract.mode === 'cost_plus' && (contract.feeBasis === 'percent' ? fieldNum('Fee on eligible projected costs (%)',contract.feePercent,n=>patchContract({feePercent:n}),'0.25') : fieldNum('Fixed contractor fee ($)',contract.fixedFee,n=>patchContract({fixedFee:n}),'0.01'))}
      </div>
      <label className="field-label">Contract / reimbursable cost rules<textarea rows={2} value={contract.note} onChange={e=>patchContract({note:e.target.value})} /></label>
      <div className="ops-metrics"><div><small>Projected direct + reserve</small><strong>{money(forecast.projectedReimbursableCosts)}</strong></div><div><small>{contract.mode === 'cost_plus' ? 'Projected contractor fee' : 'Modeled fixed-price profit'}</small><strong>{money(contract.mode === 'cost_plus' ? forecast.projectedFee : forecast.projectedProfit)}</strong></div><div><small>Projected customer total*</small><strong>{money(forecast.total)}</strong></div><div><small>Projected profit after listed costs / OH*</small><strong>{money(forecast.projectedProfit)}</strong></div></div>
      <p className="field-help">*Forecast only. Cost-plus projection uses estimated direct cost + contingency reserve and a configurable fee; actual invoices determine final reimbursable spending under the signed agreement. Tax entry is manual and requires review. The fixed-price view retains the existing margin-based calculation.</p>
    </div>

    <div className="panel">
      <div className="panel-head"><div><span className="eyebrow dark">CUSTOM MATERIAL SELECTIONS</span><h2>Homeowner choices & supplier quotes</h2></div><button type="button" className="small-primary" onClick={addSelection}>+ Add selection</button></div>
      <p className="field-help">Capture EXACT specifications (Pella model, size, finish, glazing; cherry grade/profile; custom fascia dimensions). Compare only verified like-for-like bids. Prices are private vendor quotes entered by you, not online retail guesses. Delivery and lead days are estimated, not orders.</p>
      {selections.length===0 && <p className="subtle">No product selections yet. Add a window, lumber, cabinetry, wood species, fixture or special-order item.</p>}
      {selections.map(s => { const comparison = compareSupplierQuotes(s,quotes);return <div className="selection-card" key={s.id}>
        <div className="selection-heading"><strong>{s.name || 'New custom selection'}</strong><span>{s.approvedByCustomer ? 'Customer selection approved' : 'Customer decision pending'}</span><button type="button" onClick={()=>setExpanded(expanded===s.id?'':s.id)}>{expanded===s.id?'Collapse':'Edit / compare'}</button></div>
        {expanded===s.id && <>
          <div className="operations-grid">
            <label>Item name<input value={s.name} onChange={e=>updateSelection(s.id,{name:e.target.value})} placeholder="Pella corner-window assembly"/></label>
            <label>Category<input value={s.category} onChange={e=>updateSelection(s.id,{category:e.target.value})}/></label>
            <label>Manufacturer / brand<input value={s.manufacturer} onChange={e=>updateSelection(s.id,{manufacturer:e.target.value})} placeholder="Pella"/></label>
            <label>Model / SKU<input value={s.model} onChange={e=>updateSelection(s.id,{model:e.target.value})}/></label>
            {fieldNum('Quantity',s.quantity,n=>updateSelection(s.id,{quantity:n}),'0.25')}
            <label>Unit<input value={s.unit} onChange={e=>updateSelection(s.id,{unit:e.target.value})}/></label>
            {fieldNum('Current customer allowance / budget ($)',s.allowanceCost,n=>updateSelection(s.id,{allowanceCost:n}),'0.01')}
          </div>
          <label className="field-label">Exact specifications, dimensions, finish, performance requirements<textarea rows={3} value={s.spec} onChange={e=>updateSelection(s.id,{spec:e.target.value})} placeholder="Include manufacturer series, drawing/revision, grade, exact sizes, finish, glazing, color and structural/engineering requirements."/></label>
          <label className="addon-check"><input type="checkbox" checked={s.approvedByCustomer} onChange={e=>updateSelection(s.id,{approvedByCustomer:e.target.checked})}/> Homeowner approved this precise selection (manual record only)</label>
          <div className="ops-actions"><button type="button" className="secondary-button" onClick={()=>copyRfq(s)}>Copy exact-spec supplier RFQ</button><button type="button" className="secondary-button" onClick={()=>addQuote(s.id)}>+ Record supplier quote</button></div>
          {quotes.filter(q=>q.selectionId===s.id).map(q=><div className="supplier-quote" key={q.id}>
            <div className="operations-grid">
              <label>Supplier / distributor<input value={q.supplier} onChange={e=>updateQuote(q.id,{supplier:e.target.value})} placeholder="Existing approved relationship"/></label>
              <label>Vendor quote / reference<input value={q.supplierRef} onChange={e=>updateQuote(q.id,{supplierRef:e.target.value})}/></label>
              <label>Quote status<select value={q.status} onChange={e=>updateQuote(q.id,{status:e.target.value as SupplierQuote['status']})}><option value="requested">Requested / not priced</option><option value="quoted">Received — not confirmed</option><option value="confirmed">Supplier confirmed</option></select></label>
              <label>Exact same specification?<select value={String(q.exactSpec)} onChange={e=>updateQuote(q.id,{exactSpec:e.target.value==='true'})}><option value="false">No / unverified alternative</option><option value="true">Yes — exact match verified</option></select></label>
              {fieldNum('Quoted quantity',q.quantity,n=>updateQuote(q.id,{quantity:n}),'0.25')}
              {fieldNum('Unit price ($)',q.unitCost,n=>updateQuote(q.id,{unitCost:n}),'0.01')}
              {fieldNum('Freight / delivery ($)',q.shipping,n=>updateQuote(q.id,{shipping:n}),'0.01')}
              {fieldNum('Tax / other fees ($)',q.taxAndFees,n=>updateQuote(q.id,{taxAndFees:n}),'0.01')}
              {fieldNum('Supplier lead days',q.leadDays,n=>updateQuote(q.id,{leadDays:n}),'1')}
              <label>Quote valid through<input type="date" value={q.validUntil} onChange={e=>updateQuote(q.id,{validUntil:e.target.value})}/></label>
            </div>
            <label className="field-label">Availability, account discount, delivery terms, warranty and return restrictions<input value={q.notes} onChange={e=>updateQuote(q.id,{notes:e.target.value})}/></label>
            <div className="ops-actions"><strong>Landed quote: {money(landedQuoteCost(q))}</strong><button type="button" className="secondary-button" disabled={!comparison.ranked.some(x=>x.id===q.id)} onClick={()=>choose(s,q)}>{s.chosenQuoteId===q.id?'Chosen vendor':'Choose vendor'}</button><button type="button" onClick={()=>onChange({...job,supplierQuotes:quotes.filter(x=>x.id!==q.id)})}>Remove quote</button></div>
          </div>)}
          <p className="field-help">Eligible confirmed matching bids: {comparison.ranked.length}. {comparison.cheapest? `Lowest verified landed quote: ${comparison.cheapest.supplier} at ${money(landedQuoteCost(comparison.cheapest))}, ${comparison.cheapest.leadDays} calendar lead days.`:'No exact, current, supplier-confirmed bids yet.'} {comparison.savings>0?`Potential savings vs selected vendor: ${money(comparison.savings)}.`:''}</p>
          {s.chosenQuoteId && <div className="ops-actions"><button type="button" className="small-primary" onClick={()=>syncSelected(s)}>Add approved, chosen material to estimate</button><span className="subtle">No purchase order is created or transmitted</span></div>}
          <button type="button" className="delete-mini" onClick={()=>onChange({...job,selections:selections.filter(x=>x.id!==s.id),supplierQuotes:quotes.filter(q=>q.selectionId!==s.id)})}>Delete selection and related quotes</button>
        </>}
      </div>;})}
    </div>

    <div className="panel">
      <div className="panel-head"><div><span className="eyebrow dark">PRODUCTION / CREW PLAN</span><h2>Labor, duration & delivery dependencies</h2></div><button type="button" className="small-primary" onClick={()=>onChange({...job,workPhases:[...phases,{id:uid(),name:'New work phase',personHours:8,crewSize:1,hoursPerDay:8,loadedCostPerHour:35,blockingSelectionId:'',extraDays:0}]})}>+ Add phase</button></div>
      <p className="field-help">Sequential first-pass scenario: duration = person-hours / (crew size × productive hours/day), rounded up to days. Add weather, inspection, cure, or buffer days separately. This is NOT a critical-path or resource-leveled schedule. Lead-time estimates assume procurement starts at day zero; purchase orders are not placed here.</p>
      {phases.map(p=>{const result=schedule.entries.find(x=>x.id===p.id);return <div className="phase-card" key={p.id}>
        <div className="operations-grid">
          <label>Phase<input value={p.name} onChange={e=>updatePhase(p.id,{name:e.target.value})}/></label>
          {fieldNum('Estimated person-hours',p.personHours,n=>updatePhase(p.id,{personHours:n}),'0.5')}
          {fieldNum('Crew members',p.crewSize,n=>updatePhase(p.id,{crewSize:n}),'1')}
          {fieldNum('Productive hrs / crew member / day',p.hoursPerDay,n=>updatePhase(p.id,{hoursPerDay:n}),'0.5')}
          {fieldNum('Loaded cost / person-hour ($)',p.loadedCostPerHour,n=>updatePhase(p.id,{loadedCostPerHour:n}),'0.01')}
          {fieldNum('Inspections / cure / weather buffer (days)',p.extraDays,n=>updatePhase(p.id,{extraDays:n}),'1')}
          <label>Waiting on material selection<select value={p.blockingSelectionId} onChange={e=>updatePhase(p.id,{blockingSelectionId:e.target.value})}><option value="">None</option>{selections.map(s=><option key={s.id} value={s.id}>{s.name || 'Unnamed selection'}</option>)}</select></label>
        </div>
        <div className="ops-actions"><strong>{result?.productionDays ?? 0} production days + {result?.waitDays ?? 0} wait days + {result?.extraDays ?? 0} buffer</strong><button type="button" className="delete-mini" onClick={()=>onChange({...job,workPhases:phases.filter(x=>x.id!==p.id)})}>Remove phase</button></div>
      </div>;})}
      <div className="ops-metrics"><div><small>Sequential elapsed days*</small><strong>{schedule.totalWorkDays}</strong></div><div><small>Planned person-hours</small><strong>{schedule.totalPersonHours}</strong></div><div><small>Planned loaded labor cost</small><strong>{money(schedule.plannedLaborCost)}</strong></div><div><small>Labor modeled in estimate</small><strong>{money(calculate(job).costByCategory.labor)}</strong></div></div>
      {schedule.scheduleRisk.length>0 && <div className="caution"><span>{schedule.scheduleRisk.join(' • ')}</span></div>}
      <button type="button" className="secondary-button" onClick={syncLabor}>Replace estimate labor items with this crew plan</button>
      <p className="field-help">Labor planning and estimating start as separate scenarios; this button reconciles them explicitly to avoid hidden double-counting. Real schedules require calendar dates, supplier promises, crews shared across jobs, and task dependencies.</p>
    </div>

    <div className="panel">
      <div className="panel-head"><div><span className="eyebrow dark">ESTIMATE VS ACTUALS</span><h2>Project cost control</h2></div><button type="button" className="small-primary" onClick={()=>onChange({...job,actualExpenses:[...actuals,{id:uid(),date:new Date().toISOString().slice(0,10),category:'Materials',description:'',amount:0,reference:''}]})}>+ Record actual cost</button></div>
      <p className="field-help">Record supplier invoice totals, timesheet labor costs, subcontractor invoices, or equipment/travel receipts after confirming their billable treatment. These actuals DO NOT automatically add to the estimate again. This is a first-pass reconciliation ledger, not accounting or invoicing.</p>
      {actuals.map(exp=><div className="actual-row" key={exp.id}>
        <div className="operations-grid">
          <label>Date<input type="date" value={exp.date} onChange={e=>updateExpense(exp.id,{date:e.target.value})}/></label>
          <label>Cost type<select value={exp.category} onChange={e=>updateExpense(exp.id,{category:e.target.value})}>{['Materials','Field labor','Subcontractor','Equipment / truck','Travel / delivery','Other'].map(x=><option key={x}>{x}</option>)}</select></label>
          <label>Description<input value={exp.description} onChange={e=>updateExpense(exp.id,{description:e.target.value})}/></label>
          {fieldNum('Actual cost ($)',exp.amount,n=>updateExpense(exp.id,{amount:n}),'0.01')}
          <label>Receipt / bill number<input value={exp.reference} onChange={e=>updateExpense(exp.id,{reference:e.target.value})}/></label>
        </div>
        <button type="button" className="delete-mini" onClick={()=>onChange({...job,actualExpenses:actuals.filter(x=>x.id!==exp.id)})}>Remove</button>
      </div>)}
      <div className="ops-metrics"><div><small>Recorded actual direct costs</small><strong>{money(forecast.actualDirectCosts)}</strong></div><div><small>Original estimated direct cost</small><strong>{money(calculate(job).direct)}</strong></div><div><small>Actual minus estimated*</small><strong>{money(forecast.budgetVariance)}</strong></div><div><small>Illustrative cost-plus billing to date**</small><strong>{money(forecast.billableActualsIllustration)}</strong></div></div>
      <p className="field-help">*Partial actuals are NOT a projected final variance. **Illustration only: actual cost + percentage fee (or configured fixed fee), not an invoice. Contract billing rules, tax, timing, retention and previously billed amounts require separate implementation.</p>
    </div>
    {message && <div className="notice"><strong>{message}</strong><button type="button" onClick={()=>setMessage('')}>Dismiss</button></div>}
  </div>;
}
