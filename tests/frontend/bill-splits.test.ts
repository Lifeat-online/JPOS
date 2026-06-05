import { describe, expect, it } from 'vitest';
import { equalBillShares, labeledBillShares, normalizeBillSplitItems } from '../../src/utils/billSplits.ts';

describe('bill split helpers', () => {
  it('splits uneven cents across people without losing the total', () => {
    const shares = equalBillShares(100, 3, 'Person');

    expect(shares.map(share => share.total)).toEqual([33.34, 33.33, 33.33]);
    expect(shares.reduce((sum, share) => sum + share.total, 0)).toBe(100);
  });

  it('assigns restaurant lines to seat or table labels', () => {
    const items = normalizeBillSplitItems([
      { cartItemId: 'burger_line', name: 'Burger', price: 95, quantity: 2 },
      { cartItemId: 'shake_line', name: 'Shake', price: 45, quantity: 1 },
    ]);

    const result = labeledBillShares(items, ['Seat 1', 'Seat 2'], {
      burger_line: 'seat_1',
      shake_line: 'seat_2',
    });

    expect(result.unassignedTotal).toBe(0);
    expect(result.shares).toEqual([
      expect.objectContaining({
        id: 'seat_1',
        label: 'Seat 1',
        total: 190,
        lines: [expect.objectContaining({ name: 'Burger', quantity: 2 })],
      }),
      expect.objectContaining({
        id: 'seat_2',
        label: 'Seat 2',
        total: 45,
        lines: [expect.objectContaining({ name: 'Shake', quantity: 1 })],
      }),
    ]);
  });
});
