import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dbModule from '../../server/db.js';
import { getStockValuationReport } from '../../server/stockReports.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
  isPostgres: vi.fn(() => false),
}));

describe('stock valuation reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds valuation, batch, receiving, location, csv, and pdf pack output', async () => {
    (dbModule.query as any)
      .mockResolvedValueOnce([
        {
          id: 'prod_1',
          name: 'Coffee Beans',
          category: 'Groceries',
          section: 'Retail',
          stock: '10',
          minStock: '2',
          price: '30',
          costPrice: '20',
        },
        {
          id: 'prod_2',
          name: 'Cup',
          category: 'Cafe',
          section: 'Retail',
          stock: '2',
          minStock: '1',
          price: '15',
          costPrice: '0',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'batch_1',
          productId: 'prod_1',
          productName: 'Coffee Beans',
          purchaseOrderId: 'po_1',
          supplierInvoiceNumber: 'INV-1',
          batchNumber: 'LOT-1',
          receivedQuantity: '5',
          remainingQuantity: '4',
          unitCost: '18',
          expiryDate: '2999-01-01',
          receivedAt: '2026-06-01T08:00:00.000Z',
          status: 'active',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'po_1',
          invoiceNumber: 'INV-1',
          invoiceDate: '2026-06-01',
          receivedAt: '2026-06-01T08:00:00.000Z',
          receivedByName: 'Manager',
          receivingNote: 'Delivery counted',
          items: JSON.stringify([
            {
              productId: 'prod_1',
              productName: 'Coffee Beans',
              quantity: 4,
              receivedQuantity: 5,
              receivedPrice: 18,
              varianceQuantity: 1,
              batchNumber: 'LOT-1',
              expiryDate: '2999-01-01',
            },
          ]),
        },
      ])
      .mockResolvedValueOnce([
        {
          reasonCode: 'receiving',
          movementCount: '1',
          quantityIn: '5',
          quantityOut: '0',
          netQuantity: '5',
          valueDelta: '90',
        },
        {
          reasonCode: 'sale',
          movementCount: '1',
          quantityIn: '0',
          quantityOut: '1',
          netQuantity: '-1',
          valueDelta: '-20',
        },
      ]);

    const report = await getStockValuationReport('tenant_1', {
      from: '2026-06-01',
      to: '2026-06-01',
      limit: 25,
    });

    expect(dbModule.query).toHaveBeenCalledTimes(4);
    expect(report.summary).toMatchObject({
      totalProducts: 2,
      currentStockQuantity: 12,
      productBookValue: 230,
      batchTrackedQuantity: 4,
      batchRemainingValue: 72,
      unbatchedQuantity: 8,
      unbatchedValue: 150,
      receivedQuantity: 5,
      receivedValue: 90,
      varianceQuantity: 1,
      movementValueDelta: 70,
    });
    expect(report.productRows[0]).toMatchObject({
      productId: 'prod_1',
      productBookValue: 200,
      batchTrackedQuantity: 4,
      unbatchedQuantity: 6,
      locationName: 'Primary stock pool',
    });
    expect(report.batchRows[0]).toMatchObject({
      id: 'batch_1',
      remainingValue: 72,
      locationId: 'main',
    });
    expect(report.receivingRows[0]).toMatchObject({
      purchaseOrderId: 'po_1',
      invoiceNumber: 'INV-1',
      receivedValue: 90,
      varianceQuantity: 1,
    });
    expect(report.locationRows[0]).toMatchObject({
      locationName: 'Primary stock pool',
      receivedValue: 90,
      movementQuantityIn: 5,
      movementQuantityOut: 1,
    });
    expect(report.csv).toContain('"location_impact"');
    expect(report.csv).toContain('"batch_impact"');
    expect(report.csv).toContain('"receiving_impact"');
    expect(Buffer.from(report.pdfBase64, 'base64').toString('latin1')).toContain('%PDF-1.4');
  });
});
