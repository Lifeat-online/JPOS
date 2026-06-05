import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { recordAuditEventSafe } from '../../server/audit.js';
import { addStaffCoachingNote, getStaffPerformanceReport } from '../../server/staffPerformance.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../server/audit.js', () => ({
  recordAuditEventSafe: vi.fn(),
}));

describe('staff performance report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates sales, refund/void patterns, table turnover, prep-time trends, and coaching history', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM staff_coaching_notes')) {
        return Promise.resolve([{
          id: 'note_1',
          staffId: 'staff_1',
          staffName: 'Jess',
          noteType: 'recognition',
          title: 'Great close',
          note: 'Handled the lunch rush cleanly.',
          source: 'manager',
          createdAt: '2026-06-05T13:00:00Z',
        }]);
      }
      if (sql.includes('FROM ai_staff_scores')) {
        return Promise.resolve([{
          staffId: 'staff_1',
          staffName: 'Jess',
          score: '88',
          grade: 'A',
          strengths: '["Rush ready"]',
          coachingNotes: '["Keep exception notes crisp."]',
          badges: '["Top performer"]',
          riskFlags: '["1 refund/void exception"]',
          source: 'deterministic',
          createdAt: '2026-06-05T12:00:00Z',
        }]);
      }
      if (sql.includes('FROM sale_items')) {
        return Promise.resolve([{
          id: 'item_1',
          staffId: 'staff_1',
          workstationId: 'ws_kitchen',
          orderedAt: '2026-06-05T10:00:00Z',
          acceptedAt: '2026-06-05T10:02:00Z',
          readyAt: '2026-06-05T10:12:00Z',
          deliveredAt: '2026-06-05T10:15:00Z',
        }]);
      }
      if (sql.includes('FROM sales')) {
        return Promise.resolve([
          {
            id: 'sale_1',
            staffId: 'staff_1',
            status: 'completed',
            transactionType: 'sale',
            total: '300.00',
            tipAmount: '15.00',
            tableNumber: 'T1',
            createdAt: '2026-06-05T09:00:00Z',
            updatedAt: '2026-06-05T10:00:00Z',
          },
          {
            id: 'refund_1',
            staffId: 'staff_1',
            refundedBy: 'staff_1',
            status: 'completed',
            transactionType: 'refund',
            total: '-30.00',
            refundStatus: 'full',
            refundedAmount: '30.00',
            refundReason: 'Wrong item',
            createdAt: '2026-06-05T11:00:00Z',
            updatedAt: '2026-06-05T11:00:00Z',
          },
          {
            id: 'void_1',
            staffId: 'staff_2',
            voidedBy: 'staff_2',
            status: 'completed',
            transactionType: 'void',
            total: '100.00',
            voidReason: 'Mistake',
            createdAt: '2026-06-05T12:00:00Z',
            updatedAt: '2026-06-05T12:00:00Z',
          },
          {
            id: 'tab_1',
            staffId: 'staff_1',
            status: 'open',
            transactionType: 'sale',
            total: '90.00',
            isTab: 1,
            tabName: 'Table tab',
            createdAt: '2026-06-05T12:30:00Z',
          },
        ]);
      }
      if (sql.includes('FROM staff')) {
        return Promise.resolve([
          { id: 'staff_1', name: 'Jess', role: 'cashier', status: 'active' },
          { id: 'staff_2', name: 'Mo', role: 'chef', status: 'active' },
        ]);
      }
      return Promise.resolve([]);
    });

    const report = await getStaffPerformanceReport('tenant_1', { startDate: '2026-06-05', endDate: '2026-06-05' });
    const jess = report.staffPerformance.find(row => row.staffId === 'staff_1');
    const mo = report.staffPerformance.find(row => row.staffId === 'staff_2');

    expect(report.summary).toMatchObject({
      staffCount: 2,
      completedSales: 1,
      salesRevenue: 300,
      refundCount: 1,
      voidCount: 1,
      tableTurns: 1,
      workstationItems: 1,
    });
    expect(jess?.sales).toMatchObject({ completedCount: 1, revenue: 300, averageBasket: 300, tipAmount: 15 });
    expect(jess?.exceptions).toMatchObject({ refundCount: 1, refundAmount: 30, refundVoidRate: 100 });
    expect(jess?.tableTurnover).toMatchObject({ tableSaleCount: 1, averageDurationMinutes: 60, openTabCount: 1 });
    expect(jess?.prepTime).toMatchObject({ itemCount: 1, averageAcceptSeconds: 120, averagePrepSeconds: 600, averageTotalSeconds: 900 });
    expect(jess?.coachingHistory.map(note => note.title)).toEqual(expect.arrayContaining(['AI score A', 'Great close']));
    expect(jess?.exceptionInsights.map(insight => insight.title)).toEqual(expect.arrayContaining(['Refund/void pattern', 'Open tab follow-up', 'AI coaching risk flags']));
    expect(mo?.exceptions).toMatchObject({ voidCount: 1, voidAmount: 100 });
    expect(report.csv).toContain('staff_performance');
  });

  it('creates audited staff coaching notes', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id, name FROM staff')) return Promise.resolve([{ id: 'staff_1', name: 'Jess' }]);
      if (sql.includes('INSERT INTO staff_coaching_notes')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const note = await addStaffCoachingNote('tenant_1', {
      staffId: 'staff_1',
      noteType: 'follow_up',
      title: 'Refund review',
      note: 'Review refund reasons before Friday.',
    }, { staffId: 'mgr_1', staffName: 'Manager' });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO staff_coaching_notes'),
      expect.arrayContaining(['tenant_1', 'staff_1', 'Jess', 'follow_up', 'Refund review'])
    );
    expect(note).toMatchObject({ staffId: 'staff_1', staffName: 'Jess', noteType: 'follow_up' });
    expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant_1',
      action: 'staff.coaching_note_created',
      entityType: 'staff',
      entityId: 'staff_1',
      staffId: 'mgr_1',
    }));
  });
});
