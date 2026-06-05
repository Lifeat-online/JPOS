export type BillSplitMode = 'person' | 'seat' | 'table';

export interface BillSplitItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface BillSplitLine {
  itemId: string;
  name: string;
  quantity: number;
  total: number;
}

export interface BillSplitShare {
  id: string;
  label: string;
  total: number;
  lines: BillSplitLine[];
}

export type BillSplitAssignments = Record<string, string>;

function roundCurrency(value: number) {
  return Number((Math.round(Number(value || 0) * 100) / 100).toFixed(2));
}

function shareId(label: string, index: number) {
  const clean = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return clean || `share_${index + 1}`;
}

export function normalizeBillSplitItems(items: any[] = []): BillSplitItem[] {
  return items
    .map((item, index) => ({
      id: String(item?.cartItemId || item?.id || item?.productId || `item_${index}`),
      name: String(item?.name || `Item ${index + 1}`),
      price: roundCurrency(item?.price || 0),
      quantity: Math.max(0, Number(item?.quantity || 0)),
    }))
    .filter(item => item.quantity > 0 && item.price >= 0);
}

export function equalBillShares(total: number, count: number, labelPrefix = 'Person'): BillSplitShare[] {
  const safeCount = Math.max(1, Math.min(20, Math.floor(Number(count || 1))));
  const cents = Math.max(0, Math.round(Number(total || 0) * 100));
  const base = Math.floor(cents / safeCount);
  const remainder = cents % safeCount;

  return Array.from({ length: safeCount }, (_, index) => {
    const shareCents = base + (index < remainder ? 1 : 0);
    return {
      id: `${labelPrefix.toLowerCase()}_${index + 1}`,
      label: `${labelPrefix} ${index + 1}`,
      total: roundCurrency(shareCents / 100),
      lines: [],
    };
  });
}

export function labeledBillShares(
  items: BillSplitItem[],
  labels: string[],
  assignments: BillSplitAssignments
) {
  const cleanLabels = labels.map(label => label.trim()).filter(Boolean).slice(0, 12);
  const shares = cleanLabels.map((label, index) => ({
    id: shareId(label, index),
    label,
    total: 0,
    lines: [] as BillSplitLine[],
  }));
  const shareById = new Map(shares.map(share => [share.id, share]));

  let unassignedTotal = 0;
  for (const item of items) {
    const lineTotal = roundCurrency(item.price * item.quantity);
    const target = shareById.get(assignments[item.id] || '');
    if (!target) {
      unassignedTotal = roundCurrency(unassignedTotal + lineTotal);
      continue;
    }

    target.total = roundCurrency(target.total + lineTotal);
    target.lines.push({
      itemId: item.id,
      name: item.name,
      quantity: item.quantity,
      total: lineTotal,
    });
  }

  return {
    shares,
    unassignedTotal,
  };
}

export function billSplitModeLabel(mode: BillSplitMode) {
  if (mode === 'seat') return 'Seat';
  if (mode === 'table') return 'Table';
  return 'Person';
}
