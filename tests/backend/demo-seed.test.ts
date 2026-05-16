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

    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO bulk_items'), expect.anything());
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO product_recipes'), expect.anything());
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO workstations'), expect.anything());
    expect(conn.commit).toHaveBeenCalled();
  });

  it('clears seeded demo rows only', async () => {
    const conn = mockConn();

    await clearSeededDemoData('tenant_1');

    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining("id LIKE 'demo_prod_%'"), expect.anything());
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining("id LIKE 'demo_bulk_%'"), ['tenant_1']);
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining("id LIKE 'demo_ws_%'"), ['tenant_1']);
    expect(conn.commit).toHaveBeenCalled();
  });
});
