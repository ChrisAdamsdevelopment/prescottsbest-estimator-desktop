import type { AddOn, Job } from './types';
import { uid } from './types';

export type AddOnTemplate = Omit<AddOn, 'id' | 'included'> & { templateId: string; forModes: Array<'concierge' | 'remodel'> };
export const ADD_ON_CATALOG: AddOnTemplate[] = [
  { templateId: 'cords', forModes: ['concierge'], description: 'Surface TV cable-management channel (no electrical relocation)', category: 'material', qty: 1, unit: 'kit', unitCost: 24 },
  { templateId: 'soundbar', forModes: ['concierge'], description: 'Mount customer-supplied soundbar on approved backing', category: 'labor', qty: 0.75, unit: 'hr', unitCost: 35 },
  { templateId: 'packaging', forModes: ['concierge'], description: 'Furniture packaging cleanup and disposal', category: 'other', qty: 1, unit: 'visit', unitCost: 28 },
  { templateId: 'patchpaint', forModes: ['concierge'], description: 'Spot prime and paint repaired drywall (match not guaranteed)', category: 'labor', qty: 2, unit: 'hr', unitCost: 35 },
  { templateId: 'second-trip', forModes: ['concierge', 'remodel'], description: 'Additional site visit / mobilization cost', category: 'other', qty: 1, unit: 'visit', unitCost: 65 },
  { templateId: 'hardware', forModes: ['concierge'], description: 'Additional customer-supplied hardware installation', category: 'labor', qty: 1, unit: 'hr', unitCost: 35 },
  { templateId: 'demodisposal', forModes: ['remodel'], description: 'Additional demolition/debris disposal allowance', category: 'other', qty: 1, unit: 'lot', unitCost: 250 },
  { templateId: 'upgradedtile', forModes: ['remodel'], description: 'Upgraded tile material allowance — confirm selection', category: 'material', qty: 1, unit: 'lot', unitCost: 550 },
  { templateId: 'subfloor', forModes: ['remodel'], description: 'Additional subfloor preparation allowance', category: 'labor', qty: 4, unit: 'hr', unitCost: 35 }
];
export function createAddOn(templateId: string): AddOn | undefined {
  const found = ADD_ON_CATALOG.find(item => item.templateId === templateId);
  if (!found) return undefined;
  return { id: uid(), description: found.description, category: found.category, qty: found.qty, unit: found.unit, unitCost: found.unitCost, included: false };
}
export function addOnCost(addon: AddOn): number {
  return Math.max(0, Number(addon.qty) || 0) * Math.max(0, Number(addon.unitCost) || 0);
}
export function optionPrice(job: Job, addon: AddOn): number {
  const margin = Math.max(0, Math.min(95, job.margin)) / 100;
  return addOnCost(addon) * (1 + Math.max(0, job.contingency) / 100) / (1 - margin);
}
