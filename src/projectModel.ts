import type { Job, Selection, SupplierQuote, WorkPhase } from './types';
import type { calculate } from './estimate';

type BaseTotals = ReturnType<typeof calculate>;
const nonneg = (value: number) => Math.max(0, Number(value) || 0);
const currency = (n: number) => Math.round(n * 100) / 100;

export function landedQuoteCost(quote: SupplierQuote): number {
  return currency(nonneg(quote.unitCost) * nonneg(quote.quantity) + nonneg(quote.shipping) + nonneg(quote.taxAndFees));
}
export function quoteIsComparable(selection: Selection, quote: SupplierQuote, today = new Date().toISOString().slice(0, 10)): boolean {
  return quote.selectionId === selection.id && quote.exactSpec && quote.status === 'confirmed'
    && quote.supplier.trim().length > 0 && quote.quantity >= selection.quantity && selection.quantity > 0
    && quote.unitCost > 0 && (quote.validUntil === '' || quote.validUntil >= today);
}
export function compareSupplierQuotes(selection: Selection, quotes: SupplierQuote[], today?: string) {
  const forSelection = quotes.filter(q => q.selectionId === selection.id);
  const ranked = forSelection.filter(q => quoteIsComparable(selection, q, today))
    .sort((a, b) => landedQuoteCost(a) - landedQuoteCost(b));
  const chosen = forSelection.find(q => q.id === selection.chosenQuoteId);
  const cheapest = ranked[0];
  return { ranked, chosen, cheapest, savings: chosen && cheapest && quoteIsComparable(selection, chosen, today)
    ? Math.max(0, landedQuoteCost(chosen) - landedQuoteCost(cheapest)) : 0 };
}
export function scheduleForecast(job: Job) {
  const selections = job.selections ?? [];
  const quotes = job.supplierQuotes ?? [];
  let cursor = 0, laborHours = 0, laborCost = 0; const scheduleRisk: string[] = [];
  const entries = (job.workPhases ?? []).map((phase: WorkPhase) => {
    const crew = Math.max(1, Math.floor(nonneg(phase.crewSize)));
    const workdayHours = Math.max(1, nonneg(phase.hoursPerDay));
    const personHours = nonneg(phase.personHours);
    const productionDays = Math.ceil(personHours / (crew * workdayHours));
    const extraDays = Math.ceil(nonneg(phase.extraDays));
    const selection = selections.find(s => s.id === phase.blockingSelectionId);
    const quote = selection ? quotes.find(q => q.id === selection.chosenQuoteId) : undefined;
    if (selection && (!selection.approvedByCustomer || !quote || !quoteIsComparable(selection, quote))) {
      scheduleRisk.push(`${phase.name}: material selection / comparable supplier quote / homeowner approval is incomplete`);
    }
    const materialReadyDay = quote ? Math.ceil(nonneg(quote.leadDays)) : 0;
    const startDay = Math.max(cursor, materialReadyDay);
    const waitDays = Math.max(0, startDay - cursor);
    const finishDay = startDay + productionDays + extraDays;
    cursor = finishDay;
    laborHours += personHours;
    laborCost += personHours * nonneg(phase.loadedCostPerHour);
    return { id: phase.id, name: phase.name, crew, personHours, productionDays, extraDays, waitDays, startDay, finishDay, materialReadyDay };
  });
  return { entries, totalWorkDays: cursor, totalPersonHours: laborHours, plannedLaborCost: currency(laborCost), scheduleRisk };
}
export function projectCommercial(job: Job, base: BaseTotals) {
  const contract = job.contract;
  const mode = contract?.mode ?? 'fixed';
  const projectedReserve = base.contingencyCost;
  const projectedReimbursableCosts = base.direct + projectedReserve;
  const fee = contract?.feeBasis === 'fixed'
    ? nonneg(contract.fixedFee)
    : projectedReimbursableCosts * nonneg(contract?.feePercent ?? 0) / 100;
  const projectedBeforeTax = mode === 'cost_plus' ? projectedReimbursableCosts + fee - nonneg(job.discount) : base.afterDiscount;
  const beforeTax = Math.max(0, projectedBeforeTax);
  const tax = beforeTax * nonneg(job.taxRate) / 100;
  const total = beforeTax + tax;
  const projectedProfit = beforeTax - (base.direct + projectedReserve + base.overhead);
  const projectedMargin = beforeTax > 0 ? projectedProfit / beforeTax * 100 : 0;
  const actualDirectCosts = (job.actualExpenses ?? []).reduce((s, x) => s + nonneg(x.amount), 0);
  const actualFeeToDate = contract?.feeBasis === 'fixed' ? nonneg(contract.fixedFee) : actualDirectCosts * nonneg(contract?.feePercent ?? 0) / 100;
  const billableActualsIllustration = actualDirectCosts + actualFeeToDate;
  return {
    mode, projectedReimbursableCosts: currency(projectedReimbursableCosts),
    projectedReserve: currency(projectedReserve), projectedFee: currency(fee),
    beforeTax: currency(beforeTax), tax: currency(tax), total: currency(total),
    projectedProfit: currency(projectedProfit), projectedMargin,
    actualDirectCosts: currency(actualDirectCosts), billableActualsIllustration: currency(billableActualsIllustration),
    budgetRemaining: currency(base.direct - actualDirectCosts),
    budgetVariance: currency(actualDirectCosts - base.direct)
  };
}
export function rfqDraft(selection: Selection, customer: string, address: string): string {
  return `REQUEST FOR QUOTE — Prescott's Best Construction\nProject: ${customer || 'Customer project'}\nJob location: ${address || 'Prescott / Prescott Valley, AZ'}\n\nRequested product: ${selection.name}\nExact specification: ${selection.spec || '[complete specification required]'}\nManufacturer: ${selection.manufacturer || '[to be confirmed]'}\nModel / SKU: ${selection.model || '[to be confirmed]'}\nQuantity: ${selection.quantity} ${selection.unit}\n\nPlease confirm: exact manufacturer/spec compliance; availability; contractor/account pricing or discount; unit cost; sales tax; freight to job site; total landed price; estimated production and delivery lead time; current stock; quote expiry; warranty; damage/return terms; payment terms. If proposing alternatives, clearly label them as NOT exact matches. No order is authorized by this request.\n\nThank you,\nPrescott's Best Construction\nAZ ROC #343141`;
}
