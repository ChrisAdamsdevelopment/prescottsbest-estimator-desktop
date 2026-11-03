import type { AddOn, Job } from './types';
import { ADD_ON_CATALOG, addOnCost, createAddOn, optionPrice } from './pricebook';
import { money } from './estimate';

export function AddOnPanel({job, onChange}: {job: Job; onChange: (next: Job) => void}) {
  const addons = job.addOns ?? [];
  const add = (key: string) => {
    const entry = createAddOn(key);
    if (entry) onChange({ ...job, addOns: [...addons, entry] });
  };
  const change = (id: string, patch: Partial<AddOn>) => onChange({
    ...job, addOns: addons.map(item => item.id === id ? { ...item, ...patch } : item)
  });
  return (
    <section className="upsell-panel">
      <div className="panel-head compact"><div><span className="eyebrow dark">OPTIONAL / GOOD-BETTER-BEST</span><h2>Add-on services</h2></div></div>
      <p className="field-help" style={{marginTop: 0}}>Inspired by professional quote builders: offer upgrades without retyping the whole estimate. Costs, hours and resulting prices are <strong>illustrative</strong> until approved by Andrew.</p>
      <label className="field-label">Add a service option
        <select value="" onChange={e => { if (e.target.value) add(e.target.value); }}>
          <option value="">Choose an optional service...</option>
          {ADD_ON_CATALOG.filter(item => item.forModes.includes(job.mode)).map(item => <option key={item.templateId} value={item.templateId}>{item.description}</option>)}
        </select>
      </label>
      {!addons.length && <p className="subtle">No add-on options yet. Select one above to offer a customer an upgrade.</p>}
      <div className="addon-list">{addons.map(addon => <div className="addon-option" key={addon.id}>
        <div className="addon-option-head">
          <label className="addon-check"><input type="checkbox" checked={addon.included} onChange={e => change(addon.id, {included: e.target.checked})}/><strong>{addon.included ? 'Included in current quote' : 'Optional — not included'}</strong></label>
          <button type="button" className="delete-mini" aria-label="Remove add-on" onClick={() => onChange({...job, addOns: addons.filter(x => x.id !== addon.id)})}>Remove</button>
        </div>
        <input className="item-description" value={addon.description} onChange={e => change(addon.id, {description: e.target.value})} aria-label="Optional service description"/>
        <div className="item-grid"><label>Qty<input type="number" min="0" step="0.25" value={addon.qty} onChange={e => change(addon.id,{qty: Number(e.target.value) || 0})}/></label>
          <label>Unit<input value={addon.unit} onChange={e => change(addon.id,{unit:e.target.value})}/></label>
          <label>Internal cost / unit<input type="number" min="0" step="0.01" value={addon.unitCost} onChange={e => change(addon.id,{unitCost:Number(e.target.value)||0})}/></label>
          <div className="addon-price"><small>Option selling price</small><strong>{money(optionPrice(job, addon))}</strong></div>
        </div>
        <p className="field-help" style={{margin:'8px 0 0'}}>Internal estimated cost: {money(addOnCost(addon))}. Selling price follows current margin and contingency settings.</p>
      </div>)}</div>
    </section>
  );
}
