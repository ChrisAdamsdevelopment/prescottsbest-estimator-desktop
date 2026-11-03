export type Mode = 'concierge' | 'remodel';
export type Category = 'labor' | 'material' | 'subcontract' | 'other';
export interface LineItem {
  id: string;
  description: string;
  category: Category;
  qty: number;
  unit: string;
  unitCost: number;
}
export interface AddOn extends LineItem { included: boolean; }
export type PricingMode = 'cost_plus' | 'fixed';
export interface ContractPolicy { mode: PricingMode; feeBasis: 'percent' | 'fixed'; feePercent: number; fixedFee: number; note: string; }
export interface SupplierQuote { id: string; selectionId: string; supplier: string; supplierRef: string; status: 'requested' | 'quoted' | 'confirmed'; exactSpec: boolean; unitCost: number; quantity: number; shipping: number; taxAndFees: number; leadDays: number; validUntil: string; notes: string; }
export interface Selection { id: string; name: string; category: string; spec: string; manufacturer: string; model: string; quantity: number; unit: string; allowanceCost: number; chosenQuoteId: string; approvedByCustomer: boolean; }
export interface WorkPhase { id: string; name: string; personHours: number; crewSize: number; hoursPerDay: number; loadedCostPerHour: number; blockingSelectionId: string; extraDays: number; }
export interface ActualExpense { id: string; date: string; category: string; description: string; amount: number; reference: string; }
export interface Job {
  id: string;
  createdAt: string;
  updatedAt: string;
  customer: string;
  phone: string;
  address: string;
  title: string;
  notes: string;
  mode: Mode;
  preset: string;
  scope: string;
  exclusions: string;
  items: LineItem[];
  addOns?: AddOn[];
  contract?: ContractPolicy;
  selections?: Selection[];
  supplierQuotes?: SupplierQuote[];
  workPhases?: WorkPhase[];
  actualExpenses?: ActualExpense[];
  photos: string[];
  margin: number;
  contingency: number;
  overheadAllowance: number;
  minimumCharge: number;
  discount: number;
  taxRate: number;
  validDays: number;
  status: 'draft' | 'sent' | 'accepted';
}
export const uid = () => crypto.randomUUID();
export function blankJob(mode: Mode = 'concierge'): Job {
  const now = new Date().toISOString();
  return {
    id: uid(), createdAt: now, updatedAt: now, customer: '', phone: '', address: '',
    title: '', notes: '', mode, preset: '', scope: '', exclusions: 'Hidden damage, concealed conditions, permit fees, and work not explicitly listed are excluded.',
    items: [], addOns: [], photos: [],
    contract: { mode: mode === 'remodel' ? 'cost_plus' : 'fixed', feeBasis: 'percent', feePercent: 20, fixedFee: 0, note: 'Cost-plus estimate is a planning forecast. Final reimbursable costs and contractor fee depend on the signed contract.' },
    selections: [], supplierQuotes: [],
    workPhases: mode === 'remodel' ? [
      { id: uid(), name: 'Demolition / preparation', personHours: 32, crewSize: 2, hoursPerDay: 8, loadedCostPerHour: 35, blockingSelectionId: '', extraDays: 0 },
      { id: uid(), name: 'Rough work / inspections', personHours: 48, crewSize: 2, hoursPerDay: 8, loadedCostPerHour: 35, blockingSelectionId: '', extraDays: 0 },
      { id: uid(), name: 'Installation / finish work', personHours: 64, crewSize: 2, hoursPerDay: 8, loadedCostPerHour: 35, blockingSelectionId: '', extraDays: 0 }
    ] : [{ id: uid(), name: 'Field installation', personHours: 2, crewSize: 1, hoursPerDay: 8, loadedCostPerHour: 35, blockingSelectionId: '', extraDays: 0 }],
    actualExpenses: [], margin: 40, contingency: 10, overheadAllowance: 0,
    minimumCharge: mode === 'concierge' ? 150 : 0, discount: 0, taxRate: 0, validDays: 14, status: 'draft'
  };
}