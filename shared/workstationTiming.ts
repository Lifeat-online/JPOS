export type WorkstationTimerPhase = 'accept' | 'prep' | 'handoff' | 'total';
export type WorkstationTimerState = 'idle' | 'ok' | 'warning' | 'critical' | 'stale';

export type WorkstationTimerThresholds = Record<WorkstationTimerPhase, {
  warningSeconds: number;
  criticalSeconds: number;
}>;

export const WORKSTATION_TIMER_STALE_BUFFER_SECONDS = 10 * 60;

export const DEFAULT_WORKSTATION_TIMER_THRESHOLDS: WorkstationTimerThresholds = {
  accept: { warningSeconds: 5 * 60, criticalSeconds: 10 * 60 },
  prep: { warningSeconds: 15 * 60, criticalSeconds: 25 * 60 },
  handoff: { warningSeconds: 5 * 60, criticalSeconds: 10 * 60 },
  total: { warningSeconds: 25 * 60, criticalSeconds: 40 * 60 },
};

export type WorkstationTimingInput = {
  status?: string | null;
  orderedAt?: unknown;
  ordered_at?: unknown;
  acceptedAt?: unknown;
  accepted_at?: unknown;
  readyAt?: unknown;
  ready_at?: unknown;
  deliveredAt?: unknown;
  delivered_at?: unknown;
};

export type WorkstationItemTiming = {
  status: string;
  orderedAt: Date | null;
  acceptedAt: Date | null;
  readyAt: Date | null;
  deliveredAt: Date | null;
  activePhase: Exclude<WorkstationTimerPhase, 'total'> | null;
  activePhaseStartedAt: Date | null;
  phaseElapsedSeconds: number | null;
  totalElapsedSeconds: number | null;
  phaseState: WorkstationTimerState;
  totalState: WorkstationTimerState;
  isStale: boolean;
  acceptSeconds: number | null;
  prepSeconds: number | null;
  handoffSeconds: number | null;
  totalSeconds: number | null;
};

export type WorkstationTimingSummary = {
  activeCount: number;
  activeMedianAgeSeconds: number;
  activeP90AgeSeconds: number;
  oldestActiveAgeSeconds: number;
  staleTimerCount: number;
  unclosedHandoffCount: number;
  avgAcceptSeconds: number;
  avgPrepSeconds: number;
  avgHandoffSeconds: number;
  avgTotalSeconds: number;
  acceptSampleCount: number;
  prepSampleCount: number;
  handoffSampleCount: number;
  totalSampleCount: number;
};

function valueOf(row: WorkstationTimingInput, camel: keyof WorkstationTimingInput, snake: keyof WorkstationTimingInput) {
  const direct = row[camel];
  return direct !== undefined && direct !== null && direct !== '' ? direct : row[snake];
}

export function toWorkstationDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function secondsBetween(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

export function workstationPhaseForStatus(status: unknown): Exclude<WorkstationTimerPhase, 'total'> | null {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'pending') return 'accept';
  if (normalized === 'accepted') return 'prep';
  if (normalized === 'ready') return 'handoff';
  return null;
}

export function workstationTimerState(
  phase: WorkstationTimerPhase,
  seconds: number | null,
  thresholds: WorkstationTimerThresholds = DEFAULT_WORKSTATION_TIMER_THRESHOLDS
): WorkstationTimerState {
  if (seconds === null) return 'idle';
  const threshold = thresholds[phase];
  if (seconds >= threshold.criticalSeconds + WORKSTATION_TIMER_STALE_BUFFER_SECONDS) return 'stale';
  if (seconds >= threshold.criticalSeconds) return 'critical';
  if (seconds >= threshold.warningSeconds) return 'warning';
  return 'ok';
}

