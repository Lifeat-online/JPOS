import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteCustomer } from '../../server/db-crud.js';
import { recordAuditEvent } from '../../server/audit.js';

const conn = {
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  query: vi.fn(),
};

vi.mock('../../server/db.js', () => ({
  getConnection: vi.fn(() => conn),
  query: vi.fn(),
}));

vi.mock('../../server/audit.js', () => ({
  recordAuditEvent: vi.fn(),
}));

describe('customer privacy anonymization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conn.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM customers')) {
        return Promise.resolve([[{
          id: 'cust_1',
          name: 'Private Customer',
          email: 'private@example.test',
          phone: '0821234567',
          walletBalance: '0.00',
          accountBalance: '0.00',
          isAnonymized: 0,
        }]]);
      }
      if (sql.includes('COUNT(*)')) return Promise.resolve([[{ count: 0 }]]);
      if (sql.includes('SELECT status') && sql.includes('customer_consents')) return Promise.resolve([[{ status: 'granted' }]]);
      return Promise.resolve([[]]);
    });
  });

  it('anonymizes customer PII, preserves legal transaction anchors, revokes consent, and audits the request', async () => {
    const result = await deleteCustomer('tenant_1', 'cust_1', {
      staffId: 'staff_1',
      staffName: 'Manager',
      reason: 'Customer requested deletion',
    });

    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      mode: 'anonymized',
      customerId: 'cust_1',
      retainedSaleCount: 0,
    });

    const sqlCalls = conn.query.mock.calls.map(call => String(call[0]));
    expect(sqlCalls).toEqual(expect.arrayContaining([
      expect.stringContaining('UPDATE customers'),
      expect.stringContaining('UPDATE customer_payout_requests'),
      expect.stringContaining('UPDATE payout_requests'),
      expect.stringContaining('UPDATE manager_cash_movements'),
      expect.stringContaining('UPDATE layby_orders'),
      expect.stringContaining('UPDATE event_bookings'),
    ]));
    expect(sqlCalls.filter(sql => sql.includes('INSERT INTO customer_consents'))).toHaveLength(6);
    expect(sqlCalls.filter(sql => sql.includes('INSERT INTO customer_consent_events'))).toHaveLength(6);
    expect(recordAuditEvent).toHaveBeenCalledWith(conn, expect.objectContaining({
      tenantId: 'tenant_1',
      action: 'customer.anonymized',
      entityType: 'customer',
      entityId: 'cust_1',
      customerId: 'cust_1',
      staffId: 'staff_1',
      source: 'customer_privacy',
    }));
  });

  it('blocks anonymization while financial obligations remain active', async () => {
    conn.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM customers')) {
        return Promise.resolve([[{
          id: 'cust_1',
          name: 'Private Customer',
          walletBalance: '50.00',
          accountBalance: '0.00',
          isAnonymized: 0,
        }]]);
      }
      if (sql.includes('COUNT(*)')) return Promise.resolve([[{ count: 0 }]]);
      return Promise.resolve([[]]);
    });

    await expect(deleteCustomer('tenant_1', 'cust_1', { staffId: 'staff_1' })).rejects.toThrow('wallet balance');
    expect(conn.rollback).toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});
