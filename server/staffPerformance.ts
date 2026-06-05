import { query } from "./db.js";
import { recordAuditEventSafe } from "./audit.js";

type Actor = {
  staffId?: string | null;
  staffName?: string | null;
};

type StaffPerformanceFilters = {
  startDate?: string | null;
  endDate?: string | null;
  staffId?: string | null;
};

type CoachingNoteInput = {
  staffId?: string;
  title?: string;
  note?: string;
  noteType?: string;
  source?: string;
};

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function money(value: unknown) {
  return Number(toNumber(value).toFixed(2));
}

function parseDate(value: unknown, fallback: Date, endOfDay = false) {
  const text = clean(value);
  if (!text) return fallback;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
    : new Date(text);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setUTCHours(23, 59, 59, 999);
  return next;
}

function sqlTimestamp(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function dateLabel(date: Date) {
  return date.toISOString().slice(0, 10);
}

function resolveRange(filters: StaffPerformanceFilters = {}) {
  const now = new Date();
  let from = parseDate(filters.startDate, startOfMonth(now));
  let to = parseDate(filters.endDate, endOfDay(now), true);
  if (from > to) {
    const oldFrom = from;
    from = parseDate(filters.endDate, startOfMonth(now));
    to = endOfDay(oldFrom);
  }
  return {
    from,
    to,
    fromSql: sqlTimestamp(from),
    toSql: sqlTimestamp(to),
    fromDate: dateLabel(from),
    toDate: dateLabel(to),
    label: `${dateLabel(from)} to ${dateLabel(to)}`,
  };
}

function secondsBetween(start: unknown, end: unknown) {
  const started = new Date(start as any);
  const ended = new Date(end as any);
  if (Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime())) return null;
  return Math.max(0, Math.round((ended.getTime() - started.getTime()) / 1000));
}

function minutesBetween(start: unknown, end: unknown) {
  const seconds = secondsBetween(start, end);
  return seconds === null ? null : Math.round(seconds / 60);
}

