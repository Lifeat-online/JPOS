import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { getManagerCashSummary, recordManagerCashMovement, recordWalletCashMovement, transferCashSessionToManagerFloat } from '../../server/managerCash.js';

vi.mock('../../server/db.js', () => ({
  getConnection: vi.fn(),
  query: vi.fn(),
}));

describe('manager cash float', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('summarizes manager float, register cash, pending cash-ups, and wallet liability separately', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('SUM(CASE') && sql.includes('manager_cash_movements')) {
        return Promise.resolve([{ managerFloat: '300.00' }]);
      }
      if (sql.includes('openRegisterCount')) {
        return Promise.resolve([{ openRegisterCount: '2', openRegisterCash: '450.00' }]);
      }
      if (sql.includes('pendingCashUpCount')) {
        return Promise.resolve([{ pendingCashUpCount: '1', pendingCashUpCash: '120.00' }]);
      }
      if (sql.includes('staffWalletLiability')) {
        return Promise.resolve([{ staffWalletLiability: '80.00', customerWalletLiability: '40.00' }]);
      }
      if (sql.includes('staffPendingPayouts')) {
        return Promise.resolve([{ staffPendingPayouts: '25.00', customerPendingPayouts: '15.00' }]);
      }
      if (sql.includes('safeDropsToday')) {
        return Promise.resolve([{ safeDropsToday: '100.00', cashUpsToManagerToday: '50.00', pettyCashToday: '20.00', walletCashToday: '30.00' }]);
      }
      if (sql.includes('SELECT id,') && sql.includes('manager_cash_movements')) {
        return Promise.resolve([{
          id: 'mcm_1',
          tenantId: 'tenant_1',
          movementType: 'safe_drop',
          direction: 'in',
          amount: '100.00',
          note: 'Safe bag 1',
        }]);
      }
      return Promise.resolve([]);
    });

    const summary = await getManagerCashSummary('tenant_1');

    expect(summary).toMatchObject({
      managerFloat: 300,
      openRegisterCash: 450,
      pendingCashUpCash: 120,
      totalPhysicalCash: 870,
      walletLiability: 120,
      pendingPayouts: 40,
      availableAfterWalletLiability: 750,
    });
    expect(summary.recentMovements[0]).toMatchObject({ movementType: 'safe_drop', amount: 100 });
  });

  it('records manager float movements with an audit event', async () => {
    (dbModule.query as any).mockResolvedValue({});

    const movement = await recordManagerCashMovement('tenant_1', {
      movementType: 'petty_cash',
      amount: 35,
      note: 'Bought cleaning supplies',
    }, {
      staffId: 'mgr_1',
      staffName: 'Manager',
      role: 'manager',
    });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO manager_cash_movements'),
      expect.arrayContaining(['tenant_1', 'petty_cash', 'out', 35])
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'manager_cash.petty_cash', 'manager_cash_movement'])
    );
    expect(movement).toMatchObject({ movementType: 'petty_cash', direction: 'out', amount: 35 });
  });

  it('moves reconciled cash-ups into the manager float once', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes("movement_type = 'register_close'")) return Promise.resolve([]);
      if (sql.includes('FROM cash_sessions')) {
        return Promise.resolve([{ id: 'cs_1', staff_id: 'staff_1', staff_name: 'Jess', actual_cash: '250.00' }]);
      }
      return Promise.resolve({});
    });

    const movement = await transferCashSessionToManagerFloat('tenant_1', 'cs_1', {
      staffId: 'mgr_1',
      staffName: 'Manager',
    });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO manager_cash_movements'),
      expect.arrayContaining(['tenant_1', 'register_close', 'in', 250, 'cs_1', 'staff_1', 'Jess'])
    );
    expect(movement).toMatchObject({ movementType: 'register_close', amount: 250, cashSessionId: 'cs_1' });
  });

  it('updates wallet balance and manager float atomically for cash wallet top-ups', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
      query: vi.fn((sql: string) => {
        if (sql.includes('FROM customers')) {
          return Promise.resolve([[{ id: 'cust_1', name: 'Lebo', walletBalance: '20.00' }]]);
        }
        return Promise.resolve([[]]);
      }),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);

    const result = await recordWalletCashMovement('tenant_1', {
      ownerType: 'customer',
      ownerId: 'cust_1',
      direction: 'in',
      amount: 80,
      note: 'Cash top-up',
    }, {
      staffId: 'mgr_1',
      staffName: 'Manager',
    });

    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE customers'),
      [100, 'tenant_1', 'cust_1']
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO manager_cash_movements'),
      expect.arrayContaining(['tenant_1', 'wallet_cash_in', 'in', 80, null, null, null, 'cust_1', 'Lebo'])
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'wallet_cash.in', 'customer_wallet', 'cust_1'])
    );
    expect(conn.commit).toHaveBeenCalled();
    expect(result).toMatchObject({ previousBalance: 20, nextBalance: 100, appliedWalletDelta: true });
  });

  it('records wallet cash payouts without double-deducting already requested payouts', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
      query: vi.fn((sql: string) => {
        if (sql.includes('FROM staff')) {
          return Promise.resolve([[{ id: 'staff_1', name: 'Jess', walletBalance: '0.00' }]]);
        }
        return Promise.resolve([[]]);
      }),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);

    const result = await recordWalletCashMovement('tenant_1', {
      ownerType: 'staff',
      ownerId: 'staff_1',
      direction: 'out',
      amount: 50,
      applyWalletDelta: false,
      referenceId: 'payout_1',
      note: 'Paid payout',
    }, {
      staffId: 'mgr_1',
      staffName: 'Manager',
    });

    expect(conn.query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE staff'), expect.anything());
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO manager_cash_movements'),
      expect.arrayContaining(['tenant_1', 'wallet_cash_out', 'out', 50, null, 'staff_1', 'Jess'])
    );
    expect(result).toMatchObject({ previousBalance: 0, nextBalance: 0, appliedWalletDelta: false });
  });
});
