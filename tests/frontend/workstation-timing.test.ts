import { describe, expect, it } from 'vitest';
import {
  deriveWorkstationItemTiming,
  formatWorkstationDuration,
  summarizeWorkstationTiming,
} from '../../shared/workstationTiming';

const now = new Date('2026-05-31T12:00:00Z');
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000).toISOString();

describe('workstation item timing', () => {
  it('shows accept and total timers for pending items', () => {
    const timing = deriveWorkstationItemTiming({
      status: 'pending',
      orderedAt: ago(6),
    }, { now });

    expect(timing.activePhase).toBe('accept');
    expect(timing.phaseElapsedSeconds).toBe(360);
    expect(timing.totalElapsedSeconds).toBe(360);
    expect(timing.phaseState).toBe('warning');
    expect(timing.totalState).toBe('ok');
  });

  it('shows prep and total timers for accepted items', () => {
    const timing = deriveWorkstationItemTiming({
      status: 'accepted',
      orderedAt: ago(20),
      acceptedAt: ago(16),
    }, { now });

    expect(timing.activePhase).toBe('prep');
    expect(timing.phaseElapsedSeconds).toBe(960);
    expect(timing.totalElapsedSeconds).toBe(1200);
    expect(timing.phaseState).toBe('warning');
  });

  it('shows handoff and total timers for ready items', () => {
    const timing = deriveWorkstationItemTiming({
      status: 'ready',
      orderedAt: ago(30),
      acceptedAt: ago(25),
      readyAt: ago(11),
    }, { now });

    expect(timing.activePhase).toBe('handoff');
    expect(timing.phaseElapsedSeconds).toBe(660);
    expect(timing.totalElapsedSeconds).toBe(1800);
    expect(timing.phaseState).toBe('critical');
  });

  it('stops active timers for delivered items', () => {
    const timing = deriveWorkstationItemTiming({
      status: 'delivered',
      orderedAt: ago(35),
      acceptedAt: ago(30),
      readyAt: ago(12),
      deliveredAt: ago(4),
    }, { now });

    expect(timing.activePhase).toBeNull();
    expect(timing.phaseElapsedSeconds).toBeNull();
    expect(timing.acceptSeconds).toBe(300);
    expect(timing.prepSeconds).toBe(1080);
    expect(timing.handoffSeconds).toBe(480);
    expect(timing.totalSeconds).toBe(1860);
  });

  it('excludes stale active timers from active-age metrics while counting them separately', () => {
    const summary = summarizeWorkstationTiming([
      { status: 'accepted', orderedAt: ago(10), acceptedAt: ago(5) },
      { status: 'ready', orderedAt: ago(45), acceptedAt: ago(35), readyAt: ago(21) },
      { status: 'delivered', orderedAt: ago(18), acceptedAt: ago(16), readyAt: ago(6), deliveredAt: ago(2) },
    ], { now });

    expect(summary.activeCount).toBe(2);
    expect(summary.staleTimerCount).toBe(1);
    expect(summary.unclosedHandoffCount).toBe(1);
    expect(summary.oldestActiveAgeSeconds).toBe(300);
    expect(summary.activeMedianAgeSeconds).toBe(300);
    expect(summary.activeP90AgeSeconds).toBe(300);
    expect(summary.avgAcceptSeconds).toBe(210);
    expect(summary.avgPrepSeconds).toBe(600);
    expect(summary.avgHandoffSeconds).toBe(240);
    expect(summary.avgTotalSeconds).toBe(960);
  });

  it('formats durations for compact workstation chips', () => {
    expect(formatWorkstationDuration(65)).toBe('1m 05s');
    expect(formatWorkstationDuration(3660)).toBe('1h 1m');
    expect(formatWorkstationDuration(null)).toBe('--');
  });
});
