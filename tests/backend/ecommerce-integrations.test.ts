import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { getEcommerceMarketplaceExport } from '../../server/ecommerceIntegrations.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

describe('ecommerce marketplace integrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds Shopify, WooCommerce, and Takealot product listing export packs', async () => {
    (dbModule.query as any).mockResolvedValue([
      {
        id: 'prod_1',
        name: 'Classic Burger',
        price: '89.99',
        costPrice: '42.50',
        section: 'Food',
        category: 'Burgers',
        subCategory: 'Beef',
        stock: '12',
        minStock: '5',
        imageUrl: 'https://example.test/burger.jpg',
        barcode: '600100000001',
      },
      {
        id: 'prod_2',
        name: 'Sold Out Soda',
        price: '19.99',
        costPrice: '8.00',
        section: 'Drinks',
        category: 'Cold Drinks',
        stock: '0',
        minStock: '4',
        imageUrl: '',
        barcode: '',
      },
    ]);

    const report = await getEcommerceMarketplaceExport('tenant_1');

    expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('FROM products'), ['tenant_1']);
    expect(report.summary).toMatchObject({
      productCount: 1,
      targetCount: 3,
      lowStockCount: 0,
      outOfStockCount: 0,
      inventoryValue: 510,
      includeInactive: false,
    });
    expect(report.targets.map(target => target.id)).toEqual(['shopify', 'woocommerce', 'takealot']);
    expect(report.targetExports).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetId: 'shopify',
        productCount: 1,
        csv: expect.stringContaining('"Handle","Title","Body (HTML)","Vendor"'),
      }),
      expect.objectContaining({
        targetId: 'woocommerce',
        productCount: 1,
        csv: expect.stringContaining('"ID","Type","SKU","Name"'),
      }),
      expect.objectContaining({
        targetId: 'takealot',
        productCount: 1,
        csv: expect.stringContaining('"SKU","Title","Brand","Barcode"'),
      }),
    ]));
    expect(report.targetExports[0].csv).toContain('"classic-burger-prod-1"');
    expect(report.targetExports[0].csv).not.toContain('Sold Out Soda');
  });

  it('can include out-of-stock listings for full catalogue exports', async () => {
    (dbModule.query as any).mockResolvedValue([
      {
        id: 'prod_2',
        name: 'Sold Out Soda',
        price: '19.99',
        costPrice: '8.00',
        section: 'Drinks',
        category: 'Cold Drinks',
        stock: '0',
        minStock: '4',
        imageUrl: '',
        barcode: '',
      },
    ]);

    const report = await getEcommerceMarketplaceExport('tenant_1', { includeInactive: 'true' });

    expect(report.summary).toMatchObject({
      productCount: 1,
      lowStockCount: 1,
      outOfStockCount: 1,
      includeInactive: true,
    });
    expect(report.targetExports[0].csv).toContain('Sold Out Soda');
    expect(report.targetExports[0].csv).toContain('"draft"');
    expect(report.targetExports[2].csv).toContain('"out_of_stock"');
  });
});
