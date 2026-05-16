import { describe, expect, it } from 'vitest';
import { getWorkstationOrderLabel } from '../../src/components/WorkstationQueuePanel';
import type { Customer, Sale } from '../../src/types';

const customers: Customer[] = [
  {
    id: 'cust_1',
    name: 'Sarah Client',
    email: 'sarah@example.com',
  },
];

describe('workstation order labels', () => {
  it('uses the client name for tab orders', () => {
    const order = {
      isTab: true,
      tabName: 'Bar tab',
      customerId: 'cust_1',
    } as Sale;

    expect(getWorkstationOrderLabel(order, customers)).toBe('Tab Sarah Client');
  });

  it('falls back to tab name before takeaway', () => {
    const order = {
      isTab: true,
      tabName: 'Counter client',
    } as Sale;

    expect(getWorkstationOrderLabel(order, customers)).toBe('Tab Counter client');
  });

  it('keeps table and takeaway labels for non-tab orders', () => {
    expect(getWorkstationOrderLabel({ tableNumber: 'T2' } as Sale, customers)).toBe('Table T2');
    expect(getWorkstationOrderLabel({} as Sale, customers)).toBe('Takeaway');
  });
});
