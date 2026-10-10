import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as adapter from '../../server/db-adapter.js';
import * as crud from '../../server/db-crud.js';
import * as capacity from '../../server/packageCapacity.js';
import * as inventory from '../../server/inventoryLocations.js';
import {
  batchCreateProducts,
  batchUpdateProductPrices,
  exportCustomersCsv,
  exportInventoryCsv,
  importCustomers,
  importInventory,
  importStaff,
  importVendors,
  exportVendorsCsv,
  MAX_BATCH_ROWS,
  parseCsv,
  toCsv,
} from '../../server/batchOperations.js';

vi.mock('../../server/db-adapter.js', () => ({
  getProductsByTenant: vi.fn(),
  getCustomersByTenant: vi.fn(),
  getStaffByTenant: vi.fn(),
}));

vi.mock('../../server/packageCapacity.js', () => ({
  remainingPackageCapacity: vi.fn(),
}));

vi.mock('../../server/db-crud.js', () => ({
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  createStaff: vi.fn(),
  getVendors: vi.fn(),
  createVendor: vi.fn(),
  updateVendor: vi.fn(),
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
    (capacity.remainingPackageCapacity as any).mockResolvedValue(Infinity);
    (adapter.getStaffByTenant as any).mockResolvedValue([{ id: 'staff_1', name: 'Existing', email: 'Existing@Example.com', role: 'cashier' }]);
    (crud.getVendors as any).mockResolvedValue([{ id: 'v1', name: 'Acme Foods', email: 'old@acme.com', phone: '111', status: 'active' }]);
    (crud.createVendor as any).mockImplementation((_t: string, v: any) => Promise.resolve({ id: `vendor_${v.name}`, ...v }));
    (crud.updateVendor as any).mockResolvedValue(undefined);
    (crud.createStaff as any).mockImplementation((_t: string, st: any) => Promise.resolve({ id: `staff_${st.email}`, ...st }));
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
    }), { embed: false }); // bulk import skips inline embedding (backfill covers it)
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
  it('creates, updates, dedupes and validates vendors', async () => {
    const result = await importVendors('tenant_1', {
      csv: 'name,contact,email,phone,status\nNew Co,Jo,jo@new.co,222,\nacme foods,,,333,inactive\nNew Co,,,,\nBad Co,,nope,,\n',
    }, { role: 'manager' });

    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.errors.map((e) => e.message)).toEqual(['Duplicate vendor name in file', 'Vendor email is not valid']);
    expect(crud.createVendor).toHaveBeenCalledWith('tenant_1', expect.objectContaining({ name: 'New Co', contactPerson: 'Jo', status: 'active' }));
    expect(crud.updateVendor).toHaveBeenCalledWith('tenant_1', 'v1', { phone: '333', status: 'inactive' });
  });

  it('does not write vendors on dry run and exports vendors csv', async () => {
    const result = await importVendors('tenant_1', { dryRun: true, rows: [{ name: 'New Co' }, { name: 'Acme Foods', phone: '9' }] });
    expect(result.dryRun).toBe(true);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(crud.createVendor).not.toHaveBeenCalled();
    expect(crud.updateVendor).not.toHaveBeenCalled();

    const pack = await exportVendorsCsv('tenant_1');
    expect(pack.csv.split('\n')[0]).toBe('name,contact_person,email,phone,address,status');
    expect(pack.filename).toMatch(/^vendors-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(pack.count).toBe(1);
  });

  it('denies staff roles the actor cannot assign and skips existing emails', async () => {
    const result = await importStaff('tenant_1', {
      rows: [
        { name: 'A', email: 'a@x.co', role: 'admin' },
        { name: 'B', email: 'existing@example.com', role: 'cashier' },
        { name: 'C', email: 'c@x.co', role: 'Cashier' },
      ],
    }, { role: 'manager' });

    expect(result.created).toBe(1);
    expect(result.errors.map((e) => e.message)).toEqual(["Your role can't create admin accounts", 'Staff member with this email already exists']);
    expect(crud.createStaff).toHaveBeenCalledTimes(1);
  });

  it('ignores sensitive staff columns and reports createStaff failures generically', async () => {
    await importStaff('tenant_1', {
      rows: [{ name: 'C', email: 'c@x.co', role: 'cashier', password: 'pw', pin: '1234', wallet_balance: '500', discount_percent: '50', id_number: '1', permissions: '{"x":1}', pay_rate: '25', pay_type: 'hourly' }],
    }, { role: 'admin' });
    const args = (crud.createStaff as any).mock.calls[0][1];
    expect(args).toEqual({ name: 'C', email: 'c@x.co', role: 'cashier', status: 'active', payRate: 25, payType: 'hourly' });

    (crud.createStaff as any).mockRejectedValueOnce(new Error('duplicate key tenant_9'));
    const failed = await importStaff('tenant_1', { rows: [{ name: 'D', email: 'd@x.co', role: 'chef' }] }, { role: 'admin' });
    expect(failed.created).toBe(0);
    expect(failed.errors[0].message).toBe("Couldn't create this staff member — the email may already be in use");
  });

  it('skips staff rows beyond remaining package capacity, also in dry run', async () => {
    (capacity.remainingPackageCapacity as any).mockResolvedValue(1);
    const rows = [1, 2, 3].map((n) => ({ name: `S${n}`, email: `s${n}@x.co`, role: 'cashier' }));
    const result = await importStaff('tenant_1', { rows, dryRun: true }, { role: 'admin' });
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.errors[0].message).toBe('Package limit reached — upgrade your package to add more staff');
    expect(crud.createStaff).not.toHaveBeenCalled();
  });

  it('skips product and customer creates beyond package capacity', async () => {
    (capacity.remainingPackageCapacity as any).mockResolvedValue(1);
    const p = await batchCreateProducts('tenant_1', { rows: [{ name: 'P1', price: 1 }, { name: 'P2', price: 2 }] });
    expect(p.created).toBe(1);
    expect(p.errors[0].message).toBe('Package limit reached — upgrade your package to add more products');
    const c = await importCustomers('tenant_1', { rows: [{ name: 'N1' }, { name: 'N2' }, { email: 'sarah@example.com', name: 'Sarah' }] });
    expect(c.created).toBe(1);
    expect(c.updated).toBe(1);
    expect(c.errors[0].message).toBe('Package limit reached — upgrade your package to add more customers');
  });

  it('rejects imports over the row cap', async () => {
    const rows = Array.from({ length: MAX_BATCH_ROWS + 1 }, (_, i) => ({ name: `P${i}`, price: 1 }));
    await expect(batchCreateProducts('tenant_1', { rows })).rejects.toThrow('This file has 1001 rows. Import up to 1000 rows at a time');
    await expect(importVendors('tenant_1', { rows })).rejects.toThrow(/1001 rows/);
  });
});
