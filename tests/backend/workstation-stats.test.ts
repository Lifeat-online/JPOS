import { describe, expect, it } from 'vitest';
import { buildLiveWorkstationQueueRows } from '../../server/workstationStats';

const now = new Date('2026-05-31T12:00:00Z');
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000).toISOString();

describe('live workstation stats', () => {
  it('calculates shared timer metrics for workstation queues', () => {
    const [kitchen] = buildLiveWorkstationQueueRows(
      [
        { id: 'ws_kitchen', name: 'Kitchen', type: 'kitchen' },
        { id: 'ws_bar', name: 'Bar', type: 'bar' },
      ],
      [
        {
          workstationId: 'ws_kitchen',
          saleStatus: 'kitchen',
          status: 'pending',
          orderedAt: ago(4),
        },
        {
          workstationId: 'ws_kitchen',
          saleStatus: 'kitchen',
          status: 'accepted',
          orderedAt: ago(10),
          acceptedAt: ago(3),
        },
        {
          workstationId: 'ws_kitchen',
          saleStatus: 'kitchen',
          status: 'ready',
          orderedAt: ago(30),
          acceptedAt: ago(20),
          readyAt: ago(21),
        },
        {
          workstationId: 'ws_kitchen',
          saleStatus: 'completed',
          status: 'delivered',
          orderedAt: ago(20),
          acceptedAt: ago(18),
          readyAt: ago(8),
          deliveredAt: ago(2),
        },
      ],
      now
    );

    expect(kitchen).toMatchObject({
      workstationId: 'ws_kitchen',
      pendingCount: 1,
      acceptedCount: 1,
      readyCount: 1,
      queueCount: 2,
      oldestActiveAgeSeconds: 240,
      activeMedianAgeSeconds: 180,
      activeP90AgeSeconds: 240,
      staleTimerCount: 1,
      unclosedHandoffCount: 1,
      avgAcceptSecondsLast2h: 270,
      avgPrepSecondsLast2h: 600,
      avgHandoffSecondsLast2h: 360,
      avgTotalSecondsLast2h: 1080,
    });
  });

  it('sorts active workstations by actionable queue load before ready-only items', () => {
    const rows = buildLiveWorkstationQueueRows(
      [
        { id: 'ws_bar', name: 'Bar', type: 'bar' },
        { id: 'ws_kitchen', name: 'Kitchen', type: 'kitchen' },
      ],
      [
        { workstationId: 'ws_bar', saleStatus: 'kitchen', status: 'ready', orderedAt: ago(10), readyAt: ago(2) },
        { workstationId: 'ws_kitchen', saleStatus: 'kitchen', status: 'pending', orderedAt: ago(1) },
      ],
      now
    );

    expect(rows.map(row => row.workstationId)).toEqual(['ws_kitchen', 'ws_bar']);
  });
});
