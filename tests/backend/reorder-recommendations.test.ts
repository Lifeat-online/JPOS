import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import * as auditModule from '../../server/audit.js';
import * as crudModule from '../../server/db-crud.js';
import { approveReorderRecommendation, createReorderNotificationRule, refreshReorderRecommendations, runReorderNotificationRule, } from '../../server/reorderRecommendations.js';
vi.mock('../../server/db.js', () => ({
    query: vi.fn(),
}));
vi.mock('../../server/audit.js', () => ({
    recordAuditEvent: vi.fn(),
}));
vi.mock('../../server/db-crud.js', () => ({
    createPurchaseOrder: vi.fn(),
}));
describe('reorder recommendations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (auditModule.recordAuditEvent as any).mockResolvedValue('audit_1');
    });
    it('persists low-stock recommendations with velocity-aware reorder quantities', async () => {
        (dbModule.query as any).mockImplementation((sql: string) => {
            if (sql.includes('FROM products p')) {
                return Promise.resolve([
                    { id: 'prod_1', name: 'Milk', category: 'Dairy', section: 'Retail', stock: '1', minStock: '5', costPrice: '10', price: '15' },
                ]);
            }
            if (sql.includes('FROM sale_items')) {
                return Promise.resolve([{ productId: 'prod_1', productName: 'Milk', quantitySold: '90', saleCount: '18' }]);
            }
            if (sql.includes('SELECT *') && sql.includes('FROM reorder_recommendations')) {
                return Promise.resolve([]);
            }
            if (sql.includes('INSERT INTO reorder_recommendations')) {
                return Promise.resolve({});
            }
            if (sql.includes('FROM reorder_recommendations')) {
                return Promise.resolve([
                    {
                        id: 'reorder_1',
                        tenantId: 'tenant_1',
                        productId: 'prod_1',
                        productName: 'Milk',
                        status: 'open',
                        priority: 'high',
                        currentStock: '1',
                        minStock: '5',
                        targetStock: '19',
                        recommendedQuantity: '18',
                        estimatedUnitCost: '10',
                        estimatedTotalCost: '180',
                        avgDailySales: '1',
                        daysOfCover: '14',
                        evidence: '["Current stock 1 against minimum 5"]',
                    },
                ]);
            }
            return Promise.resolve([]);
        });
        const result = await refreshReorderRecommendations('tenant_1', {
            staffId: 'mgr_1',
            staffName: 'Manager',
            daysOfCover: 14,
        });
        expect(result.created).toBe(1);
        expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO reorder_recommendations'), expect.arrayContaining(['tenant_1', 'prod_1', 'Milk', 'high', 1, 5, 19, 18, 10, 180, 1, 14]));
        expect(result.recommendations[0]).toMatchObject({
            productId: 'prod_1',
            recommendedQuantity: 18,
            estimatedTotalCost: 180,
        });
    });
    it('approves a recommendation by creating a draft purchase order and closing the recommendation', async () => {
        (crudModule.createPurchaseOrder as any).mockResolvedValue({ id: 'po_1', status: 'draft' });
        (dbModule.query as any).mockImplementation((sql: string) => {
            if (sql.includes('SELECT *') && sql.includes('FROM reorder_recommendations')) {
                return Promise.resolve([
                    {
                        id: 'reorder_1',
                        tenant_id: 'tenant_1',
                        product_id: 'prod_1',
                        product_name: 'Milk',
                        status: sql.includes('LIMIT 1') ? 'open' : 'ordered',
                        priority: 'high',
                        current_stock: '1',
                        min_stock: '5',
                        target_stock: '10',
                        recommended_quantity: '9',
                        estimated_unit_cost: '10',
                        estimated_total_cost: '90',
                        avg_daily_sales: '0',
                        days_of_cover: '14',
                        evidence: '[]',
                    },
                ]);
            }
            if (sql.includes('UPDATE reorder_recommendations'))
                return Promise.resolve({});
            return Promise.resolve([]);
        });
        const result = await approveReorderRecommendation('tenant_1', 'reorder_1', {
            staffId: 'mgr_1',
            staffName: 'Manager',
            note: 'Approved',
        });
        expect(crudModule.createPurchaseOrder).toHaveBeenCalledWith('tenant_1', expect.objectContaining({
            status: 'draft',
            type: 'once_off',
            totalAmount: 90,
            items: [expect.objectContaining({
                    productId: 'prod_1',
                    productName: 'Milk',
                    quantity: 9,
                    expectedPrice: 10,
                    sourceRecommendationId: 'reorder_1',
                })],
        }));
        expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining("SET status = 'ordered'"), expect.arrayContaining(['po_1', 9, 10, 90, 'mgr_1', 'Manager', 'tenant_1', 'reorder_1']));
        expect(result.purchaseOrder).toMatchObject({ id: 'po_1' });
    });
    it('creates auditable reorder notification rules by location', async () => {
        (dbModule.query as any).mockImplementation((sql: string) => {
            if (sql.includes('INSERT INTO reorder_notification_rules'))
                return Promise.resolve({});
            if (sql.includes('FROM reorder_notification_rules')) {
                return Promise.resolve([{
                        id: 'rule_1',
                        tenant_id: 'tenant_1',
                        name: 'Branch cooler watch',
                        status: 'active',
                        location_id: 'branch_1',
                        trigger_type: 'days_cover',
                        priority: 'high',
                        days_of_cover: '21',
                        vendor_id: 'vendor_1',
                        notify_roles: '["manager","owner"]',
                        last_result: '{}',
                    }]);
            }
            return Promise.resolve([]);
        });
        const result = await createReorderNotificationRule('tenant_1', {
            name: 'Branch cooler watch',
            locationId: 'branch_1',
            triggerType: 'days_cover',
            priority: 'high',
            daysOfCover: 21,
            vendorId: 'vendor_1',
            notifyRoles: ['manager', 'owner'],
            staffId: 'mgr_1',
            staffName: 'Manager',
        });
        expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO reorder_notification_rules'), expect.arrayContaining(['tenant_1', 'Branch cooler watch', 'active', 'branch_1', 'days_cover', 'high', 21, 'vendor_1']));
        expect(auditModule.recordAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            action: 'reorder_notification_rule.created',
            entityType: 'reorder_notification_rule',
            staffId: 'mgr_1',
        }));
        expect(result).toMatchObject({ id: 'rule_1', locationId: 'branch_1', triggerType: 'days_cover' });
    });
    it('runs location-specific reorder rules into purchase-order suggestions', async () => {
        let ruleReads = 0;
        (dbModule.query as any).mockImplementation((sql: string, params: any[] = []) => {
            if (sql.includes('FROM reorder_notification_rules')) {
                ruleReads += 1;
                return Promise.resolve([{
                        id: 'rule_1',
                        tenant_id: 'tenant_1',
                        name: 'Branch cooler watch',
                        status: 'active',
                        location_id: 'branch_1',
                        trigger_type: 'days_cover',
                        priority: 'high',
                        days_of_cover: '14',
                        vendor_id: 'vendor_1',
                        notify_roles: '["manager"]',
                        last_result: ruleReads > 1 ? '{"created":1,"updated":0,"locationId":"branch_1"}' : '{}',
                    }]);
            }
            if (sql.includes('FROM products p')) {
                expect(sql).toContain("COALESCE(pls.location_id, $1) = $2");
                expect(params).toEqual(expect.arrayContaining(['branch_1']));
                return Promise.resolve([
                    {
                        id: 'prod_1',
                        name: 'Milk',
                        category: 'Dairy',
                        section: 'Retail',
                        stock: '8',
                        minStock: '5',
                        costPrice: '10',
                        price: '15',
                        locationId: 'branch_1',
                        locationName: 'Branch 1',
                    },
                ]);
            }
            if (sql.includes('FROM sale_items')) {
                return Promise.resolve([{ productId: 'prod_1', productName: 'Milk', quantitySold: '90', saleCount: '18' }]);
            }
            if (sql.includes('SELECT *') && sql.includes('FROM reorder_recommendations')) {
                return Promise.resolve([]);
            }
            if (sql.includes('INSERT INTO reorder_recommendations')) {
                return Promise.resolve({});
            }
            if (sql.includes('UPDATE reorder_notification_rules')) {
                return Promise.resolve({});
            }
            if (sql.includes('FROM reorder_recommendations')) {
                return Promise.resolve([{
                        id: 'reorder_1',
                        tenant_id: 'tenant_1',
                        product_id: 'prod_1',
                        product_name: 'Milk',
                        status: 'open',
                        priority: 'high',
                        current_stock: '8',
                        min_stock: '5',
                        target_stock: '19',
                        recommended_quantity: '11',
                        estimated_unit_cost: '10',
                        estimated_total_cost: '110',
                        avg_daily_sales: '1',
                        days_of_cover: '14',
                        vendor_id: 'vendor_1',
                        location_id: 'branch_1',
                        source: 'reorder_rule',
                        evidence: '["Rule: Branch cooler watch","Location: Branch 1"]',
                    }]);
            }
            return Promise.resolve([]);
        });
        const result = await runReorderNotificationRule('tenant_1', 'rule_1', {
            staffId: 'mgr_1',
            staffName: 'Manager',
        });
        expect(result.result.created).toBe(1);
        expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO reorder_recommendations'), expect.arrayContaining(['vendor_1', 'branch_1', 'reorder_rule']));
        expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining("last_result = $1"), expect.arrayContaining(['tenant_1', 'rule_1']));
        expect(auditModule.recordAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            action: 'reorder_notification_rule.ran',
            entityId: 'rule_1',
            details: expect.objectContaining({ locationId: 'branch_1', created: 1 }),
        }));
        expect(result.result.recommendations[0]).toMatchObject({
            productId: 'prod_1',
            source: 'reorder_rule',
            locationId: 'branch_1',
            recommendedQuantity: 11,
        });
    });
});
