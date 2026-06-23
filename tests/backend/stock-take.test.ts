import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { approveStockTakeSession, createStockTakeRule, createStockTakeSession, getStockTakeExportPack, getStockTakeSuggestions, runDueStockTakeRules, submitStockTakeCount, } from '../../server/stockTake.js';
vi.mock('../../server/db.js', () => ({
    getConnection: vi.fn(),
    query: vi.fn(),
}));
describe('stocktake workflow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    function mockConnection(queryImpl?: (sql: string, params?: any[]) => Promise<any>) {
        const conn = {
            beginTransaction: vi.fn().mockResolvedValue(undefined),
            commit: vi.fn().mockResolvedValue(undefined),
            rollback: vi.fn().mockResolvedValue(undefined),
            release: vi.fn(),
            query: vi.fn(queryImpl || (() => Promise.resolve([[]]))),
        };
        (dbModule.getConnection as any).mockResolvedValue(conn);
        return conn;
    }
    it('creates an active stocktake with product snapshots and staff assignments', async () => {
        const conn = mockConnection();
        (dbModule.query as any).mockImplementation((sql: string) => {
            if (sql.includes('FROM products')) {
                return Promise.resolve([{ id: 'prod_1', name: 'Milk', barcode: '6001', stock: '12' }]);
            }
            if (sql.includes('FROM staff')) {
                return Promise.resolve([{ id: 'staff_1', name: 'Jess' }]);
            }
            if (sql.includes('FROM stock_take_sessions s')) {
                return Promise.resolve([{
                        id: 'stkt_1',
                        tenantId: 'tenant_1',
                        name: 'Morning cycle',
                        type: 'cycle',
                        status: 'active',
                        itemCount: '1',
                        countedCount: '0',
                        varianceCount: '0',
                    }]);
            }
            if (sql.includes('FROM stock_take_items')) {
                return Promise.resolve([{
                        id: 'item_1',
                        tenantId: 'tenant_1',
                        sessionId: 'stkt_1',
                        productId: 'prod_1',
                        productName: 'Milk',
                        expectedQuantity: '12',
                        assignedTo: 'staff_1',
                        assignedToName: 'Jess',
                        status: 'assigned',
                    }]);
            }
            return Promise.resolve([]);
        });
        const session = await createStockTakeSession('tenant_1', {
            name: 'Morning cycle',
            type: 'cycle',
            assignments: [{ productId: 'prod_1', assignedTo: 'staff_1' }],
        }, {
            staffId: 'mgr_1',
            staffName: 'Manager',
            role: 'manager',
        });
        expect(conn.beginTransaction).toHaveBeenCalled();
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO stock_take_sessions'), expect.arrayContaining(['tenant_1', 'Morning cycle', 'cycle', 'mgr_1', 'Manager']));
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO stock_take_items'), expect.arrayContaining(['tenant_1', expect.any(String), 'prod_1', 'Milk', '6001', 12, 'staff_1', 'Jess']));
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_events'), expect.arrayContaining(['tenant_1', 'stocktake.created', 'stock_take_session']));
        expect(conn.commit).toHaveBeenCalled();
        expect(session).toMatchObject({ name: 'Morning cycle', status: 'active' });
    });
    it('lets assigned staff submit counts and moves complete sessions to submitted', async () => {
        let stockTakeSessionSelects = 0;
        (dbModule.query as any).mockImplementation((sql: string) => {
            if (sql.includes('JOIN stock_take_sessions') && sql.includes('WHERE i.tenant_id')) {
                return Promise.resolve([{
                        id: 'item_1',
                        tenantId: 'tenant_1',
                        sessionId: 'session_1',
                        productId: 'prod_1',
                        productName: 'Milk',
                        expectedQuantity: '10',
                        assignedTo: 'staff_1',
                        assignedToName: 'Jess',
                        status: 'assigned',
                        sessionStatus: 'active',
                    }]);
            }
            if (sql.includes('COUNT(*) AS remaining'))
                return Promise.resolve([{ remaining: '0' }]);
            if (sql.includes('FROM stock_take_sessions s')) {
                stockTakeSessionSelects += 1;
                return Promise.resolve([{
                        id: 'session_1',
                        tenantId: 'tenant_1',
                        name: 'Daily spot',
                        type: 'spot_check',
                        status: stockTakeSessionSelects > 0 ? 'submitted' : 'active',
                        itemCount: '1',
                        countedCount: '1',
                        varianceCount: '1',
                    }]);
            }
            if (sql.includes('FROM stock_take_items')) {
                return Promise.resolve([{
                        id: 'item_1',
                        tenantId: 'tenant_1',
                        sessionId: 'session_1',
                        productId: 'prod_1',
                        productName: 'Milk',
                        expectedQuantity: '10',
                        countedQuantity: '8',
                        varianceQuantity: '-2',
                        assignedTo: 'staff_1',
                        assignedToName: 'Jess',
                        status: 'counted',
                    }]);
            }
            return Promise.resolve([]);
        });
        const result = await submitStockTakeCount('tenant_1', 'item_1', {
            countedQuantity: 8,
            note: 'Front shelf counted',
            varianceReason: 'shrinkage',
        }, {
            staffId: 'staff_1',
            staffName: 'Jess',
            role: 'cashier',
        });
        expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE stock_take_items'), expect.arrayContaining([8, -2, 'shrinkage', 'Shrinkage', 'high', 1, 'staff_1', 'Jess', 'Front shelf counted', 'tenant_1', 'item_1']));
        expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining("SET status = 'submitted'"), ['tenant_1', 'session_1']);
        expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_events'), expect.arrayContaining(['tenant_1', 'stocktake.item_counted', 'stock_take_item', 'item_1']));
        expect(result).toMatchObject({ id: 'session_1', status: 'submitted' });
    });
    it('creates daily spot-check rules for manager scheduling', async () => {
        (dbModule.query as any).mockImplementation((sql: string) => {
            if (sql.includes('FROM staff'))
                return Promise.resolve([{ id: 'staff_1', name: 'Jess' }]);
            if (sql.includes('INSERT INTO stock_take_rules'))
                return Promise.resolve({});
            if (sql.includes('INSERT INTO audit_events'))
                return Promise.resolve({});
            if (sql.includes('FROM stock_take_rules')) {
                return Promise.resolve([{
                        id: 'rule_1',
                        tenantId: 'tenant_1',
                        name: 'Daily shrinkage check',
                        status: 'active',
                        scheduleType: 'daily',
                        runTime: '08:00',
                        productScope: 'low_stock',
                        productCount: '5',
                        assignedTo: 'staff_1',
                        assignedToName: 'Jess',
                        productIds: '[]',
                    }]);
            }
            return Promise.resolve([]);
        });
        const rule = await createStockTakeRule('tenant_1', {
            name: 'Daily shrinkage check',
            runTime: '08:00',
            productScope: 'low_stock',
            productCount: 5,
            assignedTo: 'staff_1',
        }, {
            staffId: 'mgr_1',
            staffName: 'Manager',
            role: 'manager',
        });
        expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO stock_take_rules'), expect.arrayContaining(['tenant_1', 'Daily shrinkage check', 'active', '08:00', 'low_stock', 5]));
        expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_events'), expect.arrayContaining(['tenant_1', 'stocktake.rule_created', 'stock_take_rule']));
        expect(rule).toMatchObject({ name: 'Daily shrinkage check', productScope: 'low_stock' });
    });
    it('generates due daily spot-check sessions once per day', async () => {
        const conn = mockConnection();
        (dbModule.query as any).mockImplementation((sql: string) => {
            if (sql.includes('SELECT * FROM stock_take_rules')) {
                return Promise.resolve([{
                        id: 'rule_1',
                        tenant_id: 'tenant_1',
                        name: 'Daily low stock check',
                        status: 'active',
                        schedule_type: 'daily',
                        run_time: '00:00',
                        product_scope: 'low_stock',
                        product_count: 1,
                        assigned_to: 'staff_1',
                        assigned_to_name: 'Jess',
                        product_ids: '[]',
                        last_run_for_date: null,
                    }]);
            }
            if (sql.includes('stock <= CASE')) {
                return Promise.resolve([{ id: 'prod_1', name: 'Milk', barcode: '6001', stock: '1', minStock: '5' }]);
            }
            if (sql.includes('FROM products') && sql.includes('id IN')) {
                return Promise.resolve([{ id: 'prod_1', name: 'Milk', barcode: '6001', stock: '1' }]);
            }
            if (sql.includes('FROM staff')) {
                return Promise.resolve([{ id: 'staff_1', name: 'Jess' }]);
            }
            if (sql.includes('UPDATE stock_take_rules'))
                return Promise.resolve({});
            if (sql.includes('INSERT INTO audit_events'))
                return Promise.resolve({});
            if (sql.includes('FROM stock_take_sessions s')) {
                return Promise.resolve([{
                        id: 'session_1',
                        tenantId: 'tenant_1',
                        name: 'Daily low stock check - 2026-05-26',
                        type: 'spot_check',
                        status: 'active',
                        itemCount: '1',
                        countedCount: '0',
                        varianceCount: '0',
                    }]);
            }
            if (sql.includes('FROM stock_take_items')) {
                return Promise.resolve([{
                        id: 'item_1',
                        tenantId: 'tenant_1',
                        sessionId: 'session_1',
                        productId: 'prod_1',
                        productName: 'Milk',
                        expectedQuantity: '1',
                        assignedTo: 'staff_1',
                        assignedToName: 'Jess',
                        status: 'assigned',
                    }]);
            }
            return Promise.resolve([]);
        });
        const result = await runDueStockTakeRules('tenant_1', {
            staffId: 'mgr_1',
            staffName: 'Manager',
            role: 'manager',
        }, {
            now: new Date('2026-05-26T08:00:00.000Z'),
        });
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO stock_take_sessions'), expect.arrayContaining(['tenant_1', 'Daily low stock check - 2026-05-26', 'spot_check']));
        expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE stock_take_rules'), expect.arrayContaining(['2026-05-26', 'tenant_1', 'rule_1']));
        expect(result.generated).toHaveLength(1);
        expect(result.generated[0].session).toMatchObject({ type: 'spot_check' });
    });
    it('ranks spot-check suggestions from shrinkage, expiry, velocity, and variance signals', async () => {
        (dbModule.query as any).mockImplementation((sql: string) => {
            if (sql.includes('FROM products')) {
                return Promise.resolve([
                    { id: 'prod_1', name: 'Milk', barcode: '6001', category: 'Dairy', section: 'Retail', stock: '1', minStock: '5' },
                    { id: 'prod_2', name: 'Bread', barcode: '6002', category: 'Bakery', section: 'Retail', stock: '20', minStock: '5' },
                ]);
            }
            if (sql.includes('FROM stock_movements') && sql.includes("reason_code = 'shrinkage'")) {
                return Promise.resolve([{ productId: 'prod_1', productName: 'Milk', signalQuantity: '3', signalCount: '2' }]);
            }
            if (sql.includes('FROM stock_movements') && sql.includes("reason_code = 'wastage'")) {
                return Promise.resolve([{ productId: 'prod_2', productName: 'Bread', signalQuantity: '1', signalCount: '1' }]);
            }
            if (sql.includes('FROM stock_take_items')) {
                return Promise.resolve([{ productId: 'prod_1', productName: 'Milk', varianceQuantity: '4', varianceCount: '2' }]);
            }
            if (sql.includes('FROM stock_batches')) {
                return Promise.resolve([{ productId: 'prod_2', productName: 'Bread', expiryQuantity: '6', nextExpiryDate: '2026-06-05' }]);
            }
            if (sql.includes('FROM sale_items')) {
                return Promise.resolve([{ productId: 'prod_1', productName: 'Milk', quantitySold: '90', saleCount: '20' }]);
            }
            return Promise.resolve([]);
        });
        const result = await getStockTakeSuggestions('tenant_1', { limit: 5 });
        expect(result.suggestions[0]).toMatchObject({
            productId: 'prod_1',
            riskLevel: 'critical',
        });
        expect(result.suggestions[0].reasons).toEqual(expect.arrayContaining([
            'low_stock',
            'recent_shrinkage',
            'recent_variance',
            'sales_velocity',
        ]));
        expect(result.suggestions.find((item: any) => item.productId === 'prod_2')?.reasons)
            .toEqual(expect.arrayContaining(['recent_wastage', 'expiry_risk']));
    });
    it('approves counted sessions through the stock movement ledger', async () => {
        const conn = mockConnection((sql: string) => {
            if (sql.includes('FROM stock_take_sessions') && sql.includes('FOR UPDATE')) {
                return Promise.resolve([[{ id: 'session_1', name: 'Daily spot', type: 'spot_check', status: 'submitted' }]]);
            }
            if (sql.includes('FROM stock_take_items') && sql.includes('FOR UPDATE')) {
                return Promise.resolve([[
                        {
                            id: 'item_1',
                            productId: 'prod_1',
                            productName: 'Milk',
                            expectedQuantity: 10,
                            countedQuantity: 8,
                            varianceQuantity: -2,
                            status: 'counted',
                        },
                    ]]);
            }
            if (sql.includes('SELECT id, name, stock')) {
                return Promise.resolve([[{ id: 'prod_1', name: 'Milk', stock: 10 }]]);
            }
            return Promise.resolve([[]]);
        });
        (dbModule.query as any).mockImplementation((sql: string) => {
            if (sql.includes('FROM stock_take_sessions s')) {
                return Promise.resolve([{
                        id: 'session_1',
                        tenantId: 'tenant_1',
                        name: 'Daily spot',
                        type: 'spot_check',
                        status: 'approved',
                        itemCount: '1',
                        countedCount: '1',
                        varianceCount: '1',
                    }]);
            }
            if (sql.includes('FROM stock_take_items'))
                return Promise.resolve([]);
            return Promise.resolve([]);
        });
        const result = await approveStockTakeSession('tenant_1', 'session_1', {
            staffId: 'mgr_1',
            staffName: 'Manager',
            role: 'manager',
        });
        expect(conn.beginTransaction).toHaveBeenCalled();
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE products SET stock = $1"), [8, 'tenant_1', 'prod_1']);
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO stock_movements'), expect.arrayContaining(['tenant_1', 'product', 'prod_1', null, 'Milk', -2, 10, 8, 'stock_take']));
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_events'), expect.arrayContaining(['tenant_1', 'stocktake.approved', 'stock_take_session', 'session_1']));
        expect(conn.commit).toHaveBeenCalled();
        expect(result).toMatchObject({ id: 'session_1', status: 'approved', applied: [{ productId: 'prod_1', quantityDelta: -2 }] });
    });
    it('blocks approval when high-risk variances still need a supervisor recount', async () => {
        const conn = mockConnection((sql: string) => {
            if (sql.includes('FROM stock_take_sessions') && sql.includes('FOR UPDATE')) {
                return Promise.resolve([[{ id: 'session_1', name: 'Daily spot', type: 'spot_check', status: 'submitted' }]]);
            }
            if (sql.includes('FROM stock_take_items') && sql.includes('FOR UPDATE')) {
                return Promise.resolve([[{
                            id: 'item_1',
                            productId: 'prod_1',
                            productName: 'Milk',
                            expectedQuantity: 10,
                            countedQuantity: 3,
                            varianceQuantity: -7,
                            varianceReason: 'shrinkage',
                            varianceReasonLabel: 'Shrinkage',
                            supervisorRecountRequired: 1,
                            supervisorRecountAt: null,
                            status: 'counted',
                        }]]);
            }
            return Promise.resolve([[]]);
        });
        await expect(approveStockTakeSession('tenant_1', 'session_1', {
            staffId: 'mgr_1',
            staffName: 'Manager',
            role: 'manager',
        })).rejects.toThrow('Supervisor recount is required');
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
    });
    it('exports stocktake count packs with variance reasons and supervisor gates', async () => {
        (dbModule.query as any).mockImplementation((sql: string) => {
            if (sql.includes('FROM stock_take_sessions s')) {
                return Promise.resolve([{
                        id: 'session_1',
                        tenantId: 'tenant_1',
                        name: 'Daily spot',
                        type: 'spot_check',
                        status: 'submitted',
                        itemCount: '1',
                        countedCount: '1',
                        varianceCount: '1',
                        supervisorRecountCount: '1',
                    }]);
            }
            if (sql.includes('FROM stock_take_items')) {
                return Promise.resolve([{
                        id: 'item_1',
                        tenantId: 'tenant_1',
                        sessionId: 'session_1',
                        productId: 'prod_1',
                        productName: 'Milk',
                        barcode: '6001',
                        expectedQuantity: '10',
                        countedQuantity: '3',
                        varianceQuantity: '-7',
                        varianceReason: 'shrinkage',
                        varianceReasonLabel: 'Shrinkage',
                        varianceSeverity: 'high',
                        supervisorRecountRequired: 1,
                        supervisorRecountAt: null,
                        assignedToName: 'Jess',
                        countedByName: 'Jess',
                        status: 'counted',
                        note: 'Front shelf counted',
                    }]);
            }
            return Promise.resolve([]);
        });
        const pack = await getStockTakeExportPack('tenant_1', 'session_1');
        expect(pack.filename).toContain('daily-spot-session_1-stocktake-export.csv');
        expect(pack.csv).toContain('Variance Reason');
        expect(pack.csv).toContain('Shrinkage');
        expect(pack.csv).toContain('yes');
        expect(pack.varianceReasons).toEqual(expect.arrayContaining([
            expect.objectContaining({ value: 'expiry', stockReasonCode: 'wastage' }),
            expect.objectContaining({ value: 'theft_loss', stockReasonCode: 'shrinkage' }),
        ]));
    });
});