function average(total: number, count: number) {
  return count > 0 ? Number((total / count).toFixed(2)) : 0;
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function noteFromRow(row: any) {
  return {
    id: row.id,
    staffId: row.staffId ?? row.staff_id,
    staffName: row.staffName ?? row.staff_name,
    noteType: row.noteType ?? row.note_type ?? "coaching",
    title: row.title,
    note: row.note,
    source: row.source || "manager",
    createdBy: row.createdBy ?? row.created_by ?? null,
    createdByName: row.createdByName ?? row.created_by_name ?? null,
    createdAt: row.createdAt ?? row.created_at ?? null,
  };
}

function emptyStaffRow(staff: any) {
  const staffId = String(staff.id);
  return {
    staffId,
    staffName: String(staff.name || staffId),
    role: String(staff.role || ""),
    status: String(staff.status || "active"),
    sales: {
      completedCount: 0,
      revenue: 0,
      averageBasket: 0,
      tipAmount: 0,
      salesPerShift: 0,
    },
    exceptions: {
      refundCount: 0,
      refundAmount: 0,
      voidCount: 0,
      voidAmount: 0,
      refundVoidRate: 0,
      topReasons: [] as Array<{ reason: string; count: number }>,
    },
    tableTurnover: {
      tableSaleCount: 0,
      revenue: 0,
      averageCheck: 0,
      averageDurationMinutes: 0,
      openTabCount: 0,
    },
    prepTime: {
      itemCount: 0,
      averageAcceptSeconds: 0,
      averagePrepSeconds: 0,
      averageHandoffSeconds: 0,
      averageTotalSeconds: 0,
      stalePrepCount: 0,
    },
    coachingHistory: [] as any[],
    exceptionInsights: [] as any[],
    aiScore: null as any,
    _saleCount: 0,
    _tableDurationTotal: 0,
    _tableDurationCount: 0,
    _acceptTotal: 0,
    _acceptCount: 0,
    _prepTotal: 0,
    _prepCount: 0,
    _handoffTotal: 0,
    _handoffCount: 0,
    _totalPrepTotal: 0,
    _totalPrepCount: 0,
    _reasons: new Map<string, number>(),
  };
}

function addReason(row: ReturnType<typeof emptyStaffRow>, reason: unknown) {
  const label = clean(reason) || "No reason captured";
  row._reasons.set(label, (row._reasons.get(label) || 0) + 1);
}

function finalizeStaffRow(row: ReturnType<typeof emptyStaffRow>) {
  row.sales.revenue = money(row.sales.revenue);
  row.sales.tipAmount = money(row.sales.tipAmount);
  row.sales.averageBasket = average(row.sales.revenue, row.sales.completedCount);
  row.exceptions.refundAmount = money(row.exceptions.refundAmount);
  row.exceptions.voidAmount = money(row.exceptions.voidAmount);
  row.exceptions.refundVoidRate = row.sales.completedCount > 0
    ? Number((((row.exceptions.refundCount + row.exceptions.voidCount) / row.sales.completedCount) * 100).toFixed(2))
    : 0;
  row.exceptions.topReasons = [...row._reasons.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 5);
  row.tableTurnover.revenue = money(row.tableTurnover.revenue);
  row.tableTurnover.averageCheck = average(row.tableTurnover.revenue, row.tableTurnover.tableSaleCount);
  row.tableTurnover.averageDurationMinutes = row._tableDurationCount > 0
    ? Math.round(row._tableDurationTotal / row._tableDurationCount)
    : 0;
  row.prepTime.averageAcceptSeconds = average(row._acceptTotal, row._acceptCount);
  row.prepTime.averagePrepSeconds = average(row._prepTotal, row._prepCount);
  row.prepTime.averageHandoffSeconds = average(row._handoffTotal, row._handoffCount);
  row.prepTime.averageTotalSeconds = average(row._totalPrepTotal, row._totalPrepCount);
  delete (row as any)._saleCount;
  delete (row as any)._tableDurationTotal;
  delete (row as any)._tableDurationCount;
  delete (row as any)._acceptTotal;
  delete (row as any)._acceptCount;
  delete (row as any)._prepTotal;
  delete (row as any)._prepCount;
  delete (row as any)._handoffTotal;
  delete (row as any)._handoffCount;
  delete (row as any)._totalPrepTotal;
  delete (row as any)._totalPrepCount;
  delete (row as any)._reasons;
  return row;
}

function buildExceptionInsights(row: ReturnType<typeof emptyStaffRow>) {
  const insights: any[] = [];
  const refundVoidCount = row.exceptions.refundCount + row.exceptions.voidCount;
  if (refundVoidCount > 0) {
    insights.push({
      severity: refundVoidCount >= 3 || row.exceptions.refundVoidRate >= 15 ? "warning" : "info",
      title: "Refund/void pattern",
      detail: `${refundVoidCount} refund/void exception${refundVoidCount === 1 ? "" : "s"} across ${row.sales.completedCount} completed sale${row.sales.completedCount === 1 ? "" : "s"}.`,
      evidence: [
        `Refunds: ${row.exceptions.refundCount}`,
        `Voids: ${row.exceptions.voidCount}`,
        `Exception rate: ${row.exceptions.refundVoidRate}%`,
      ],
    });
  }
  if (row.tableTurnover.averageDurationMinutes >= 90) {
    insights.push({
      severity: "info",
      title: "Table pace coaching",
      detail: `${row.staffName} averages ${row.tableTurnover.averageDurationMinutes} minutes on table-linked sales.`,
      evidence: [`Table turns: ${row.tableTurnover.tableSaleCount}`, `Revenue: R${row.tableTurnover.revenue.toFixed(2)}`],
    });
  }
  if (row.prepTime.averagePrepSeconds >= 900 || row.prepTime.stalePrepCount > 0) {
    insights.push({
      severity: row.prepTime.stalePrepCount > 0 ? "warning" : "info",
      title: "Prep-time trend",
      detail: `${row.prepTime.itemCount} workstation item${row.prepTime.itemCount === 1 ? "" : "s"} average ${row.prepTime.averagePrepSeconds}s prep time.`,
      evidence: [`Stale prep items: ${row.prepTime.stalePrepCount}`, `Average total: ${row.prepTime.averageTotalSeconds}s`],
    });
  }
  if (row.tableTurnover.openTabCount > 0) {
    insights.push({
      severity: "info",
      title: "Open tab follow-up",
      detail: `${row.tableTurnover.openTabCount} open table/tab order${row.tableTurnover.openTabCount === 1 ? "" : "s"} are attributed to this staff member.`,
      evidence: ["Close or transfer tabs before cash-up."],
    });
  }
  const riskFlags = Array.isArray(row.aiScore?.riskFlags) ? row.aiScore.riskFlags : [];
  if (riskFlags.length > 0) {
    insights.push({
      severity: "warning",
      title: "AI coaching risk flags",
      detail: riskFlags.slice(0, 2).join("; "),
      evidence: riskFlags.slice(0, 4),
    });
  }
  if (!insights.length && row.sales.completedCount > 0) {
    insights.push({
      severity: "success",
      title: "Clean exception trail",
      detail: "No refund, void, stale prep, or open-tab exception patterns were found in this period.",
      evidence: [`Completed sales: ${row.sales.completedCount}`],
    });
  }
  return insights;
}

export async function addStaffCoachingNote(tenantId: string, input: CoachingNoteInput, actor: Actor = {}) {
  const staffId = clean(input.staffId);
  const title = clean(input.title);
  const note = clean(input.note);
  if (!staffId) throw new Error("Staff member is required.");
  if (!title) throw new Error("Coaching title is required.");
  if (!note) throw new Error("Coaching note is required.");
  const noteType = ["coaching", "recognition", "warning", "follow_up"].includes(clean(input.noteType))
    ? clean(input.noteType)
    : "coaching";
  const source = ["manager", "ai", "performance"].includes(clean(input.source))
    ? clean(input.source)
    : "manager";
  const staffRows = await query<any>(
    `SELECT id, name FROM staff WHERE tenant_id = ? AND id = ? LIMIT 1`,
    [tenantId, staffId],
  );
  const staff = staffRows[0];
  if (!staff) throw new Error("Staff member not found.");
  const noteId = id("coach");
  await query(
    `INSERT INTO staff_coaching_notes (
      id, tenant_id, staff_id, staff_name, note_type, title, note, source,
      created_by, created_by_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      noteId,
      tenantId,
      staffId,
      staff.name,
      noteType,
      title,
      note,
      source,
      actor.staffId || null,
      actor.staffName || null,
    ],
  );
  await recordAuditEventSafe({
    tenantId,
    action: "staff.coaching_note_created",
    entityType: "staff",
    entityId: staffId,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    source: "workforce",
    details: { noteId, noteType, source, title },
  });
  return {
    id: noteId,
    staffId,
    staffName: staff.name,
    noteType,
    title,
    note,
    source,
    createdBy: actor.staffId || null,
    createdByName: actor.staffName || null,
    createdAt: new Date().toISOString(),
  };
}

export async function getStaffPerformanceReport(tenantId: string, filters: StaffPerformanceFilters = {}) {
  const range = resolveRange(filters);
  const staffParams: any[] = [tenantId];
  const staffWhere = ["tenant_id = ?"];
  if (filters.staffId) {
    staffWhere.push("id = ?");
    staffParams.push(filters.staffId);
  }
  const staffRows = await query<any>(
    `SELECT id, name, role, status
       FROM staff
      WHERE ${staffWhere.join(" AND ")}
      ORDER BY name ASC`,
    staffParams,
  );
  const rowsByStaff = new Map<string, ReturnType<typeof emptyStaffRow>>();
  for (const staff of staffRows) rowsByStaff.set(String(staff.id), emptyStaffRow(staff));

  const rangeParams: any[] = [tenantId, range.fromSql, range.toSql];
  const scopedStaffFilter = filters.staffId ? "AND (staff_id = ? OR refunded_by = ? OR voided_by = ?)" : "";
  if (filters.staffId) rangeParams.push(filters.staffId, filters.staffId, filters.staffId);
  const sales = await query<any>(
    `SELECT
        id,
        staff_id AS staffId,
        total,
        tip_amount AS tipAmount,
        status,
        COALESCE(transaction_type, 'sale') AS transactionType,
        refund_status AS refundStatus,
        refunded_amount AS refundedAmount,
        refund_reason AS refundReason,
        refunded_by AS refundedBy,
        void_reason AS voidReason,
        voided_by AS voidedBy,
        table_number AS tableNumber,
        is_tab AS isTab,
        tab_name AS tabName,
        created_at AS createdAt,
        updated_at AS updatedAt
       FROM sales
      WHERE tenant_id = ?
        AND created_at >= ?
        AND created_at <= ?
        ${scopedStaffFilter}
      ORDER BY created_at ASC`,
    rangeParams,
  );

  for (const sale of sales) {
    const staffId = sale.staffId ?? sale.staff_id;
    const row = rowsByStaff.get(String(staffId));
    const status = String(sale.status || "");
    const transactionType = String(sale.transactionType ?? sale.transaction_type ?? "sale");
    const isCompletedSale = status === "completed" && transactionType === "sale";
    if (row && isCompletedSale) {
      row.sales.completedCount += 1;
      row.sales.revenue += toNumber(sale.total);
      row.sales.tipAmount += toNumber(sale.tipAmount ?? sale.tip_amount);
      const tableNumber = clean(sale.tableNumber ?? sale.table_number);
      if (tableNumber) {
        row.tableTurnover.tableSaleCount += 1;
        row.tableTurnover.revenue += toNumber(sale.total);
        const duration = minutesBetween(sale.createdAt ?? sale.created_at, sale.updatedAt ?? sale.updated_at);
        if (duration !== null) {
          row._tableDurationTotal += duration;
          row._tableDurationCount += 1;
        }
      }
    }
    if (row && ["open", "pending", "kitchen"].includes(status) && (sale.isTab || sale.is_tab || sale.tabName || sale.tab_name || sale.tableNumber || sale.table_number)) {
      row.tableTurnover.openTabCount += 1;
    }

    const refundStaffId = sale.refundedBy ?? sale.refunded_by ?? staffId;
    const refundRow = rowsByStaff.get(String(refundStaffId));
    const refundStatus = String(sale.refundStatus ?? sale.refund_status ?? "none");
    const refundedAmount = toNumber(sale.refundedAmount ?? sale.refunded_amount);
    if (refundRow && (transactionType === "refund" || refundStatus !== "none" || refundedAmount > 0)) {
      refundRow.exceptions.refundCount += 1;
      refundRow.exceptions.refundAmount += Math.abs(refundedAmount || toNumber(sale.total));
      addReason(refundRow, sale.refundReason ?? sale.refund_reason);
    }

    const voidStaffId = sale.voidedBy ?? sale.voided_by ?? staffId;
    const voidRow = rowsByStaff.get(String(voidStaffId));
    const voidReason = sale.voidReason ?? sale.void_reason;
    if (voidRow && (transactionType === "void" || Boolean(voidReason))) {
      voidRow.exceptions.voidCount += 1;
      voidRow.exceptions.voidAmount += Math.abs(toNumber(sale.total));
      addReason(voidRow, voidReason);
    }
  }

  const itemParams: any[] = [tenantId, range.fromSql, range.toSql];
  const itemStaffFilter = filters.staffId ? "AND s.staff_id = ?" : "";
  if (filters.staffId) itemParams.push(filters.staffId);
  const itemRows = await query<any>(
    `SELECT
        si.id,
        s.staff_id AS staffId,
        si.status,
        si.workstation_id AS workstationId,
        si.ordered_at AS orderedAt,
        si.accepted_at AS acceptedAt,
        si.ready_at AS readyAt,
        si.delivered_at AS deliveredAt,
        s.created_at AS saleCreatedAt
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
      WHERE s.tenant_id = ?
        AND s.created_at >= ?
        AND s.created_at <= ?
        AND si.workstation_id IS NOT NULL
        ${itemStaffFilter}
      ORDER BY COALESCE(si.delivered_at, si.ready_at, si.accepted_at, si.ordered_at, s.created_at) ASC`,
    itemParams,
  );
  for (const item of itemRows) {
    const row = rowsByStaff.get(String(item.staffId ?? item.staff_id));
    if (!row) continue;
    row.prepTime.itemCount += 1;
    const orderedAt = item.orderedAt ?? item.ordered_at;
    const acceptedAt = item.acceptedAt ?? item.accepted_at;
    const readyAt = item.readyAt ?? item.ready_at;
    const deliveredAt = item.deliveredAt ?? item.delivered_at;
    const acceptSeconds = secondsBetween(orderedAt, acceptedAt);
    if (acceptSeconds !== null) {
      row._acceptTotal += acceptSeconds;
      row._acceptCount += 1;
    }
    const prepSeconds = secondsBetween(acceptedAt || orderedAt, readyAt);
    if (prepSeconds !== null) {
      row._prepTotal += prepSeconds;
      row._prepCount += 1;
      if (prepSeconds >= 1800) row.prepTime.stalePrepCount += 1;
    }
    const handoffSeconds = secondsBetween(readyAt, deliveredAt);
    if (handoffSeconds !== null) {
      row._handoffTotal += handoffSeconds;
      row._handoffCount += 1;
    }
    const totalSeconds = secondsBetween(orderedAt, deliveredAt || readyAt);
    if (totalSeconds !== null) {
      row._totalPrepTotal += totalSeconds;
      row._totalPrepCount += 1;
    }
  }

  const scoreParams: any[] = [tenantId];
  const scoreStaffFilter = filters.staffId ? "AND staff_id = ?" : "";
  if (filters.staffId) scoreParams.push(filters.staffId);
  const scoreRows = await query<any>(
    `SELECT
        staff_id AS staffId,
        staff_name AS staffName,
        period_start AS periodStart,
        period_end AS periodEnd,
        score,
        grade,
        strengths,
        coaching_notes AS coachingNotes,
        badges,
        risk_flags AS riskFlags,
        source,
        created_at AS createdAt
       FROM ai_staff_scores
      WHERE tenant_id = ?
        ${scoreStaffFilter}
      ORDER BY created_at DESC, score DESC`,
    scoreParams,
  );
  for (const score of scoreRows) {
    const row = rowsByStaff.get(String(score.staffId ?? score.staff_id));
    if (!row || row.aiScore) continue;
    row.aiScore = {
      score: toNumber(score.score),
      grade: score.grade,
      strengths: parseJson(score.strengths, []),
      coachingNotes: parseJson(score.coachingNotes ?? score.coaching_notes, []),
      badges: parseJson(score.badges, []),
      riskFlags: parseJson(score.riskFlags ?? score.risk_flags, []),
      source: score.source,
      createdAt: score.createdAt ?? score.created_at,
      periodStart: score.periodStart ?? score.period_start,
      periodEnd: score.periodEnd ?? score.period_end,
    };
    row.coachingHistory.push(
      ...row.aiScore.coachingNotes.map((note: string, index: number) => ({
        id: `${score.staffId ?? score.staff_id}:ai:${index}`,
        staffId: row.staffId,
        staffName: row.staffName,
        noteType: "coaching",
        title: `AI score ${row.aiScore.grade}`,
        note,
        source: row.aiScore.source || "ai",
        createdAt: row.aiScore.createdAt,
      })),
    );
  }

  const noteParams: any[] = [tenantId, range.fromSql, range.toSql];
  const noteStaffFilter = filters.staffId ? "AND staff_id = ?" : "";
  if (filters.staffId) noteParams.push(filters.staffId);
  const noteRows = await query<any>(
    `SELECT
        id,
        staff_id AS staffId,
        staff_name AS staffName,
        note_type AS noteType,
        title,
        note,
        source,
        created_by AS createdBy,
        created_by_name AS createdByName,
        created_at AS createdAt
       FROM staff_coaching_notes
      WHERE tenant_id = ?
        AND created_at >= ?
        AND created_at <= ?
        ${noteStaffFilter}
      ORDER BY created_at DESC
      LIMIT 200`,
    noteParams,
  );
  for (const noteRow of noteRows.map(noteFromRow)) {
    const row = rowsByStaff.get(String(noteRow.staffId));
    if (row) row.coachingHistory.push(noteRow);
  }

  const staffPerformance = [...rowsByStaff.values()]
    .map(row => {
      const finalized = finalizeStaffRow(row);
      finalized.exceptionInsights = buildExceptionInsights(finalized as any);
      finalized.coachingHistory = finalized.coachingHistory
        .sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .slice(0, 12);
      return finalized;
    })
    .sort((a, b) => b.sales.revenue - a.sales.revenue || b.sales.completedCount - a.sales.completedCount || a.staffName.localeCompare(b.staffName));

  const summary = {
    staffCount: staffPerformance.length,
    completedSales: staffPerformance.reduce((sum, row) => sum + row.sales.completedCount, 0),
    salesRevenue: money(staffPerformance.reduce((sum, row) => sum + row.sales.revenue, 0)),
    refundCount: staffPerformance.reduce((sum, row) => sum + row.exceptions.refundCount, 0),
    voidCount: staffPerformance.reduce((sum, row) => sum + row.exceptions.voidCount, 0),
    tableTurns: staffPerformance.reduce((sum, row) => sum + row.tableTurnover.tableSaleCount, 0),
    workstationItems: staffPerformance.reduce((sum, row) => sum + row.prepTime.itemCount, 0),
    coachingNoteCount: staffPerformance.reduce((sum, row) => sum + row.coachingHistory.length, 0),
    insightCount: staffPerformance.reduce((sum, row) => sum + row.exceptionInsights.length, 0),
  };

  const csvRows: unknown[][] = [
    ["section", "period", "staff", "role", "sales", "revenue", "refunds", "voids", "tableTurns", "avgPrepSeconds", "insight"],
    ["summary", range.label, "", "", summary.completedSales, summary.salesRevenue, summary.refundCount, summary.voidCount, summary.tableTurns, "", JSON.stringify(summary)],
    ...staffPerformance.map(row => [
      "staff_performance",
      range.label,
      row.staffName,
      row.role,
      row.sales.completedCount,
      row.sales.revenue,
      row.exceptions.refundCount,
      row.exceptions.voidCount,
      row.tableTurnover.tableSaleCount,
      row.prepTime.averagePrepSeconds,
      row.exceptionInsights[0]?.title || "",
    ]),
  ];

  return {
    filename: `staff-performance-${range.fromDate}-${range.toDate}.csv`,
    mimeType: "text/csv;charset=utf-8",
    generatedAt: new Date().toISOString(),
    periodStart: range.fromSql,
    periodEnd: range.toSql,
    periodLabel: range.label,
    summary,
    staffPerformance,
    csv: csvRows.map(row => row.map(csvCell).join(",")).join("\n"),
  };
}
