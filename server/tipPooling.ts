import { query } from "./db.js";
import { recordAuditEventSafe } from "./audit.js";

type Actor = {
  staffId?: string | null;
  staffName?: string | null;
};

type DistributionMethod = "worked_hours" | "equal_shift" | "role_weighted";

export type TipPoolRule = {
  id: string;
  tenantId?: string;
  name: string;
  status: "active" | "inactive";
  distributionMethod: DistributionMethod;
  source: "sale_tips";
  includedRoles: string[];
  roleWeights: Record<string, number>;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type TipPoolRuleInput = Partial<Omit<TipPoolRule, "id" | "tenantId" | "createdAt" | "updatedAt">>;

type AttendanceParticipant = {
  attendanceId: string;
  staffId: string;
  staffName: string;
  role: string;
  shiftId?: string | null;
  shiftDate: string;
  workedMinutes: number;
};

type TipPoolEntry = AttendanceParticipant & {
  weight: number;
  tipPoolAmount: number;
  payoutAmount: number;
  payoutId?: string | null;
  status?: string | null;
};

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function safeParse<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function dateOnly(value?: string | Date | null) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function nextDateExclusive(value: string) {
  const d = new Date(`${dateOnly(value)}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function normalizeRoleWeights(input: unknown) {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(raw).map(([role, weight]) => [
    role,
    Math.max(0, toNumber(weight, 1)),
  ]));
}

function normalizeRuleInput(input: TipPoolRuleInput = {}) {
  return {
    name: String(input.name || "Worked-hours tip pool").trim(),
    status: input.status === "inactive" ? "inactive" : "active",
    distributionMethod: (["worked_hours", "equal_shift", "role_weighted"].includes(String(input.distributionMethod))
      ? input.distributionMethod
      : "worked_hours") as DistributionMethod,
    source: "sale_tips" as const,
    includedRoles: Array.isArray(input.includedRoles) ? input.includedRoles.map(String).filter(Boolean) : [],
    roleWeights: normalizeRoleWeights(input.roleWeights || {}),
  };
}

function ruleFromRow(row: any): TipPoolRule {
  return {
    id: row.id,
    tenantId: row.tenantId ?? row.tenant_id,
    name: row.name,
    status: row.status || "active",
    distributionMethod: row.distributionMethod ?? row.distribution_method ?? "worked_hours",
    source: row.source || "sale_tips",
    includedRoles: safeParse(row.includedRoles ?? row.included_roles, []),
    roleWeights: normalizeRoleWeights(safeParse(row.roleWeights ?? row.role_weights, {})),
    createdBy: row.createdBy ?? row.created_by ?? null,
    createdByName: row.createdByName ?? row.created_by_name ?? null,
    createdAt: row.createdAt ?? row.created_at ?? null,
    updatedAt: row.updatedAt ?? row.updated_at ?? null,
  };
}

function payoutFromRow(row: any) {
  return {
    id: row.id,
    tenantId: row.tenantId ?? row.tenant_id,
    ruleId: row.ruleId ?? row.rule_id,
    periodStart: row.periodStart ?? row.period_start,
    periodEnd: row.periodEnd ?? row.period_end,
    staffId: row.staffId ?? row.staff_id,
    staffName: row.staffName ?? row.staff_name,
    attendanceId: row.attendanceId ?? row.attendance_id ?? null,
    shiftId: row.shiftId ?? row.shift_id ?? null,
    shiftDate: row.shiftDate ?? row.shift_date ?? null,
    workedMinutes: toNumber(row.workedMinutes ?? row.worked_minutes),
    weight: toNumber(row.weight),
    tipPoolAmount: toNumber(row.tipPoolAmount ?? row.tip_pool_amount),
    payoutAmount: toNumber(row.payoutAmount ?? row.payout_amount),
    status: row.status || "draft",
    generatedAt: row.generatedAt ?? row.generated_at ?? null,
    generatedBy: row.generatedBy ?? row.generated_by ?? null,
    generatedByName: row.generatedByName ?? row.generated_by_name ?? null,
    approvedAt: row.approvedAt ?? row.approved_at ?? null,
    paidAt: row.paidAt ?? row.paid_at ?? null,
    notes: row.notes || null,
  };
}

async function getRule(tenantId: string, ruleId: string) {
  const rows = await query<any>(
    `SELECT
        id, tenant_id AS tenantId, name, status,
        distribution_method AS distributionMethod, source,
        included_roles AS includedRoles, role_weights AS roleWeights,
        created_by AS createdBy, created_by_name AS createdByName,
        created_at AS createdAt, updated_at AS updatedAt
       FROM tip_pool_rules
      WHERE tenant_id = ? AND id = ?
      LIMIT 1`,
    [tenantId, ruleId],
  );
  return rows[0] ? ruleFromRow(rows[0]) : null;
}

async function resolveRule(tenantId: string, ruleId?: string | null) {
  if (ruleId) {
    const rule = await getRule(tenantId, ruleId);
    if (!rule) throw new Error("Tip pool rule not found.");
    return rule;
  }
  const rows = await query<any>(
    `SELECT
        id, tenant_id AS tenantId, name, status,
        distribution_method AS distributionMethod, source,
        included_roles AS includedRoles, role_weights AS roleWeights,
        created_by AS createdBy, created_by_name AS createdByName,
        created_at AS createdAt, updated_at AS updatedAt
       FROM tip_pool_rules
      WHERE tenant_id = ? AND status = 'active'
      ORDER BY created_at ASC
      LIMIT 1`,
    [tenantId],
  );
  if (!rows[0]) throw new Error("Create an active tip pool rule before generating payouts.");
  return ruleFromRow(rows[0]);
}

export async function listTipPoolRules(tenantId: string) {
  const rows = await query<any>(
    `SELECT
        id, tenant_id AS tenantId, name, status,
        distribution_method AS distributionMethod, source,
        included_roles AS includedRoles, role_weights AS roleWeights,
        created_by AS createdBy, created_by_name AS createdByName,
        created_at AS createdAt, updated_at AS updatedAt
       FROM tip_pool_rules
      WHERE tenant_id = ?
      ORDER BY status ASC, name ASC`,
    [tenantId],
  );
  return rows.map(ruleFromRow);
}

export async function createTipPoolRule(tenantId: string, input: TipPoolRuleInput, actor: Actor = {}) {
  const rule = normalizeRuleInput(input);
  if (!rule.name) throw new Error("Rule name is required.");
  const ruleId = id("tiprule");
  await query(
    `INSERT INTO tip_pool_rules (
      id, tenant_id, name, status, distribution_method, source,
      included_roles, role_weights, created_by, created_by_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'sale_tips', ?, ?, ?, ?, NOW(), NOW())`,
    [
      ruleId,
      tenantId,
      rule.name,
      rule.status,
      rule.distributionMethod,
      JSON.stringify(rule.includedRoles),
      JSON.stringify(rule.roleWeights),
      actor.staffId || null,
      actor.staffName || null,
    ],
  );
  await recordAuditEventSafe({
    tenantId,
    action: "tip_pool_rule.created",
    entityType: "tip_pool_rule",
    entityId: ruleId,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    source: "workforce",
    details: { rule },
  });
  return getRule(tenantId, ruleId);
}

export async function updateTipPoolRule(tenantId: string, ruleId: string, input: TipPoolRuleInput, actor: Actor = {}) {
  const current = await getRule(tenantId, ruleId);
  if (!current) throw new Error("Tip pool rule not found.");
  const next = normalizeRuleInput({ ...current, ...input });
  await query(
    `UPDATE tip_pool_rules
        SET name = ?,
            status = ?,
            distribution_method = ?,
            included_roles = ?,
            role_weights = ?,
            updated_at = NOW()
      WHERE tenant_id = ? AND id = ?`,
    [next.name, next.status, next.distributionMethod, JSON.stringify(next.includedRoles), JSON.stringify(next.roleWeights), tenantId, ruleId],
  );
  await recordAuditEventSafe({
    tenantId,
    action: "tip_pool_rule.updated",
    entityType: "tip_pool_rule",
    entityId: ruleId,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    source: "workforce",
    details: { rule: next },
  });
  return getRule(tenantId, ruleId);
}

async function getSaleTips(tenantId: string, periodStart: string, periodEnd: string) {
  const rows = await query<any>(
    `SELECT
        COALESCE(SUM(tip_amount), 0) AS totalTips,
        COUNT(*) AS saleCount
       FROM sales
      WHERE tenant_id = ?
        AND status = 'completed'
        AND created_at >= ?
        AND created_at < ?
        AND COALESCE(tip_amount, 0) > 0`,
    [tenantId, `${periodStart} 00:00:00`, `${nextDateExclusive(periodEnd)} 00:00:00`],
  );
  return {
    totalTips: toNumber(rows[0]?.totalTips ?? rows[0]?.total_tips),
    saleCount: toNumber(rows[0]?.saleCount ?? rows[0]?.sale_count),
  };
}

async function getParticipants(tenantId: string, periodStart: string, periodEnd: string, rule: TipPoolRule): Promise<AttendanceParticipant[]> {
  const rows = await query<any>(
    `SELECT
        a.id AS attendanceId,
        a.staff_id AS staffId,
        a.staff_name AS staffName,
        COALESCE(st.role, 'cashier') AS role,
        a.shift_id AS shiftId,
        COALESCE(s.shift_date, DATE(a.clock_in_at)) AS shiftDate,
        a.worked_minutes AS workedMinutes
       FROM staff_attendance a
       LEFT JOIN staff st ON st.tenant_id = a.tenant_id AND st.id = a.staff_id
       LEFT JOIN staff_shifts s ON s.tenant_id = a.tenant_id AND s.id = a.shift_id
      WHERE a.tenant_id = ?
        AND a.status = 'closed'
        AND a.clock_in_at >= ?
        AND a.clock_in_at < ?
        AND COALESCE(a.worked_minutes, 0) > 0
      ORDER BY COALESCE(s.shift_date, DATE(a.clock_in_at)) ASC, a.staff_name ASC, a.clock_in_at ASC`,
    [tenantId, `${periodStart} 00:00:00`, `${nextDateExclusive(periodEnd)} 00:00:00`],
  );
  const includedRoles = new Set((rule.includedRoles || []).map(role => role.toLowerCase()));
  return rows
    .map(row => ({
      attendanceId: row.attendanceId ?? row.attendance_id,
      staffId: row.staffId ?? row.staff_id,
      staffName: row.staffName ?? row.staff_name,
      role: String(row.role || "cashier"),
      shiftId: row.shiftId ?? row.shift_id ?? null,
      shiftDate: dateOnly(row.shiftDate ?? row.shift_date),
      workedMinutes: toNumber(row.workedMinutes ?? row.worked_minutes),
    }))
    .filter(row => includedRoles.size === 0 || includedRoles.has(row.role.toLowerCase()));
}

function participantWeight(rule: TipPoolRule, participant: AttendanceParticipant) {
  if (rule.distributionMethod === "equal_shift") return 1;
  if (rule.distributionMethod === "role_weighted") {
    const roleWeight = Math.max(0, toNumber(rule.roleWeights?.[participant.role], 1));
    return participant.workedMinutes * roleWeight;
  }
  return participant.workedMinutes;
}

function allocatePayouts(poolAmount: number, entries: Array<AttendanceParticipant & { weight: number }>): TipPoolEntry[] {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (poolAmount <= 0 || totalWeight <= 0 || entries.length === 0) {
    return entries.map(entry => ({ ...entry, tipPoolAmount: poolAmount, payoutAmount: 0 }));
  }

  const totalCents = Math.round(poolAmount * 100);
  const weighted = entries.map((entry, index) => {
    const exact = (totalCents * entry.weight) / totalWeight;
    return {
      entry,
      index,
      cents: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });
  let assigned = weighted.reduce((sum, entry) => sum + entry.cents, 0);
  const sorted = [...weighted].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const row of sorted) {
    if (assigned >= totalCents) break;
    row.cents += 1;
    assigned += 1;
  }

  return weighted
    .sort((a, b) => a.index - b.index)
    .map(({ entry, cents }) => ({
      ...entry,
      tipPoolAmount: poolAmount,
      payoutAmount: Number((cents / 100).toFixed(2)),
    }));
}

function summarize(entries: TipPoolEntry[], poolAmount: number, saleCount: number) {
  const totals = new Map<string, any>();
  for (const entry of entries) {
    const row = totals.get(entry.staffId) || {
      staffId: entry.staffId,
      staffName: entry.staffName,
      role: entry.role,
      shiftCount: 0,
      workedMinutes: 0,
      weight: 0,
      payoutAmount: 0,
    };
    row.shiftCount += 1;
    row.workedMinutes += entry.workedMinutes;
    row.weight += entry.weight;
    row.payoutAmount += entry.payoutAmount;
    totals.set(entry.staffId, row);
  }
  const staffTotals = [...totals.values()].map(row => ({
    ...row,
    weight: Number(row.weight.toFixed(4)),
    payoutAmount: Number(row.payoutAmount.toFixed(2)),
  }));
  return {
    summary: {
      poolAmount: Number(poolAmount.toFixed(2)),
      saleTipCount: saleCount,
      participantCount: staffTotals.length,
      shiftCount: entries.length,
      workedMinutes: entries.reduce((sum, entry) => sum + entry.workedMinutes, 0),
      payoutAmount: Number(entries.reduce((sum, entry) => sum + entry.payoutAmount, 0).toFixed(2)),
    },
    staffTotals,
  };
}

function buildCsv(entries: TipPoolEntry[]) {
  const rows = [
    ["Staff", "Role", "Shift date", "Worked minutes", "Weight", "Pool amount", "Payout amount", "Status"],
    ...entries.map(entry => [
      entry.staffName,
      entry.role,
      entry.shiftDate,
      entry.workedMinutes,
      entry.weight.toFixed(4),
      entry.tipPoolAmount.toFixed(2),
      entry.payoutAmount.toFixed(2),
      entry.status || "preview",
    ]),
  ];
  return rows.map(row => row.map(csvEscape).join(",")).join("\n");
}

export async function previewTipPoolPayouts(tenantId: string, input: { ruleId?: string; startDate?: string; endDate?: string }) {
  const periodStart = dateOnly(input.startDate);
  const periodEnd = dateOnly(input.endDate || input.startDate || periodStart);
  const rule = await resolveRule(tenantId, input.ruleId || null);
  const [{ totalTips, saleCount }, participants] = await Promise.all([
    getSaleTips(tenantId, periodStart, periodEnd),
    getParticipants(tenantId, periodStart, periodEnd, rule),
  ]);
  const entries = allocatePayouts(
    totalTips,
    participants.map(participant => ({ ...participant, weight: participantWeight(rule, participant) })),
  );
  const { summary, staffTotals } = summarize(entries, totalTips, saleCount);
  return {
    generatedAt: new Date().toISOString(),
    periodStart,
    periodEnd,
    rule,
    generated: false,
    filename: `tip-pool-${periodStart}-to-${periodEnd}.csv`,
    mimeType: "text/csv;charset=utf-8",
    summary,
    staffTotals,
    entries,
    csv: buildCsv(entries),
  };
}

export async function generateTipPoolPayouts(tenantId: string, input: { ruleId?: string; startDate?: string; endDate?: string }, actor: Actor = {}) {
  const preview = await previewTipPoolPayouts(tenantId, input);
  await query(
    `DELETE FROM tip_pool_payouts
      WHERE tenant_id = ?
        AND rule_id = ?
        AND period_start = ?
        AND period_end = ?
        AND status = 'draft'`,
    [tenantId, preview.rule.id, preview.periodStart, preview.periodEnd],
  );

  const generatedEntries: TipPoolEntry[] = [];
  for (const entry of preview.entries) {
    const payoutId = id("tippayout");
    await query(
      `INSERT INTO tip_pool_payouts (
        id, tenant_id, rule_id, period_start, period_end, staff_id, staff_name,
        attendance_id, shift_id, shift_date, worked_minutes, weight,
        tip_pool_amount, payout_amount, status, generated_at, generated_by, generated_by_name, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', NOW(), ?, ?, ?)`,
      [
        payoutId,
        tenantId,
        preview.rule.id,
        preview.periodStart,
        preview.periodEnd,
        entry.staffId,
        entry.staffName,
        entry.attendanceId,
        entry.shiftId || null,
        entry.shiftDate,
        entry.workedMinutes,
        entry.weight,
        entry.tipPoolAmount,
        entry.payoutAmount,
        actor.staffId || null,
        actor.staffName || null,
        `${preview.rule.name} ${preview.periodStart} to ${preview.periodEnd}`,
      ],
    );
    generatedEntries.push({ ...entry, payoutId, status: "draft" });
  }
  await recordAuditEventSafe({
    tenantId,
    action: "tip_pool.generated",
    entityType: "tip_pool",
    entityId: `${preview.rule.id}:${preview.periodStart}:${preview.periodEnd}`,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    source: "workforce",
    details: {
      ruleId: preview.rule.id,
      periodStart: preview.periodStart,
      periodEnd: preview.periodEnd,
      summary: preview.summary,
    },
  });
  const { summary, staffTotals } = summarize(generatedEntries, preview.summary.poolAmount, preview.summary.saleTipCount);
  return {
    ...preview,
    generated: true,
    summary,
    staffTotals,
    entries: generatedEntries,
    csv: buildCsv(generatedEntries),
  };
}

export async function listTipPoolPayouts(tenantId: string, filters: { ruleId?: string; startDate?: string; endDate?: string; staffId?: string } = {}) {
  const params: any[] = [tenantId];
  const where = ["tenant_id = ?"];
  if (filters.ruleId) {
    where.push("rule_id = ?");
    params.push(filters.ruleId);
  }
  if (filters.startDate) {
    where.push("period_start >= ?");
    params.push(dateOnly(filters.startDate));
  }
  if (filters.endDate) {
    where.push("period_end <= ?");
    params.push(dateOnly(filters.endDate));
  }
  if (filters.staffId) {
    where.push("staff_id = ?");
    params.push(filters.staffId);
  }
  const rows = await query<any>(
    `SELECT
        id, tenant_id AS tenantId, rule_id AS ruleId, period_start AS periodStart,
        period_end AS periodEnd, staff_id AS staffId, staff_name AS staffName,
        attendance_id AS attendanceId, shift_id AS shiftId, shift_date AS shiftDate,
        worked_minutes AS workedMinutes, weight, tip_pool_amount AS tipPoolAmount,
        payout_amount AS payoutAmount, status, generated_at AS generatedAt,
        generated_by AS generatedBy, generated_by_name AS generatedByName,
        approved_at AS approvedAt, paid_at AS paidAt, notes
       FROM tip_pool_payouts
      WHERE ${where.join(" AND ")}
      ORDER BY period_start DESC, staff_name ASC, shift_date ASC`,
    params,
  );
  return rows.map(payoutFromRow);
}
