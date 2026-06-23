import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { clearSeededDemoData, seedDemoData } from '../../server/demo-seed.js';

vi.mock('../../server/db.js', () => ({
  getConnection: vi.fn(),
}));

describe('demo seed data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockConn() {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([[]]),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);
    return conn;
  }

  it('seeds restaurant demo data with bulk items and recipes', async () => {
    const conn = mockConn();

    await seedDemoData('tenant_1', 'restaurant');

    const settingsUpdate = conn.query.mock.calls.find(([sql]: any[]) => String(sql).includes('UPDATE app_settings SET business = ?'));
    expect(settingsUpdate).toBeTruthy();
    expect(JSON.parse(settingsUpdate?.[1]?.[0] || '{}')).toMatchObject({
      packageTier: 'business',
      packageName: 'Business',
      packageStatus: 'active',
      maxRegisters: 15,
    });
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO staff'), expect.anything());
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO customers'), expect.anything());
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO bulk_items'), expect.anything());
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO product_recipes'), expect.anything());
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO workstations'), expect.anything());
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sales'), expect.anything());
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sale_items'), expect.anything());
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO cash_sessions'), expect.anything());
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_events'), expect.anything());
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO layby_orders'), expect.anything());
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO ai_insights'), expect.anything());
    expect(conn.commit).toHaveBeenCalled();
  });

  it('clears seeded demo rows and stale demo package denials', async () => {
    const conn = mockConn();

    await clearSeededDemoData('tenant_1');

    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining("action = 'permission.denied'"), expect.arrayContaining(['tenant_1', '%package.feature.%']));
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining("id LIKE 'demo_prod_%'"), expect.anything());
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM sales WHERE tenant_id = ? AND id LIKE 'demo_%'"), ['tenant_1']);
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM cash_sessions WHERE tenant_id = ? AND id LIKE 'demo_%'"), ['tenant_1']);
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM customers WHERE tenant_id = ? AND id LIKE 'demo_cust_%'"), ['tenant_1']);
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining("id LIKE 'demo_bulk_%'"), ['tenant_1']);
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining("id LIKE 'demo_ws_%'"), ['tenant_1']);
    expect(conn.commit).toHaveBeenCalled();
  });
});