export function deriveWorkstationItemTiming(
  row: WorkstationTimingInput,
  options: { now?: Date; thresholds?: WorkstationTimerThresholds } = {}
): WorkstationItemTiming {
  const now = options.now || new Date();
  const thresholds = options.thresholds || DEFAULT_WORKSTATION_TIMER_THRESHOLDS;
  const status = String(row.status || '').toLowerCase();
  const orderedAt = toWorkstationDate(valueOf(row, 'orderedAt', 'ordered_at'));
  const acceptedAt = toWorkstationDate(valueOf(row, 'acceptedAt', 'accepted_at'));
  const readyAt = toWorkstationDate(valueOf(row, 'readyAt', 'ready_at'));
  const deliveredAt = toWorkstationDate(valueOf(row, 'deliveredAt', 'delivered_at'));
  const activePhase = workstationPhaseForStatus(status);
  const activePhaseStartedAt = activePhase === 'accept'
    ? orderedAt
    : activePhase === 'prep'
      ? acceptedAt
      : activePhase === 'handoff'
        ? readyAt
        : null;
  const phaseElapsedSeconds = activePhaseStartedAt ? secondsBetween(activePhaseStartedAt, now) : null;
  const totalElapsedSeconds = orderedAt ? secondsBetween(orderedAt, deliveredAt || now) : null;
  const phaseState = activePhase
    ? workstationTimerState(activePhase, phaseElapsedSeconds, thresholds)
    : 'idle';
  const totalState = workstationTimerState('total', totalElapsedSeconds, thresholds);

  return {
    status,
    orderedAt,
    acceptedAt,
    readyAt,
    deliveredAt,
    activePhase,
    activePhaseStartedAt,
    phaseElapsedSeconds,
    totalElapsedSeconds,
    phaseState,
    totalState,
    isStale: phaseState === 'stale',
    acceptSeconds: secondsBetween(orderedAt, acceptedAt),
    prepSeconds: secondsBetween(acceptedAt, readyAt),
    handoffSeconds: secondsBetween(readyAt, deliveredAt),
    totalSeconds: secondsBetween(orderedAt, deliveredAt),
  };
}

function average(values: Array<number | null>) {
  const clean = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (clean.length === 0) return 0;
  return Math.round(clean.reduce((sum, value) => sum + value, 0) / clean.length);
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
  return sorted[idx];
}

function happenedSince(date: Date | null, since: Date) {
  return Boolean(date && date.getTime() >= since.getTime());
}

export function summarizeWorkstationTiming(
  rows: WorkstationTimingInput[],
  options: {
    now?: Date;
    thresholds?: WorkstationTimerThresholds;
    completedWindowSeconds?: number;
  } = {}
): WorkstationTimingSummary {
  const now = options.now || new Date();
  const completedWindowSeconds = options.completedWindowSeconds ?? 2 * 60 * 60;
  const since = new Date(now.getTime() - completedWindowSeconds * 1000);
  const timings = rows.map((row) => deriveWorkstationItemTiming(row, { now, thresholds: options.thresholds }));
  const active = timings.filter((timing) => timing.activePhase && timing.phaseElapsedSeconds !== null);
  const nonStaleActive = active.filter((timing) => !timing.isStale);
  const activeAges = nonStaleActive.map((timing) => timing.phaseElapsedSeconds || 0);
  const averageCandidates = timings.filter((timing) => !(timing.activePhase && timing.isStale));
  const acceptSamples = averageCandidates.filter((timing) => happenedSince(timing.acceptedAt, since)).map((timing) => timing.acceptSeconds);
  const prepSamples = averageCandidates.filter((timing) => happenedSince(timing.readyAt, since)).map((timing) => timing.prepSeconds);
  const handoffSamples = averageCandidates.filter((timing) => happenedSince(timing.deliveredAt, since)).map((timing) => timing.handoffSeconds);
  const totalSamples = averageCandidates.filter((timing) => happenedSince(timing.deliveredAt, since)).map((timing) => timing.totalSeconds);

  return {
    activeCount: active.length,
    activeMedianAgeSeconds: percentile(activeAges, 50),
    activeP90AgeSeconds: percentile(activeAges, 90),
    oldestActiveAgeSeconds: activeAges.length ? Math.max(...activeAges) : 0,
    staleTimerCount: active.filter((timing) => timing.isStale).length,
    unclosedHandoffCount: active.filter((timing) => timing.activePhase === 'handoff' && timing.isStale).length,
    avgAcceptSeconds: average(acceptSamples),
    avgPrepSeconds: average(prepSamples),
    avgHandoffSeconds: average(handoffSamples),
    avgTotalSeconds: average(totalSamples),
    acceptSampleCount: acceptSamples.filter((value): value is number => value !== null).length,
    prepSampleCount: prepSamples.filter((value): value is number => value !== null).length,
    handoffSampleCount: handoffSamples.filter((value): value is number => value !== null).length,
    totalSampleCount: totalSamples.filter((value): value is number => value !== null).length,
  };
}

export function formatWorkstationDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '--';
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  if (minutes < 60) return `${minutes}m ${String(remainder).padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
