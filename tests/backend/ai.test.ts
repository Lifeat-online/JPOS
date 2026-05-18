import { describe, expect, it } from 'vitest';
import { buildDeterministicStaffScores } from '../../server/ai.js';

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
});
