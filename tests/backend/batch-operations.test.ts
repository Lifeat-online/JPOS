import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as adapter from '../../server/db-adapter.js';
import * as crud from '../../server/db-crud.js';
import * as inventory from '../../server/inventoryLocations.js';
import {
  batchCreateProducts,
  batchUpdateProductPrices,
  exportCustomersCsv,
  exportInventoryCsv,
  importCustomers,
  importInventory,
  parseCsv,
  toCsv,
} from '../../server/batchOperations.js';

vi.mock('../../server/db-adapter.js', () => ({
  getProductsByTenant: vi.fn(),
  getCustomersByTenant: vi.fn(),
}));

vi.mock('../../server/db-crud.js', () => ({
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
}));

vi.mock('../../server/inventoryLocations.js', () => ({
  DEFAULT_INVENTORY_LOCATION_ID: 'main',
  listProductLocationStocks: vi.fn(),
  upsertProductLocationStock: vi.fn(),
}));

const products = [
  { id: 'prod_1', name: 'Burger', price: 95, costPrice: 50, category: 'Meals', section: 'Food', stock: 10, minStock: 3, barcode: 'BRG-1' },
  { id: 'prod_2', name: 'Cake Slice', price: 40, costPrice: 12, category: 'Dessert', section: 'Food', stock: 12, minStock: 4, barcode: 'CAKE-1' },
];

const customers = [
  { id: 'cust_1', name: 'Sarah Client', email: 'sarah@example.com', phone: '0820000000', loyaltyPoints: 10, walletBalance: 5, accountEnabled: true, accountLimit: 500, accountBalance: 100, discountPercent: 3 },
];

describe('batch operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (adapter.getProductsByTenant as any).mockResolvedValue(products);
    (adapter.getCustomersByTenant as any).mockResolvedValue(customers);
    (crud.createProduct as any).mockImplementation((_tenantId: string, product: any) => Promise.resolve({ id: `created_${product.name}`, ...product }));
    (crud.updateProduct as any).mockImplementation((_tenantId: string, id: string, updates: any) => Promise.resolve({ ...products.find(product => product.id === id), ...updates }));
    (crud.createCustomer as any).mockImplementation((_tenantId: string, customer: any) => Promise.resolve({ id: `created_${customer.name}`, ...customer }));
    (crud.updateCustomer as any).mockImplementation((_tenantId: string, id: string, updates: any) => Promise.resolve({ ...customers.find(customer => customer.id === id), ...updates }));
    (inventory.listProductLocationStocks as any).mockResolvedValue([
      { productId: 'prod_1', productName: 'Burger', category: 'Meals', section: 'Food', locationId: 'main', locationName: 'Main', quantity: 10, minStock: 3, reorderThreshold: 5 },
    ]);
    (inventory.upsertProductLocationStock as any).mockImplementation((_tenantId: string, input: any) => Promise.resolve({
      productId: input.productId,
      locationId: input.locationId,
      quantity: input.quantity,
      minStock: input.minStock,
      reorderThreshold: input.reorderThreshold,
    }));
  });

  it('parses and serializes quoted CSV cells', () => {
    const rows = parseCsv('name,notes\n"Coffee, Large","He said ""hot"""\n');

    expect(rows).toEqual([{ name: 'Coffee, Large', notes: 'He said "hot"' }]);
    expect(toCsv(rows, ['name', 'notes'])).toContain('"Coffee, Large"');
    expect(toCsv(rows, ['name', 'notes'])).toContain('"He said ""hot"""');
  });

  it('batch creates products and skips duplicates by barcode', async () => {
    const result = await batchCreateProducts('tenant_1', {
      csv: 'name,price,costPrice,category,stock,barcode\nBrownie,30,11,Dessert,8,BRN-1\nBurger,99,55,Meals,4,BRG-1\n',
    }, { role: 'manager' });

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors[0].message).toMatch(/already exists/i);
    expect(crud.createProduct).toHaveBeenCalledWith('tenant_1', expect.objectContaining({
      name: 'Brownie',
      price: 30,
      costPrice: 11,
      stock: 8,
      barcode: 'BRN-1',
    }));
  });

  it('batch updates product prices by barcode', async () => {
    const result = await batchUpdateProductPrices('tenant_1', {
      rows: [{ barcode: 'CAKE-1', price: 45, costPrice: 13 }],
    }, { role: 'manager' });

    expect(result.updated).toBe(1);
    expect(crud.updateProduct).toHaveBeenCalledWith('tenant_1', 'prod_2', { price: 45, costPrice: 13 });
  });

  it('imports customers as create-or-update rows and exports the customer CSV', async () => {
    const result = await importCustomers('tenant_1', {
      csv: 'name,email,phone,loyaltyPoints\nSarah Updated,sarah@example.com,0820000000,20\nNew Customer,new@example.com,0830000000,0\n',
    }, { staffId: 'mgr_1', staffName: 'Manager' });

    expect(result.updated).toBe(1);
    expect(result.created).toBe(1);
    expect(crud.updateCustomer).toHaveBeenCalledWith('tenant_1', 'cust_1', expect.objectContaining({
      name: 'Sarah Updated',
      loyaltyPoints: 20,
      consentActor: expect.objectContaining({ staffId: 'mgr_1' }),
    }));
    expect(crud.createCustomer).toHaveBeenCalledWith('tenant_1', expect.objectContaining({
      name: 'New Customer',
      email: 'new@example.com',
    }));

    const exportPack = await exportCustomersCsv('tenant_1');
    expect(exportPack.filename).toBe('customers-tenant_1.csv');
    expect(exportPack.csv).toContain('Sarah Client');
    expect(exportPack.csv).toContain('accountEnabled');
  });

  it('exports and imports inventory location quantities', async () => {
    const exportPack = await exportInventoryCsv('tenant_1');
    expect(exportPack.csv).toContain('BRG-1');
    expect(exportPack.csv).toContain('locationId');

    const result = await importInventory('tenant_1', {
      csv: 'barcode,locationId,quantity,minStock,reorderThreshold\nBRG-1,main,15,4,6\n',
    }, { staffId: 'mgr_1', staffName: 'Manager', role: 'manager' });

    expect(result.updated).toBe(1);
    expect(inventory.upsertProductLocationStock).toHaveBeenCalledWith('tenant_1', expect.objectContaining({
      productId: 'prod_1',
      locationId: 'main',
      quantity: 15,
      minStock: 4,
      reorderThreshold: 6,
      staffId: 'mgr_1',
    }));
  });
});
