import { describe, expect, it } from 'vitest';
import { buildDeterministicInsights, buildDeterministicStaffScores } from '../../server/ai.js';

describe('AI manager insights', () => {
  it('uses the newer operations data points added after the V1 copilot', () => {
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000).toISOString();
    const insights = buildDeterministicInsights('tenant_1', {
      products: [{ id: 'prod_1', name: 'Milk', stock: 1, min_stock: 5 }],
      staff: [{ id: 'staff_1', name: 'Jess', status: 'active' }],
      sales: [
        { id: 'sale_1', staff_id: 'staff_1', status: 'completed', total: 240, tip_amount: 10, offline_event_id: 'offline_1', sync_source: 'offline' },
        { id: 'sale_2', staff_id: 'staff_1', status: 'open', total: 120, table_number: 'T1', is_tab: 1, tab_name: 'Lunch' },
      ],
      salePayments: [
        { saleId: 'sale_1', method: 'cash', amount: 100 },
        { saleId: 'sale_1', method: 'wallet', amount: 140 },
      ],
      saleItems: [
        { saleId: 'sale_2', status: 'pending', quantity: 1, workstationId: 'ws_kitchen', orderedAt: minutesAgo(25) },
        {
          saleId: 'sale_3',
          status: 'delivered',
          quantity: 1,
          workstationId: 'ws_kitchen',
          orderedAt: minutesAgo(18),
          acceptedAt: minutesAgo(16),
          readyAt: minutesAgo(6),
          deliveredAt: minutesAgo(2),
        },
      ],
      cashSessions: [{ staff_id: 'staff_1', status: 'closed', review_status: 'submitted', difference: 35 }],
      cashMovements: [],
      managerCashMovements: [{ movement_type: 'petty_cash', direction: 'out', amount: 25 }],
      cashCloseCheckpoints: [{ status: 'review_needed', variance: 15, wallet_liability: 300, pending_payouts: 50 }],
      cashCustodyTransfers: [{ status: 'pending_confirmation', variance: 5 }],
      customers: [{ id: 'cust_1', wallet_balance: 300, account_enabled: 1, account_balance: 120, account_limit: 100 }],
      customerPayoutRequests: [{ amount: 50, status: 'pending' }],
      staffPayoutRequests: [],
      auditEvents: [{
        action: 'offline.sync_conflict',
        staff_id: 'staff_1',
        details: JSON.stringify({ deviceId: 'phone_1', localReceiptNumber: 'REG-001' }),
      }],
      stockMovements: [{ reason_code: 'shrinkage', quantity_delta: -2 }],
      managerTasks: [
        { task_type: 'offline_sync', status: 'open', priority: 'high' },
        { task_type: 'stock_variance', status: 'in_review', priority: 'normal' },
      ],
      stockTakeSessions: [{ status: 'submitted', due_at: '2026-05-01T08:00:00Z' }],
      stockTakeItems: [{ status: 'counted', variance_quantity: -3 }],
      stockTakeRules: [{ status: 'active' }],
      laybyOrders: [{ status: 'active', balance_due: 180, due_date: '2026-05-01' }],
      laybyItems: [{ orderStatus: 'active', reservedQuantity: 2 }],
      purchaseOrders: [{ status: 'sent', expected_delivery_date: '2026-05-01T08:00:00Z' }],
      companionDevices: [{ device_id: 'phone_1' }],
      pushSubscriptions: [{ id: 'push_1', disabled_at: null }],
      business: { isRestaurantMode: true },
      activeRegisters: 1,
    });

    const titles = insights.map((insight) => insight.title);

    expect(titles).toEqual(expect.arrayContaining([
      'Manager action queue',
      'Offline sync health',
      'Stocktake variance watch',
      'Lay-by exposure',
      'Cash control',
    ]));
    expect(insights.find((insight) => insight.title === 'Offline sync health')?.evidence)
      .toEqual(expect.arrayContaining(['Devices in audit details: 1']));
    expect(insights.find((insight) => insight.title === 'Lay-by exposure')?.summary)
      .toContain('R180.00');
    expect(insights.find((insight) => insight.title === 'Restaurant load')?.evidence)
      .toEqual(expect.arrayContaining(['Live avg prep: 600s', 'Live stale timers: 1']));
    expect(insights.find((insight) => insight.title === 'Restaurant load')?.recommendation)
      .toContain('stale workstation timers');
  });
});

