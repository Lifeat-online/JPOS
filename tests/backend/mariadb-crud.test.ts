import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dbModule from '../../server/db.js';
import { createCustomerPayoutRequest, createPayoutRequest, createProduct, createSale, updateProduct, deleteProduct, seedProducts, updateSale, updateSaleItem, receivePurchaseOrder, getStockBatches } from '../../server/mariadb-crud.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
  getConnection: vi.fn(),
  isPostgres: vi.fn(() => false),
}));

describe('mariadb-crud', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a product with generated id', async () => {
    (dbModule.query as any).mockResolvedValue([{}]);
    const product = await createProduct('tenant_1', { name: 'Sample', price: 25, category: 'Food', stock: 10, minStock: 0 });
    expect(product).toMatchObject({ name: 'Sample', price: 25, category: 'Food', stock: 10 });
    expect(product.id).toMatch(/prod_/);
  });

  it('updates a product and fetches the new row', async () => {
    (dbModule.query as any)
      .mockResolvedValueOnce([{ id: 'prod_1', name: 'Sample', price: 25 }])
      .mockResolvedValueOnce([{ id: 'prod_1', name: 'Sample Updated', price: 30 }]);

    const result = await updateProduct('tenant_1', 'prod_1', { price: 30 });
    expect(result).toMatchObject({ price: 30 });
    expect(dbModule.query).toHaveBeenCalledTimes(2);
  });

  it('deletes a product', async () => {
    (dbModule.query as any).mockResolvedValue({});
    const result = await deleteProduct('tenant_1', 'prod_1');
    expect(result).toBeUndefined();
    expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM products'), ['tenant_1', 'prod_1']);
  });

  it('skips seeded products that already exist', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValueOnce([[{ id: 'prod_existing' }]]),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);

    await seedProducts('tenant_1', [
      { name: 'Bread', price: 16, category: 'Groceries', section: 'Retail', stock: 35, barcode: '778899' },
    ]);

    expect(conn.query).toHaveBeenCalledTimes(1);
    expect(conn.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO products'), expect.anything());
    expect(conn.commit).toHaveBeenCalled();
  });

  it('removes duplicate seeded products while keeping the oldest row', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn()
        .mockResolvedValueOnce([[{ id: 'prod_oldest' }, { id: 'prod_duplicate_1' }, { id: 'prod_duplicate_2' }]])
        .mockResolvedValueOnce([[]]),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);

    await seedProducts('tenant_1', [
      { name: 'Bread', price: 16, category: 'Groceries', section: 'Retail', stock: 35, barcode: '778899' },
    ]);

    expect(conn.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('DELETE FROM products'),
      ['tenant_1', 'prod_duplicate_1', 'prod_duplicate_2']
    );
    expect(conn.commit).toHaveBeenCalled();
  });

  it('creates a sale without treating transaction row tuples as recipe rows', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT bulk_item_id')) return Promise.resolve([[]]);
        return Promise.resolve([[]]);
      }),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);

    const result = await createSale('tenant_1', {
      customerId: 'cust_1',
      status: 'open',
      isTab: true,
      tabName: 'James Koen',
      total: 16,
      subtotal: 16,
      paymentMethod: 'pending',
      items: [{ id: 'prod_1', name: 'Bread', price: 16, quantity: 1 } as any],
    });

    expect(result).toMatchObject({ status: 'open', isTab: true, tabName: 'James Koen' });
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(conn.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE bulk_items SET stock = stock - ?'),
      expect.anything()
    );
  });

  it('does not stamp ordered_at for held workstation items', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT bulk_item_id')) return Promise.resolve([[]]);
        return Promise.resolve([[]]);
      }),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);

    await createSale('tenant_1', {
      status: 'open',
      total: 25,
      subtotal: 25,
      paymentMethod: 'pending',
      items: [{ id: 'prod_1', name: 'Burger', price: 25, quantity: 1, workstationId: 'ws_kitchen' } as any],
    });

    const itemInsert = conn.query.mock.calls.find(([sql]: any[]) => String(sql).includes('INSERT INTO sale_items'));
    expect(String(itemInsert?.[0]).replace(/\s+/g, ' ')).toContain('?, ?, ?, ?, ?, ?, ?, ?, NULL, NOW(), NOW())');
  });

  it('stamps ordered_at with server time when sending workstation items', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT bulk_item_id')) return Promise.resolve([[]]);
        return Promise.resolve([[]]);
      }),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);

    await createSale('tenant_1', {
      status: 'kitchen',
      total: 25,
      subtotal: 25,
      paymentMethod: 'pending',
      items: [{ id: 'prod_1', name: 'Burger', price: 25, quantity: 1, workstationId: 'ws_kitchen' } as any],
    });

    const itemInsert = conn.query.mock.calls.find(([sql]: any[]) => String(sql).includes('INSERT INTO sale_items'));
    expect(String(itemInsert?.[0]).replace(/\s+/g, ' ')).toContain('?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), NOW(), NOW())');
  });

  it('updates a sale and replaces its items', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([[]]),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);
    (dbModule.query as any).mockResolvedValue([
      {
        id: 'sale_1',
        status: 'kitchen',
        total: 25,
        items: [{ id: 'item_existing', productId: 'prod_1', name: 'Burger', quantity: 1, status: 'pending' }],
      },
    ]);

    const result = await updateSale('tenant_1', 'sale_1', {
      status: 'kitchen',
      total: 25,
      items: [{ productId: 'prod_1', name: 'Burger', price: 25, quantity: 1, status: 'pending' } as any],
    });

    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.query).toHaveBeenNthCalledWith(1, expect.stringContaining('SELECT status, transaction_type, staff_id, customer_id, offline_event_id FROM sales'), ['tenant_1', 'sale_1']);
    expect(conn.query).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE sales SET'), [25, 'kitchen', 'tenant_1', 'sale_1']);
    expect(conn.query).toHaveBeenNthCalledWith(3, expect.stringContaining('SELECT * FROM sale_items WHERE sale_id = ?'), ['sale_1']);
    expect(conn.query).toHaveBeenNthCalledWith(4, expect.stringContaining('DELETE FROM sale_items WHERE sale_id = ?'), ['sale_1']);
    expect(conn.query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('INSERT INTO sale_items'),
      expect.arrayContaining(['sale_1', 'prod_1', 'Burger', 25, 1, 'pending'])
    );
    expect(result).toMatchObject({ id: 'sale_1', status: 'kitchen' });
  });

  it('preserves existing workstation timestamps and stamps newly re-added items on resend', async () => {
    const orderedAt = '2026-05-31T09:00:00.000Z';
    const acceptedAt = '2026-05-31T09:04:00.000Z';
    const clientClockValue = '1999-01-01T00:00:00.000Z';
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT status, transaction_type')) {
          return Promise.resolve([[{ status: 'kitchen', transaction_type: 'sale' }]]);
        }
        if (sql.includes('SELECT * FROM sale_items')) {
          return Promise.resolve([[
            {
              id: 'item_existing',
              status: 'accepted',
              ordered_at: orderedAt,
              accepted_at: acceptedAt,
              ready_at: null,
              delivered_at: null,
            },
          ]]);
        }
        return Promise.resolve([[]]);
      }),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);
    (dbModule.query as any)
      .mockResolvedValueOnce([{ id: 'sale_1', status: 'kitchen', total: 40 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await updateSale('tenant_1', 'sale_1', {
      status: 'kitchen',
      total: 40,
      items: [
        {
          id: 'item_existing',
          productId: 'prod_1',
          name: 'Burger',
          price: 25,
          quantity: 1,
          status: 'pending',
          workstationId: 'ws_kitchen',
          orderedAt: clientClockValue,
          acceptedAt: clientClockValue,
        },
        {
          id: 'prod_2',
          name: 'Fries',
          price: 15,
          quantity: 1,
          status: 'pending',
          workstationId: 'ws_kitchen',
          orderedAt: clientClockValue,
        },
      ] as any,
    });

    const itemInserts = conn.query.mock.calls.filter(([sql]: any[]) => String(sql).includes('INSERT INTO sale_items'));
    expect(itemInserts).toHaveLength(2);
    expect(String(itemInserts[0][0]).replace(/\s+/g, ' ')).toContain('?, ?, NULL, NULL, ?, NOW(), NOW())');
    expect(itemInserts[0][1]).toEqual(expect.arrayContaining([orderedAt, acceptedAt]));
    expect(itemInserts[0][1]).not.toContain(clientClockValue);
    expect(String(itemInserts[1][0]).replace(/\s+/g, ' ')).toContain('UTC_TIMESTAMP(), NULL, NULL, NULL, ?, NOW(), NOW())');
    expect(itemInserts[1][1]).not.toContain(clientClockValue);
  });

  it.each([
    ['accepted', 'accepted_at'],
    ['ready', 'ready_at'],
    ['delivered', 'delivered_at'],
  ])('stamps %s items without trusting client timestamps', async (status, column) => {
    (dbModule.query as any).mockResolvedValue([{}]);

    await updateSaleItem('tenant_1', 'sale_1', 'item_1', {
      status,
      actionStaffId: 'staff_1',
      orderedAt: '1999-01-01T00:00:00.000Z',
      acceptedAt: '1999-01-01T00:00:00.000Z',
      readyAt: '1999-01-01T00:00:00.000Z',
      deliveredAt: '1999-01-01T00:00:00.000Z',
    });

    const [sql, values] = (dbModule.query as any).mock.calls[0];
    expect(sql).toContain(`${column} = COALESCE(${column}, UTC_TIMESTAMP())`);
    expect(sql).not.toContain('ordered_at = ?');
    expect(values).toEqual([status, 'staff_1', 'sale_1', 'item_1']);
  });

  it('records stock movements and audit events when a sale completes', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT bulk_item_id')) return Promise.resolve([[]]);
        if (sql.includes('SELECT id, name, stock')) return Promise.resolve([[{ id: 'prod_1', name: 'Bread', stock: 10 }]]);
        return Promise.resolve([[]]);
      }),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);

    await createSale('tenant_1', {
      customerId: 'cust_1',
      staffId: 'staff_1',
      status: 'completed',
      total: 16,
      subtotal: 16,
      paymentMethod: 'cash',
      items: [{ id: 'prod_1', name: 'Bread', price: 16, quantity: 2 } as any],
    });

    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE products SET stock = ?'),
      [8, 'tenant_1', 'prod_1']
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stock_movements'),
      expect.arrayContaining(['tenant_1', 'product', 'prod_1', null, 'Bread', -2, 10, 8, 'sale'])
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'sale.created', 'sale'])
    );
  });

  it('depletes stock batches in FEFO order when a sale completes', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT bulk_item_id')) return Promise.resolve([[]]);
        if (sql.includes('SELECT id, name, stock')) return Promise.resolve([[{ id: 'prod_1', name: 'Milk', stock: 10 }]]);
        if (sql.includes('FROM stock_batches')) {
          return Promise.resolve([[{ id: 'batch_old', remainingQuantity: 1 }, { id: 'batch_new', remainingQuantity: 5 }]]);
        }
        return Promise.resolve([[]]);
      }),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);

    await createSale('tenant_1', {
      staffId: 'staff_1',
      status: 'completed',
      total: 30,
      subtotal: 30,
      paymentMethod: 'cash',
      items: [{ id: 'prod_1', name: 'Milk', price: 10, quantity: 3 } as any],
    });

    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM stock_batches'),
      ['tenant_1', 'prod_1']
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE stock_batches'),
      [0, 'depleted', 'tenant_1', 'batch_old']
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE stock_batches'),
      [3, 'active', 'tenant_1', 'batch_new']
    );
  });

  it('receives purchase orders by booking audited stock movements once', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM purchase_orders')) {
          return Promise.resolve([[{
            id: 'po_1',
            vendorId: 'vendor_1',
            status: 'sent',
            type: 'once_off',
            recurringFrequency: null,
            items: JSON.stringify([{ productId: 'prod_1', productName: 'Coffee Beans', quantity: 5, expectedPrice: 40 }]),
            totalAmount: 200,
            expectedDeliveryDate: null,
            invoiceStatus: 'unpaid',
          }]]);
        }
        if (sql.includes('SELECT id, name, stock')) {
          return Promise.resolve([[{ id: 'prod_1', name: 'Coffee Beans', stock: 4 }]]);
        }
        return Promise.resolve([[]]);
      }),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);

    const result = await receivePurchaseOrder('tenant_1', 'po_1', {
      invoiceNumber: 'INV-100',
      invoiceDate: '2026-06-01',
      invoiceStatus: 'paid',
      note: 'Manager counted delivery',
      items: [{ lineIndex: 0, productId: 'prod_1', receivedQuantity: 6, receivedPrice: 42, expiryDate: '2026-07-15', batchNumber: 'LOT-7', note: 'One extra bag delivered' }],
    }, { staffId: 'mgr_1', staffName: 'Manager' });

    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE products SET stock = ?'),
      [10, 'tenant_1', 'prod_1']
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stock_movements'),
      expect.arrayContaining(['tenant_1', 'product', 'prod_1', null, 'Coffee Beans', 6, 4, 10, 'purchase_order_receiving', 'receiving'])
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE purchase_orders'),
      expect.arrayContaining(['received', 'paid', expect.any(String), 'INV-100', '2026-06-01', 'mgr_1', 'Manager', 'Manager counted delivery', 252, 'tenant_1', 'po_1'])
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'purchase_order.received', 'purchase_order', 'po_1'])
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stock_batches'),
      expect.arrayContaining(['tenant_1', 'prod_1', 'Coffee Beans', 'po_1', 'vendor_1', 'INV-100', '2026-06-01', 'LOT-7', 6, 6, 42, '2026-07-15'])
    );
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 'po_1',
      status: 'received',
      invoiceNumber: 'INV-100',
      receivedTotalAmount: 252,
    });
    expect(result.items[0]).toMatchObject({
      receivedQuantity: 6,
      receivedPrice: 42,
      varianceQuantity: 1,
      expiryDate: '2026-07-15',
      batchNumber: 'LOT-7',
    });
  });

  it('rejects duplicate purchase-order receiving before stock is booked again', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValueOnce([[{
        id: 'po_1',
        status: 'received',
        items: JSON.stringify([{ productId: 'prod_1', productName: 'Coffee Beans', quantity: 5, expectedPrice: 40 }]),
      }]]),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);

    await expect(receivePurchaseOrder('tenant_1', 'po_1', {}, { staffId: 'mgr_1' }))
      .rejects.toThrow('already been received');

    expect(conn.query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE products SET stock = ?'), expect.anything());
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalled();
  });

  it('serializes stock batch expiry status and FEFO rotation guidance', async () => {
    (dbModule.query as any).mockResolvedValue([
      {
        id: 'batch_expired',
        tenantId: 'tenant_1',
        productId: 'prod_1',
        productName: 'Milk',
        receivedQuantity: 4,
        remainingQuantity: 4,
        unitCost: 12,
        expiryDate: '2000-01-01',
        status: 'active',
      },
      {
        id: 'batch_future',
        tenantId: 'tenant_1',
        productId: 'prod_1',
        productName: 'Milk',
        receivedQuantity: 5,
        remainingQuantity: 5,
        unitCost: 12,
        expiryDate: '2999-01-01',
        status: 'active',
      },
      {
        id: 'batch_depleted',
        tenantId: 'tenant_1',
        productId: 'prod_1',
        productName: 'Milk',
        receivedQuantity: 2,
        remainingQuantity: 0,
        unitCost: 12,
        expiryDate: '2999-02-01',
        status: 'depleted',
      },
    ]);

    const batches = await getStockBatches('tenant_1');

    expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('FROM stock_batches'), ['tenant_1']);
    expect(batches[0]).toMatchObject({
      id: 'batch_expired',
      expiryStatus: 'expired',
      rotationRank: null,
      rotationGuidance: 'Expired stock - isolate',
    });
    expect(batches[1]).toMatchObject({
      id: 'batch_future',
      expiryStatus: 'ok',
      rotationRank: 1,
      rotationGuidance: 'Use first (FEFO)',
    });
    expect(batches[2]).toMatchObject({
      id: 'batch_depleted',
      expiryStatus: 'depleted',
      rotationRank: null,
      rotationGuidance: 'Depleted',
    });
  });

  it('includes offline_event_id and sync_source in the INSERT when provided', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([[]]),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);

    await createSale('tenant_1', {
      staffId: 'staff_1',
      status: 'completed',
      total: 30,
      subtotal: 30,
      paymentMethod: 'cash',
      items: [{ id: 'prod_1', name: 'Tea', price: 30, quantity: 1 } as any],
      offlineEventId: 'offline_sale_123_test',
      localReceiptNumber: 'OFF-DEV-000001',
      deviceId: 'device_test_1',
    } as any);

    // offline_event_id and sync_source should appear in the INSERT
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO sales'),
      expect.arrayContaining(['offline_sale_123_test', 'offline'])
    );
    // offline.sale_synced audit event should be recorded
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'offline.sale_synced', 'sale'])
    );
  });

  it('records manager-review conflicts when an offline sync would oversell stock', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, name, stock')) return Promise.resolve([[{ id: 'prod_1', name: 'Tea', stock: 1 }]]);
        if (sql.includes('SELECT bulk_item_id')) return Promise.resolve([[]]);
        return Promise.resolve([[]]);
      }),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.query as any).mockResolvedValue([[]]);
    (dbModule.getConnection as any).mockResolvedValue(conn);

    await createSale('tenant_1', {
      staffId: 'staff_1',
      status: 'completed',
      total: 90,
      subtotal: 90,
      paymentMethod: 'cash',
      items: [{ id: 'prod_1', name: 'Tea', price: 30, quantity: 3 } as any],
      offlineEventId: 'offline_sale_stock_short',
      localReceiptNumber: 'OFF-DEV-000002',
      deviceId: 'device_test_1',
    } as any);

    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'offline.sync_conflict', 'sale'])
    );
    const conflictAudit = conn.query.mock.calls.find(([sql, params]: any[]) => (
      String(sql).includes('INSERT INTO audit_events') && params?.[2] === 'offline.sync_conflict'
    ));
    const details = JSON.parse(conflictAudit?.[1]?.[10] || '{}');
    expect(details).toMatchObject({
      offlineEventId: 'offline_sale_stock_short',
      conflictType: 'negative_stock_after_sync',
      recommendedAction: expect.stringContaining('adjust stock'),
    });
    expect(details.conflicts[0]).toMatchObject({
      productId: 'prod_1',
      requestedQuantity: 3,
      availableStock: 1,
    });
  });

  it('deducts customer wallet inside completed wallet checkout transactions', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, name, wallet_balance')) {
          return Promise.resolve([[{ id: 'cust_1', name: 'Lebo', walletBalance: '100.00' }]]);
        }
        return Promise.resolve([[]]);
      }),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);

    await createSale('tenant_1', {
      customerId: 'cust_1',
      staffId: 'staff_1',
      status: 'completed',
      total: 40,
      subtotal: 40,
      paymentMethod: 'wallet',
      items: [],
      payments: [{ method: 'wallet', amount: 40 } as any],
    });

    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE customers'),
      [60, 'tenant_1', 'cust_1']
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'customer_wallet.sale_payment', 'customer_wallet', 'cust_1'])
    );
    expect(conn.commit).toHaveBeenCalled();
  });

  it('reserves staff wallet balance when creating payout requests', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM staff')) {
          return Promise.resolve([[{ id: 'staff_1', name: 'Jess', walletBalance: '90.00' }]]);
        }
        return Promise.resolve([[]]);
      }),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);

    const request = await createPayoutRequest('tenant_1', {
      staffId: 'staff_1',
      staffName: 'Jess',
      amount: 35,
      status: 'pending',
    });

    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE staff'),
      [55, 'tenant_1', 'staff_1']
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO payout_requests'),
      expect.arrayContaining(['tenant_1', 'staff_1', 'Jess', 35, 'pending'])
    );
    expect(request).toMatchObject({ staffId: 'staff_1', amount: 35, status: 'pending' });
  });

  describe('transaction-safe checkout side effects', () => {
    function makeConn() {
      return {
        beginTransaction: vi.fn().mockResolvedValue(undefined),
        query: vi.fn().mockResolvedValue([[]]),
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined),
        release: vi.fn(),
      };
    }

    const baseSale = {
      items: [{ id: 'prod_1', name: 'Item', price: 50, quantity: 1 }],
      total: 50,
      subtotal: 50,
      taxAmount: 0,
      taxRate: 0,
      taxInclusive: true,
      paymentMethod: 'cash',
      status: 'completed',
      transactionType: 'sale',
      customerId: 'cust_1',
      staffId: 'staff_1',
      payments: [{ method: 'cash', amount: 50, tenderedAmount: 50, changeAmount: 0, tipAmount: 0, cashOutAmount: 0 }],
    };

    it('applies loyalty points, cash session, staff metrics and account balance atomically within the sale transaction', async () => {
      const conn = makeConn();
      (dbModule.getConnection as any).mockResolvedValue(conn);

      const sale = {
        ...baseSale,
        cashSessionId: 'cs_1',
        loyaltyPoints: 100,
        expectedCashDelta: 50,
        cashMovements: [{ type: 'cash_sale', direction: 'in', amount: 50, staffId: 'staff_1', note: 'Cash sale' }],
        staffMetrics: { ordersDelta: 1, tipsDelta: 0 },
      };

      await createSale('tenant_1', sale as any);

      // Verify loyalty points update within the transaction
      expect(conn.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE customers'),
        expect.arrayContaining([100, 'tenant_1', 'cust_1'])
      );

      // Verify cash session expected_cash update within the transaction
      expect(conn.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE cash_sessions'),
        expect.arrayContaining([50, 'cs_1', 'tenant_1'])
      );

      // Verify cash movement recorded within the transaction
      expect(conn.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO cash_movements'),
        expect.arrayContaining(['tenant_1', 'cs_1', 'cash_sale', 'in', 50, expect.stringContaining('sale_')])
      );

      // Verify staff metrics update within the transaction
      expect(conn.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE staff'),
        expect.arrayContaining([expect.stringContaining('orders'), 'tenant_1', 'staff_1'])
      );

      // Verify commit was called (not rollback)
      expect(conn.commit).toHaveBeenCalled();
      expect(conn.rollback).not.toHaveBeenCalled();
    });

    it('applies tips delta for card payments', async () => {
      const conn = makeConn();
      (dbModule.getConnection as any).mockResolvedValue(conn);

      const sale = {
        ...baseSale,
        paymentMethod: 'card',
        payments: [{ method: 'card', amount: 60, tenderedAmount: 60, tipAmount: 10, cashOutAmount: 0 }],
        cashSessionId: 'cs_1',
        tipsDelta: 10,
        cashMovements: [{ type: 'tip', direction: 'neutral', amount: 10, staffId: 'staff_1', note: 'Card tip' }],
        staffMetrics: { ordersDelta: 1, tipsDelta: 10 },
      };

      await createSale('tenant_1', sale as any);

      expect(conn.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE cash_sessions'),
        expect.arrayContaining([10, 'cs_1', 'tenant_1'])
      );

      expect(conn.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO cash_movements'),
        expect.arrayContaining(['tenant_1', 'cs_1', 'tip', 'neutral', 10])
      );

      expect(conn.commit).toHaveBeenCalled();
    });

    it('applies account balance delta for account payments', async () => {
      const conn = makeConn();
      (dbModule.getConnection as any).mockResolvedValue(conn);

      const sale = {
        ...baseSale,
        paymentMethod: 'account',
        payments: [{ method: 'account', amount: 50, tenderedAmount: 50, changeAmount: 0, tipAmount: 0, cashOutAmount: 0 }],
        cashSessionId: 'cs_1',
        accountBalanceDelta: 50,
        staffMetrics: { ordersDelta: 1 },
      };

      await createSale('tenant_1', sale as any);

      expect(conn.query).toHaveBeenCalledWith(
        expect.stringContaining('GREATEST'),
        expect.arrayContaining([50, 'tenant_1', 'cust_1'])
      );

      expect(conn.commit).toHaveBeenCalled();
    });

    it('rolls back entire transaction when a side effect fails', async () => {
      const conn = makeConn();
      // Make the staff metrics query (FOR UPDATE on staff) fail
      conn.query.mockImplementation((sql: string) => {
        if (sql.includes('staff') && sql.includes('FOR UPDATE')) {
          return Promise.reject(new Error('DB lock timeout'));
        }
        return Promise.resolve([[]]);
      });
      (dbModule.getConnection as any).mockResolvedValue(conn);

      const sale = {
        ...baseSale,
        cashSessionId: 'cs_1',
        staffMetrics: { ordersDelta: 1 },
      };

      await expect(createSale('tenant_1', sale as any)).rejects.toThrow('DB lock timeout');

      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.commit).not.toHaveBeenCalled();
    });
  });

  it('reserves customer wallet balance when creating customer payout requests', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM customers')) {
          return Promise.resolve([[{ id: 'cust_1', name: 'Lebo', email: 'lebo@example.test', walletBalance: '70.00' }]]);
        }
        return Promise.resolve([[]]);
      }),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);

    const request = await createCustomerPayoutRequest('tenant_1', {
      customerId: 'cust_1',
      customerName: 'Lebo',
      customerEmail: 'lebo@example.test',
      amount: 30,
      status: 'pending',
    });

    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE customers'),
      [40, 'tenant_1', 'cust_1']
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO customer_payout_requests'),
      expect.arrayContaining(['tenant_1', 'cust_1', 'Lebo', 'lebo@example.test', 30, 'pending'])
    );
    expect(request).toMatchObject({ customerId: 'cust_1', amount: 30, status: 'pending' });
  });
});
