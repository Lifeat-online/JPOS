import {
  deriveWorkstationItemTiming,
  summarizeWorkstationTiming,
} from "../shared/workstationTiming.js";

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function rowValue(row: any, ...keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

export function buildLiveWorkstationQueueRows(workstations: any[], itemRows: any[], now = new Date()) {
  return workstations.map((workstation) => {
    const rows = itemRows.filter((item) => rowValue(item, "workstationId", "workstation_id") === workstation.id);
    const activeRows = rows.filter((item) => {
      const saleStatus = String(rowValue(item, "saleStatus", "sale_status") || "");
      const status = String(rowValue(item, "status") || "");
      return ["open", "kitchen", "pending"].includes(saleStatus) && ["pending", "accepted", "ready"].includes(status);
    });
    const summary = summarizeWorkstationTiming(rows, { now });
    const activeSummary = summarizeWorkstationTiming(activeRows, { now });
    const oldestActive = activeRows
      .map((item) => deriveWorkstationItemTiming(item, { now }))
      .filter((timing) => timing.activePhaseStartedAt && !timing.isStale)
      .sort((a, b) => (a.activePhaseStartedAt!.getTime() - b.activePhaseStartedAt!.getTime()))[0] || null;

    const pendingCount = activeRows.filter((item) => rowValue(item, "status") === "pending").length;
    const acceptedCount = activeRows.filter((item) => rowValue(item, "status") === "accepted").length;
    const readyCount = activeRows.filter((item) => rowValue(item, "status") === "ready").length;

    return {
      workstationId: String(workstation.id),
      workstationName: String(workstation.name || ""),
      workstationType: String(workstation.type || ""),
      pendingCount,
      acceptedCount,
      readyCount,
      queueCount: pendingCount + acceptedCount,
      oldestOrderedAt: oldestActive?.activePhaseStartedAt || null,
      oldestActiveAt: oldestActive?.activePhaseStartedAt || null,
      oldestAgeSeconds: activeSummary.oldestActiveAgeSeconds,
      oldestActiveAgeSeconds: activeSummary.oldestActiveAgeSeconds,
      activeMedianAgeSeconds: activeSummary.activeMedianAgeSeconds,
      activeP90AgeSeconds: activeSummary.activeP90AgeSeconds,
      staleTimerCount: activeSummary.staleTimerCount,
      unclosedHandoffCount: activeSummary.unclosedHandoffCount,
      avgAcceptSecondsLast2h: toNumber(summary.avgAcceptSeconds),
      avgPrepSecondsLast2h: toNumber(summary.avgPrepSeconds),
      avgHandoffSecondsLast2h: toNumber(summary.avgHandoffSeconds),
      avgTotalSecondsLast2h: toNumber(summary.avgTotalSeconds),
    };
  }).sort((a, b) => (
    b.queueCount - a.queueCount ||
    b.readyCount - a.readyCount ||
    a.workstationName.localeCompare(b.workstationName)
  ));
}