describe('AI staff scoring', () => {
  it('produces explainable balanced staff scores without AI provider access', () => {
    const now = new Date('2026-05-18T10:00:00Z');
    const dataset = {
      staff: [
        { id: 'staff_good', name: 'Good Cashier', status: 'active' },
        { id: 'staff_risk', name: 'Risky Cashier', status: 'active' },
      ],
      sales: [
        { staff_id: 'staff_good', status: 'completed', total: 500, tip_amount: 20 },
        { staff_id: 'staff_good', status: 'completed', total: 450, tip_amount: 15 },
        { staff_id: 'staff_risk', status: 'completed', total: 100, tip_amount: 0 },
      ],
      cashSessions: [
        { staff_id: 'staff_good', difference: 0, net_tips: 10, status: 'closed', review_status: 'reviewed' },
        { staff_id: 'staff_risk', difference: 120, net_tips: 0, status: 'open', review_status: 'disputed' },
        { staff_id: 'staff_risk', difference: 0, net_tips: 0, status: 'open', review_status: 'in_progress' },
      ],
    };

    const scores = buildDeterministicStaffScores('tenant_1', dataset, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), now);
    const good = scores.find(score => score.staffId === 'staff_good');
    const risky = scores.find(score => score.staffId === 'staff_risk');

    expect(good).toBeTruthy();
    expect(risky).toBeTruthy();
    expect(good!.score).toBeGreaterThan(risky!.score);
    expect(good!.grade).not.toBe('Needs Attention');
    expect(risky!.riskFlags).toEqual(expect.arrayContaining(['Cash variance R120.00', '1 disputed cash-up', '2 open sessions']));
    expect(good!.coachingNotes.length).toBeGreaterThan(0);
  });

  it('folds Action Center, stocktake, refund/void, and offline signals into coaching', () => {
    const now = new Date('2026-05-30T10:00:00Z');
    const dataset = {
      staff: [{ id: 'staff_ops', name: 'Ops Cashier', status: 'active' }],
      sales: [
        { staff_id: 'staff_ops', status: 'completed', total: 100, refund_status: 'partial', refunded_amount: 20 },
        { staff_id: 'staff_ops', status: 'completed', total: 90, refund_status: 'partial', refunded_amount: 10 },
        { staff_id: 'staff_ops', status: 'completed', total: 80, void_reason: 'mistake' },
      ],
      cashSessions: [{ staff_id: 'staff_ops', difference: 0, net_tips: 0, status: 'closed', review_status: 'reviewed' }],
      cashMovements: [{ staff_id: 'staff_ops', type: 'no_sale', amount: 0 }],
      managerTasks: [{ assigned_to: 'staff_ops', status: 'open', task_type: 'stock_variance' }],
      stockTakeItems: [{ assigned_to: 'staff_ops', counted_by: 'staff_ops', variance_quantity: 8 }],
      auditEvents: [{ staff_id: 'staff_ops', action: 'offline.sync_conflict' }],
    };

    const [score] = buildDeterministicStaffScores('tenant_1', dataset, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), now);

    expect(score.riskFlags).toEqual(expect.arrayContaining([
      '3 refund/void exceptions',
      '1 open assigned task',
      '1 offline sync issue',
      '8.000 stocktake variance units',
    ]));
    expect(score.componentScores).toHaveProperty('taskFollowThrough');
    expect(score.componentScores).toHaveProperty('stockDiscipline');
    expect(score.coachingNotes).toEqual(expect.arrayContaining([
      'Close or reassign open Action Center tasks before the next cash-up.',
    ]));
  });
});
