import { describe, expect, it, vi } from 'vitest';
import { applyProductStockDelta, recordAuditEvent } from '../../server/audit.js';

describe('audit helpers', () => {
  it('records JSON audit event details', async () => {
    const conn = { query: vi.fn().mockResolvedValue([[]]) } as any;

    await recordAuditEvent(conn, {
      tenantId: 'tenant_1',
      action: 'sale.created',
      entityType: 'sale',
      entityId: 'sale_1',
      staffId: 'staff_1',
      details: { total: 25 },
    });

    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'sale.created', 'sale', 'sale_1'])
    );
    expect(conn.query.mock.calls[0][1].at(-1)).toBe(JSON.stringify({ total: 25 }));
  });

  it('applies product stock deltas and records a movement row', async () => {
    const conn = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, name, stock')) {
          return Promise.resolve([[{ id: 'prod_1', name: 'Bread', stock: 10 }]]);
        }
        return Promise.resolve([[]]);
      }),
    } as any;

    const result = await applyProductStockDelta(conn, {
      tenantId: 'tenant_1',
      productId: 'prod_1',
      quantityDelta: -3,
      reason: 'sale',
      referenceType: 'sale',
      referenceId: 'sale_1',
      saleId: 'sale_1',
      staffId: 'staff_1',
    });

    expect(result).toEqual({ previousQuantity: 10, newQuantity: 7, quantityDelta: -3 });
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE products SET stock = ?'),
      [7, 'tenant_1', 'prod_1']
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stock_movements'),
      expect.arrayContaining(['tenant_1', 'product', 'prod_1', null, 'Bread', -3, 10, 7, 'sale'])
    );
  });
});
