import type { Category, Job, LineItem, Mode } from './types';
import { uid } from './types';
import { addOnCost } from './pricebook';
export type Preset = { id: string; mode: Mode; title: string; scope: string; items: Omit<LineItem, 'id'>[] };
const labor = (description: string, hours: number, cost = 35): Omit<LineItem, 'id'> => ({ description, category: 'labor', qty: hours, unit: 'hr', unitCost: cost });
const material = (description: string, cost: number): Omit<LineItem, 'id'> => ({ description, category: 'material', qty: 1, unit: 'lot', unitCost: cost });
export const PRESETS: Preset[] = [
  { id: 'tv', mode: 'concierge', title: 'TV mounting', scope: 'Mount one customer-supplied TV and bracket on a suitable wall; verify backing, wall type, and cable routing.', items: [labor('Mounting labor', 1.5), material('Fasteners / consumables allowance', 20)] },
  { id: 'furniture', mode: 'concierge', title: 'Furniture assembly', scope: 'Assemble one customer-supplied flat-pack furniture item; confirm item model and complexity.', items: [labor('Assembly labor', 2), material('Consumables allowance', 10)] },
  { id: 'drywall', mode: 'concierge', title: 'Drywall patch', scope: 'Patch one small accessible drywall hole; texture and painting scope require confirmation.', items: [labor('Patch / prep labor', 3), material('Patch and compound allowance', 25)] },
  { id: 'shelves', mode: 'concierge', title: 'Shelves / hardware', scope: 'Install customer-supplied shelving or wall hardware; confirm substrate and load.', items: [labor('Installation labor', 2), material('Anchors and fasteners', 20)] },
  { id: 'door', mode: 'concierge', title: 'Door adjustment', scope: 'Adjust one existing interior door; replacement components billed separately.', items: [labor('Door service labor', 1.5), material('Hardware allowance', 12)] },
  { id: 'painting', mode: 'concierge', title: 'Small painting job', scope: 'Prepare and paint a defined small interior area; confirm dimensions and coats.', items: [labor('Painting labor', 8), material('Paint and masking allowance', 120)] },
  { id: 'flooring', mode: 'remodel', title: 'Flooring installation', scope: 'Remove / prepare substrate and install selected flooring after measured takeoff.', items: [labor('Installation labor - placeholder', 24), material('Flooring material - placeholder', 900), material('Underlayment / trim - placeholder', 200)] },
  { id: 'bathroom', mode: 'remodel', title: 'Bathroom renovation', scope: 'Define demo, plumbing, waterproofing, tile, fixtures, finish and inspection scope before quoting.', items: [labor('Remodel labor - placeholder', 80), material('Finish materials - placeholder', 3500), { description: 'Specialty subcontract allowance - placeholder', category: 'subcontract', qty: 1, unit: 'lot', unitCost: 2500 }] },
  { id: 'kitchen', mode: 'remodel', title: 'Kitchen renovation', scope: 'Define cabinets, countertop, electrical, plumbing, demolition and finish work before quoting.', items: [labor('Remodel labor - placeholder', 120), material('Materials - placeholder', 6500), { description: 'Specialty subcontract allowance - placeholder', category: 'subcontract', qty: 1, unit: 'lot', unitCost: 3500 }] },
  { id: 'general', mode: 'remodel', title: 'General renovation', scope: 'Site-specific renovation; measured takeoff, exclusions, and permit/scope review required.', items: [labor('Labor - placeholder', 16), material('Materials - placeholder', 250)] }
];
export function addPreset(job: Job, presetId: string): Job {
  const preset = PRESETS.find(p => p.id === presetId);
  if (!preset) return job;
  return { ...job, preset: preset.id, title: preset.title, scope: preset.scope, items: preset.items.map(item => ({ ...item, id: uid() })) };
}
export function calculate(job: Job) {
  const includedOptions = (job.addOns ?? []).filter(option => option.included);
  const allIncludedItems = [...job.items, ...includedOptions];
  const costByCategory = Object.fromEntries((['labor', 'material', 'subcontract', 'other'] as Category[]).map(c => [c, allIncludedItems.filter(i => i.category === c).reduce((sum, i) => sum + Math.max(0, Number(i.qty) || 0) * Math.max(0, Number(i.unitCost) || 0), 0)])) as Record<Category, number>;
  const baseDirect = job.items.reduce((sum, i) => sum + Math.max(0, Number(i.qty) || 0) * Math.max(0, Number(i.unitCost) || 0), 0);
  const optionDirect = includedOptions.reduce((sum, option) => sum + addOnCost(option), 0);
  const direct = baseDirect + optionDirect;
  const contingencyRatio = Math.max(0, job.contingency) / 100;
  const contingencyCost = direct * contingencyRatio;
  const overhead = Math.max(0, job.overheadAllowance);
  const totalModeledCost = direct + contingencyCost + overhead;
  const targetMargin = Math.min(95, Math.max(0, job.margin)) / 100;
  const basePrice = Math.max(Math.max(0, job.minimumCharge), (baseDirect * (1 + contingencyRatio) + overhead) / (1 - targetMargin));
  const selectedOptionsPrice = optionDirect * (1 + contingencyRatio) / (1 - targetMargin);
  const subtotal = basePrice + selectedOptionsPrice;
  const afterDiscount = Math.max(0, subtotal - Math.max(0, job.discount));
  const tax = afterDiscount * Math.max(0, job.taxRate) / 100;
  const total = afterDiscount + tax;
  const projectedProfit = afterDiscount - totalModeledCost;
  const projectedMargin = afterDiscount > 0 ? (projectedProfit / afterDiscount) * 100 : 0;
  return { costByCategory, direct, contingencyCost, overhead, totalModeledCost, basePrice, selectedOptionsPrice, subtotal, afterDiscount, tax, total, projectedProfit, projectedMargin };
}
export const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(value) ? value : 0);