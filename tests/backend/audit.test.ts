import { describe, expect, it, vi } from 'vitest';
import { applyProductStockDelta, normalizeStockMovementReasonCode, recordAuditEvent, requestIdFromRequest } from '../../server/audit.js';

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
    const insertCall = conn.query.mock.calls.find(([sql]: any[]) => String(sql).includes('INSERT INTO stock_movements'));
    expect(insertCall?.[1][9]).toBe('sale');
    expect(insertCall?.[1][10]).toBe('sale');
  });

  it('normalizes stock movement reason codes to the reporting taxonomy', () => {
    expect(normalizeStockMovementReasonCode('refund_restock')).toBe('refund');
    expect(normalizeStockMovementReasonCode('void_restock')).toBe('void');
    expect(normalizeStockMovementReasonCode('manual_adjustment')).toBe('adjustment');
    expect(normalizeStockMovementReasonCode('stock_take')).toBe('count_correction');
    expect(normalizeStockMovementReasonCode('Count correction')).toBe('count_correction');
    expect(normalizeStockMovementReasonCode('damaged')).toBe('wastage');
    expect(normalizeStockMovementReasonCode('missing')).toBe('shrinkage');
    expect(normalizeStockMovementReasonCode(null, 'purchase_order')).toBe('receiving');
  });

  it('persists request_id when supplied to recordAuditEvent', async () => {
    const conn = { query: vi.fn().mockResolvedValue([[]]) } as any;

    await recordAuditEvent(conn, {
      tenantId: 'tenant_1',
      action: 'sale.refunded',
      entityType: 'sale',
      entityId: 'sale_1',
      requestId: 'req_abc123',
      details: { refundTotal: 5 },
    });

    const insertCall = conn.query.mock.calls.find(([sql]: any[]) => String(sql).includes('INSERT INTO audit_events'));
    expect(insertCall).toBeDefined();
    const params = insertCall?.[1] || [];
    expect(params[10]).toBe('req_abc123');
    expect(JSON.parse(params[11])).toEqual({ refundTotal: 5 });
  });

  it('falls back to null request_id when omitted', async () => {
    const conn = { query: vi.fn().mockResolvedValue([[]]) } as any;

    await recordAuditEvent(conn, {
      tenantId: 'tenant_1',
      action: 'sale.created',
      entityType: 'sale',
      entityId: 'sale_1',
    });

    const insertCall = conn.query.mock.calls.find(([sql]: any[]) => String(sql).includes('INSERT INTO audit_events'));
    const params = insertCall?.[1] || [];
    expect(params[10]).toBeNull();
  });

  it('extracts requestId from x-request-id header', () => {
    const req = { headers: { 'x-request-id': 'req_xyz789' }, requestId: undefined } as any;
    expect(requestIdFromRequest(req)).toBe('req_xyz789');
  });

  it('prefers an explicit requestId property on the request', () => {
    const req = { headers: { 'x-request-id': 'req_from_header' }, requestId: 'req_from_middleware' } as any;
    expect(requestIdFromRequest(req)).toBe('req_from_middleware');
  });

  it('returns null when no requestId is present', () => {
    expect(requestIdFromRequest({ headers: {} } as any)).toBeNull();
    expect(requestIdFromRequest({} as any)).toBeNull();
  });
});
