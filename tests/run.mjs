import assert from 'node:assert/strict';
import { build } from 'esbuild';
await build({ entryPoints: ['src/estimate.ts'], outfile: 'tests/.estimate.bundle.mjs', bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
const { calculate, addPreset, PRESETS } = await import('./.estimate.bundle.mjs');
const sample = {
  mode: 'concierge', items: [{ id: 'a', description: 'labor', category: 'labor', qty: 2, unit: 'hr', unitCost: 50 }],
  margin: 50, contingency: 10, overheadAllowance: 20, minimumCharge: 0, discount: 0, taxRate: 0
};
const first = calculate(sample);
assert.equal(first.direct, 100);
assert.equal(first.contingencyCost, 10);
assert.equal(first.totalModeledCost, 130);
assert.equal(first.afterDiscount, 260);
assert.equal(first.projectedProfit, 130);
assert.equal(first.projectedMargin, 50);
const min = calculate({ ...sample, minimumCharge: 300, discount: 10, taxRate: 5 });
assert.equal(min.afterDiscount, 290);
assert.equal(min.tax, 14.5);
assert.equal(min.total, 304.5);
const zero = calculate({ ...sample, items: [], minimumCharge: 0, overheadAllowance: 0, margin: 99 });
assert.equal(zero.total, 0);
const preset = addPreset({ ...sample, title: '', scope: '', preset: '' }, 'tv');
assert.equal(preset.title, 'TV mounting');
assert.equal(preset.items.length, 2);
assert.equal(PRESETS.length, 10);
const candidate = { id: 'option1', description: 'Cable channel', category: 'material', qty: 1, unit: 'kit', unitCost: 20, included: false };
assert.equal(calculate({ ...sample, addOns: [candidate] }).total, 260, 'unselected options must not change customer total');
const selected = calculate({ ...sample, addOns: [{ ...candidate, included: true }] });
assert.equal(selected.basePrice, 260, 'selected options must not change base price');
assert.equal(selected.selectedOptionsPrice, 44, '20 cost / 50% margin and 10% contingency = 44');
assert.equal(selected.total, 304, 'selected optional upgrade increases quote exactly by option price');
assert.equal(selected.projectedMargin, 50);
console.log('PASS: Optional add-ons excluded by default and correctly included in quote, profit and margin.');
console.log('PASS: 10 service presets, pricing math, margin, contingency, minimum, discount, tax, zero-cost guard.');
