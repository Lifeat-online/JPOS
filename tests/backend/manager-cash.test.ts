import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { confirmCashCustodyTransfer, createCashCloseCheckpoint, createCashCustodyTransfer, exportManagerCashMovementsCsv, getCashClosePreview, getManagerCashSummary, getManagerCashMovements, recordManagerCashMovement, recordRegisterWalletCashMovement, recordWalletCashMovement, transferCashSessionToManagerFloat } from '../../server/managerCash.js';
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
            if (sql.includes('pendingCustodyTransfers')) {
                return Promise.resolve([{ pendingCustodyTransfers: '2', custodyTransfersToday: '3', custodyVarianceToday: '7.50' }]);
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
            pendingCustodyTransfers: 2,
            custodyTransfersToday: 3,
            custodyVarianceToday: 7.5,
        });
        expect(summary.recentMovements[0]).toMatchObject({ movementType: 'safe_drop', amount: 100 });
    });
    it('builds an end-of-day cash close preview with unresolved cash items', async () => {
        (dbModule.query as any).mockImplementation((sql: string) => {
            if (sql.includes('SUM(CASE') && sql.includes('manager_cash_movements') && sql.includes('managerFloat')) {
                return Promise.resolve([{ managerFloat: '300.00' }]);
            }
            if (sql.includes('openRegisterCount')) {
                return Promise.resolve([{ openRegisterCount: '1', openRegisterCash: '150.00' }]);
            }
            if (sql.includes('pendingCashUpCount')) {
                return Promise.resolve([{ pendingCashUpCount: '1', pendingCashUpCash: '200.00' }]);
            }
            if (sql.includes('staffWalletLiability')) {
                return Promise.resolve([{ staffWalletLiability: '50.00', customerWalletLiability: '25.00' }]);
            }
            if (sql.includes('staffPendingPayouts')) {
                return Promise.resolve([{ staffPendingPayouts: '10.00', customerPendingPayouts: '5.00' }]);
            }
            if (sql.includes('safeDropsToday') && sql.includes('walletCashInToday')) {
                return Promise.resolve([{ safeDropsToday: '60.00', cashUpsToManagerToday: '120.00', pettyCashToday: '15.00', walletCashInToday: '80.00', walletCashOutToday: '20.00', transferInToday: '40.00', transferOutToday: '10.00' }]);
            }
            if (sql.includes('safeDropsToday')) {
                return Promise.resolve([{ safeDropsToday: '60.00', cashUpsToManagerToday: '120.00', pettyCashToday: '15.00', walletCashToday: '100.00' }]);
            }
            if (sql.includes('pendingCustodyTransfers')) {
                return Promise.resolve([{ pendingCustodyTransfers: '1', custodyTransfersToday: '2', custodyVarianceToday: '4.00' }]);
            }
            if (sql.includes('FROM cash_sessions') && sql.includes("status = 'open'") && sql.includes('opened_at')) {
                return Promise.resolve([{ id: 'cs_open', staffName: 'Jess', expectedCash: '150.00' }]);
            }
            if (sql.includes('FROM cash_sessions') && sql.includes("status = 'closed'")) {
                return Promise.resolve([{ id: 'cs_pending', staffName: 'Lebo', actualCash: '200.00', difference: '-5.00' }]);
            }
            if (sql.includes('FROM cash_custody_transfers')) {
                return Promise.resolve([{ id: 'cct_1', fromName: 'Register', toName: 'Manager float', expectedAmount: '100.00', countedAmount: '95.00', variance: '-5.00' }]);
            }
            if (sql.includes('FROM cash_close_checkpoints'))
                return Promise.resolve([]);
            if (sql.includes('SELECT id,') && sql.includes('manager_cash_movements'))
                return Promise.resolve([]);
            return Promise.resolve([]);
        });
        const preview = await getCashClosePreview('tenant_1', '2026-05-26');
        expect(preview).toMatchObject({
            businessDate: '2026-05-26',
            expectedPhysicalCash: 650,
            walletCashInToday: 80,
            walletCashOutToday: 20,
            custodyPendingCount: 1,
        });
        expect(preview.unresolvedItems.map(item => item.type)).toEqual(['open_register', 'pending_cash_up', 'pending_handover']);
    });
    it('creates EOD cash close checkpoints and action center review tasks for variances', async () => {
        (dbModule.query as any).mockImplementation((sql: string) => {
            if (sql.includes('SUM(CASE') && sql.includes('manager_cash_movements') && sql.includes('managerFloat')) {
                return Promise.resolve([{ managerFloat: '300.00' }]);
            }
            if (sql.includes('openRegisterCount'))
                return Promise.resolve([{ openRegisterCount: '0', openRegisterCash: '0.00' }]);
            if (sql.includes('pendingCashUpCount'))
                return Promise.resolve([{ pendingCashUpCount: '0', pendingCashUpCash: '0.00' }]);
            if (sql.includes('staffWalletLiability'))
                return Promise.resolve([{ staffWalletLiability: '0.00', customerWalletLiability: '0.00' }]);
            if (sql.includes('staffPendingPayouts'))
                return Promise.resolve([{ staffPendingPayouts: '0.00', customerPendingPayouts: '0.00' }]);
            if (sql.includes('safeDropsToday') && sql.includes('walletCashInToday'))
                return Promise.resolve([{ safeDropsToday: '0.00', cashUpsToManagerToday: '0.00', pettyCashToday: '0.00', walletCashInToday: '0.00', walletCashOutToday: '0.00', transferInToday: '0.00', transferOutToday: '0.00' }]);
            if (sql.includes('safeDropsToday'))
                return Promise.resolve([{ safeDropsToday: '0.00', cashUpsToManagerToday: '0.00', pettyCashToday: '0.00', walletCashToday: '0.00' }]);
            if (sql.includes('pendingCustodyTransfers'))
                return Promise.resolve([{ pendingCustodyTransfers: '0', custodyTransfersToday: '0', custodyVarianceToday: '0.00' }]);
            if (sql.includes('FROM cash_close_checkpoints') && sql.includes('LIMIT 1'))
                return Promise.resolve([]);
            if (sql.includes('SELECT id FROM cash_close_checkpoints'))
                return Promise.resolve([]);
            if (sql.includes('SELECT id,') && sql.includes('manager_cash_movements'))
                return Promise.resolve([]);
            return Promise.resolve([]);
        });
        const conn = {
            beginTransaction: vi.fn().mockResolvedValue(undefined),
            commit: vi.fn().mockResolvedValue(undefined),
            rollback: vi.fn().mockResolvedValue(undefined),
            release: vi.fn(),
            query: vi.fn().mockResolvedValue([[]]),
        };
        (dbModule.getConnection as any).mockResolvedValue(conn);
        const checkpoint = await createCashCloseCheckpoint('tenant_1', {
            businessDate: '2026-05-26',
            countedAmount: 280,
            note: 'R20 short after final safe count',
        }, {
            staffId: 'mgr_1',
            staffName: 'Manager',
            role: 'manager',
        });
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO cash_close_checkpoints'), expect.arrayContaining(['tenant_1', '2026-05-26', 'review_needed', 300, 280, -20]));
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO manager_tasks'), expect.arrayContaining(['tenant_1', 'cash_variance', 'Review EOD cash close for 2026-05-26']));
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_events'), expect.arrayContaining(['tenant_1', 'cash_close.checkpoint', 'cash_close_checkpoint']));
        expect(checkpoint).toMatchObject({ status: 'review_needed', expectedPhysicalCash: 300, countedPhysicalCash: 280, variance: -20 });
    });
    it('records manager float movements with an audit event', async () => {
        (dbModule.query as any).mockResolvedValue({});
        const movement = await recordManagerCashMovement('tenant_1', {
            movementType: 'petty_cash',
            amount: 35,
            cashSource: 'safe',
            receiptAttachmentUrl: 'https://receipts.example/cleaning.jpg',
            receiptAttachmentName: 'cleaning.jpg',
            note: 'Bought cleaning supplies',
        }, {
            staffId: 'mgr_1',
            staffName: 'Manager',
            role: 'manager',
        });
        expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO manager_cash_movements'), expect.arrayContaining(['tenant_1', 'petty_cash', 'out', 35]));
        expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_events'), expect.arrayContaining(['tenant_1', 'manager_cash.petty_cash', 'manager_cash_movement']));
        expect(movement).toMatchObject({
            movementType: 'petty_cash',
            direction: 'out',
            amount: 35,
            cashSource: 'safe',
            receiptAttachmentName: 'cleaning.jpg',
            approvedBy: 'mgr_1',
            approvedByName: 'Manager',
        });
    });
    it('searches and exports manager cash movements with approver and receipt fields', async () => {
        (dbModule.query as any).mockResolvedValue([{
                id: 'mcm_1',
                tenantId: 'tenant_1',
                movementType: 'payout',
                direction: 'out',
                amount: '75.00',
                cashSource: 'manager_float',
                sourceType: 'manager_float',
                category: 'supplier',
                staffName: 'Manager',
                approvedByName: 'Manager',
                receiptAttachmentName: 'supplier-slip.jpg',
                referenceId: 'ref_1',
                note: 'Supplier change payout',
                createdAt: '2026-05-30T10:00:00.000Z',
            }]);
        const rows = await getManagerCashMovements('tenant_1', {
            movementType: 'payout',
            cashSource: 'manager_float',
            search: 'supplier',
            limit: 25,
        });
        expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining("cash_source = $1"), expect.arrayContaining(['tenant_1', 'payout', 'manager_float', '%supplier%', 25]));
        expect(rows[0]).toMatchObject({
            movementType: 'payout',
            cashSource: 'manager_float',
            receiptAttachmentName: 'supplier-slip.jpg',
            approvedByName: 'Manager',
        });
        const report = await exportManagerCashMovementsCsv('tenant_1', {
            movementType: 'payout',
            cashSource: 'manager_float',
            search: 'supplier',
        });
        expect(report.filename).toContain('masepos-manager-cash-');
        expect(report.csv).toContain('"cash_source"');
        expect(report.csv).toContain('"supplier-slip.jpg"');
        expect(report.csv).toContain('"Manager"');
    });
    it('creates pending cash custody transfers with counted variance and audit trail', async () => {
        (dbModule.query as any).mockResolvedValue({});
        const transfer = await createCashCustodyTransfer('tenant_1', {
            fromType: 'manager_float',
            toType: 'register',
            toName: 'Jess register',
            cashSessionId: 'cs_1',
            expectedAmount: 200,
            countedBreakdown: { '100': 1, '50': 1, '20': 2, '10': 1 },
            note: 'Float top-up',
        }, {
            staffId: 'mgr_1',
            staffName: 'Manager',
            role: 'manager',
        });
        expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO cash_custody_transfers'), expect.arrayContaining(['tenant_1', 'pending_confirmation', 'manager_float', null, 'manager float', 'register', null, 'Jess register', 'cs_1', 200, 200, 0]));
        expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_events'), expect.arrayContaining(['tenant_1', 'cash_transfer.requested', 'cash_custody_transfer']));
        expect(transfer).toMatchObject({ status: 'pending_confirmation', expectedAmount: 200, countedAmount: 200, variance: 0 });
    });
    it('confirms cash custody transfers into manager cash and register ledgers', async () => {
        const conn = {
            beginTransaction: vi.fn().mockResolvedValue(undefined),
            commit: vi.fn().mockResolvedValue(undefined),
            rollback: vi.fn().mockResolvedValue(undefined),
            release: vi.fn(),
            query: vi.fn((sql: string) => {
                if (sql.includes('FROM cash_custody_transfers')) {
                    return Promise.resolve([[{
                                id: 'cct_1',
                                tenant_id: 'tenant_1',
                                status: 'pending_confirmation',
                                from_type: 'register',
                                from_id: 'cs_1',
                                from_name: 'Jess register',
                                to_type: 'manager_float',
                                to_id: null,
                                to_name: 'Manager float',
                                cash_session_id: 'cs_1',
                                expected_amount: '200.00',
                                counted_amount: '195.00',
                                variance: '-5.00',
                                counted_breakdown: '{"100":1,"50":1,"20":2,"5":1}',
                                note: 'Safe drop',
                                requested_by: 'staff_1',
                                requested_by_name: 'Jess',
                            }]]);
                }
                return Promise.resolve([[]]);
            }),
        };
        (dbModule.getConnection as any).mockResolvedValue(conn);
        const transfer = await confirmCashCustodyTransfer('tenant_1', 'cct_1', {}, {
            staffId: 'mgr_1',
            staffName: 'Manager',
            role: 'manager',
        });
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE cash_custody_transfers"), expect.arrayContaining([195, -5]));
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO manager_cash_movements'), expect.arrayContaining(['tenant_1', 'transfer', 'in', 195, 'cs_1']));
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE cash_sessions'), [-195, 'tenant_1', 'cs_1']);
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO cash_movements'), expect.arrayContaining(['tenant_1', 'cs_1', 'cash_drop', 'out', 195]));
        expect(conn.commit).toHaveBeenCalled();
        expect(transfer).toMatchObject({ status: 'confirmed', countedAmount: 195, variance: -5 });
    });
    it('moves reconciled cash-ups into the manager float once', async () => {
        (dbModule.query as any).mockImplementation((sql: string) => {
            if (sql.includes("movement_type = 'register_close'"))
                return Promise.resolve([]);
            if (sql.includes('FROM cash_sessions')) {
                return Promise.resolve([{ id: 'cs_1', staff_id: 'staff_1', staff_name: 'Jess', actual_cash: '250.00' }]);
            }
            return Promise.resolve({});
        });
        const movement = await transferCashSessionToManagerFloat('tenant_1', 'cs_1', {
            staffId: 'mgr_1',
            staffName: 'Manager',
        });
        expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO manager_cash_movements'), expect.arrayContaining(['tenant_1', 'register_close', 'in', 250, 'cs_1', 'staff_1', 'Jess']));
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
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE customers'), [100, 'tenant_1', 'cust_1']);
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO manager_cash_movements'), expect.arrayContaining(['tenant_1', 'wallet_cash_in', 'in', 80, null, null, null, 'cust_1', 'Lebo']));
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_events'), expect.arrayContaining(['tenant_1', 'wallet_cash.in', 'customer_wallet', 'cust_1']));
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
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO manager_cash_movements'), expect.arrayContaining(['tenant_1', 'wallet_cash_out', 'out', 50, null, 'staff_1', 'Jess']));
        expect(result).toMatchObject({ previousBalance: 0, nextBalance: 0, appliedWalletDelta: false });
    });
    it('records cashier wallet cash top-ups against the register without inflating manager float', async () => {
        const conn = {
            beginTransaction: vi.fn().mockResolvedValue(undefined),
            commit: vi.fn().mockResolvedValue(undefined),
            rollback: vi.fn().mockResolvedValue(undefined),
            release: vi.fn(),
            query: vi.fn((sql: string) => {
                if (sql.includes('FROM cash_sessions')) {
                    return Promise.resolve([[{ id: 'cs_1', staffId: 'cashier_1', staffName: 'Jess', status: 'open', expectedCash: '120.00' }]]);
                }
                if (sql.includes('FROM customers')) {
                    return Promise.resolve([[{ id: 'cust_1', name: 'Lebo', walletBalance: '20.00' }]]);
                }
                return Promise.resolve([[]]);
            }),
        };
        (dbModule.getConnection as any).mockResolvedValue(conn);
        const result = await recordRegisterWalletCashMovement('tenant_1', {
            customerId: 'cust_1',
            cashSessionId: 'cs_1',
            direction: 'in',
            amount: 80,
            note: 'Counter top-up',
        }, {
            staffId: 'cashier_1',
            staffName: 'Jess',
            role: 'cashier',
        });
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE customers'), [100, 'tenant_1', 'cust_1']);
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE cash_sessions'), [80, 'tenant_1', 'cs_1']);
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO cash_movements'), expect.arrayContaining(['tenant_1', 'cs_1', 'wallet_cash_in', 'in', 80]));
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO manager_cash_movements'), expect.arrayContaining(['tenant_1', 'wallet_cash_in', 'neutral', 80, 'cs_1', 'cashier_1', 'Jess', 'cust_1', 'Lebo']));
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_events'), expect.arrayContaining(['tenant_1', 'customer_wallet.cash_top_up', 'customer_wallet', 'cust_1']));
        expect(conn.commit).toHaveBeenCalled();
        expect(result).toMatchObject({ previousBalance: 20, nextBalance: 100, cashSessionDelta: 80 });
    });
});
