import { query } from './db.js';
import { createSimplePdfBase64 } from './pdfExport.js';
function toNumber(value: unknown) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}
function safeParse(value: unknown, fallback: any) {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}
type ActivityFilters = {
    type?: string;
    search?: string;
    staff?: string;
    productId?: string;
    saleId?: string;
    customerId?: string;
    registerId?: string;
    deviceId?: string;
    source?: string;
    action?: string;
    audience?: string;
    from?: string;
    to?: string;
    limit?: string | number;
};
function clean(value: unknown) {
    return String(value || '').trim();
}
function clampLimit(value: unknown, fallback = 50, max = 1000) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(Math.max(Math.floor(parsed), 1), max);
}
function dayBoundary(value: unknown, endOfDay = false) {
    const raw = clean(value);
    if (!raw) return null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`) : new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
}
function addDateFilters(where: string[], params: unknown[], filters: ActivityFilters) {
    const from = dayBoundary(filters.from);
    const to = dayBoundary(filters.to, true);
    if (from) {
        const idx = params.length + 1;
        where.push(`created_at >= $${idx}`);
        params.push(from);
    }
    if (to) {
        const idx = params.length + 1;
        where.push(`created_at <= $${idx}`);
        params.push(to);
    }
}
function normalizeAuditEvent(event: any) {
    return {
        ...event,
        details: safeParse(event.details, {}),
    };
}
function detailString(details: unknown, keys: string[]) {
    const value = details && typeof details === 'object' ? (details as Record<string, unknown>) : {};
    for (const key of keys) {
        const raw = value[key];
        if (raw !== null && raw !== undefined && String(raw).trim()) return String(raw);
    }
    return null;
}
function normalizeStockMovement(movement: any) {
    return {
        ...movement,
        reasonCode: movement.reasonCode || movement.reason_code || null,
        quantityDelta: toNumber(movement.quantityDelta),
        previousQuantity: toNumber(movement.previousQuantity),
        newQuantity: toNumber(movement.newQuantity),
    };
}
function activityTime(value: unknown) {
    const date = value ? new Date(String(value)) : new Date(0);
    const time = date.getTime();
    return Number.isFinite(time) ? time : 0;
}
function csvCell(value: unknown) {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return `"${text.replace(/"/g, '""')}"`;
}
function normalizeReportAudience(value: unknown) {
    const audience = clean(value).toLowerCase();
    if (audience === 'accountant' || audience === 'compliance' || audience === 'owner') return audience;
    return 'owner';
}
function titleText(item: any) {
    return String(item?.title || '').toLowerCase();
}
function sourceText(item: any) {
    return String(item?.source || '').toLowerCase();
}
function numericDetail(item: any, keys: string[]) {
    const details = item?.details && typeof item.details === 'object' ? item.details : {};
    for (const key of keys) {
        const value = details[key];
        if (value !== null && value !== undefined && value !== '') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) return parsed;
        }
    }
    return null;
}
function amountForReport(item: any) {
    if (item.kind === 'stock') return null;
    return numericDetail(item, ['amount', 'total', 'refundTotal', 'walletAmount', 'walletPaymentAmount', 'cashSessionDelta']);
}
function reviewFocusForReport(audience: string, item: any) {
    const title = titleText(item);
    const source = sourceText(item);
    if (audience === 'accountant') {
        if (item.kind === 'stock') return 'stock movement';
        if (title.includes('cash') || source.includes('cash')) return 'cash control';
        if (title.includes('wallet')) return 'wallet liability';
        if (title.includes('refund') || title.includes('void')) return 'refund or void';
        if (title.startsWith('sale.')) return 'sales support';
        return 'supporting audit';
    }
    if (audience === 'compliance') {
        if (title === 'permission.denied' || title.startsWith('auth.')) return 'security access';
        if (title.startsWith('settings.') || title.startsWith('staff.')) return 'administration change';
        if (title.startsWith('customer.')) return 'customer data change';
        if (title.startsWith('ai.')) return 'AI approval trace';
        if (title.startsWith('offline.')) return 'offline sync trace';
        return 'retention trail';
    }
    if (title.includes('refund') || title.includes('void')) return 'sales exception';
    if (title.includes('cash') || source.includes('cash')) return 'cash exception';
    if (item.kind === 'stock') return 'stock movement';
    if (title.startsWith('ai.')) return 'AI action';
    if (title === 'permission.denied') return 'blocked action';
    return 'owner review';
}
function countBy(items: any[], keyFn: (item: any) => string | null | undefined) {
    const counts = new Map<string, number>();
    for (const item of items) {
        const key = clean(keyFn(item) || 'Unspecified') || 'Unspecified';
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
function reportLabel(value: unknown) {
    return clean(value) || 'Unspecified';
}
function formatReportAmount(value: unknown) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return 'n/a';
    return `R${amount.toFixed(2)}`;
}
function formatReportQuantity(value: unknown) {
    const quantity = Number(value);
    if (!Number.isFinite(quantity)) return 'n/a';
    return quantity.toFixed(3).replace(/\.?0+$/, '');
}
export async function getManagerActionCenter(tenantId: string) {
    const [auditEvents, stockMovements, lowStock, cashExceptions, saleExceptions, aiInsights, stockTakeExceptions, offlineSyncIssues] = await Promise.all([
        query<any>(
            `SELECT
         id,
         action,
         entity_type AS entityType,
         entity_id AS entityId,
         related_sale_id AS relatedSaleId,
         staff_id AS staffId,
         staff_name AS staffName,
         customer_id AS customerId,
         source,
         details,
         created_at AS createdAt
       FROM audit_events
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 25`,
            [tenantId],
        ),
        query<any>(
            `SELECT
         id,
         item_type AS itemType,
         product_id AS productId,
         bulk_item_id AS bulkItemId,
         item_name AS itemName,
         quantity_delta AS quantityDelta,
         previous_quantity AS previousQuantity,
         new_quantity AS newQuantity,
         reason,
         reason_code AS reasonCode,
         reference_type AS referenceType,
         reference_id AS referenceId,
         sale_id AS saleId,
         sale_item_id AS saleItemId,
         staff_id AS staffId,
         staff_name AS staffName,
         note,
         created_at AS createdAt
       FROM stock_movements
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 25`,
            [tenantId],
        ),
        query<any>(
            `SELECT
         id,
         name,
         category,
         section,
         stock,
         min_stock AS minStock,
         updated_at AS updatedAt
       FROM products
       WHERE tenant_id = $1
         AND COALESCE(stock, 0) <= GREATEST(1, COALESCE(min_stock, 0))
       ORDER BY COALESCE(stock, 0) ASC, name ASC
       LIMIT 20`,
            [tenantId],
        ),
        query<any>(
            `SELECT
         id,
         staff_id AS staffId,
         staff_name AS staffName,
         expected_cash AS expectedCash,
         actual_cash AS actualCash,
         difference,
         review_status AS reviewStatus,
         status,
         opened_at AS openedAt,
         updated_at AS updatedAt
       FROM cash_sessions
       WHERE tenant_id = $1
         AND (
           review_status IN ('submitted', 'disputed')
           OR ABS(COALESCE(difference, 0)) > 0.009
         )
       ORDER BY updated_at DESC
       LIMIT 20`,
            [tenantId],
        ),
        query<any>(
            `SELECT
         id,
         customer_id AS customerId,
         staff_id AS staffId,
         total,
         payment_method AS paymentMethod,
         status,
         transaction_type AS transactionType,
         parent_sale_id AS parentSaleId,
         refund_status AS refundStatus,
         refunded_amount AS refundedAmount,
         refund_reason AS refundReason,
         void_reason AS voidReason,
         voided_by AS voidedBy,
         updated_at AS updatedAt,
         created_at AS createdAt
       FROM sales
       WHERE tenant_id = $1
         AND (
           transaction_type IN ('refund', 'void')
           OR refund_status <> 'none'
         )
       ORDER BY updated_at DESC
       LIMIT 20`,
            [tenantId],
        ),
        query<any>(
            `SELECT
         id,
         category,
         severity,
         title,
         summary,
         recommendation,
         evidence,
         confidence,
         status,
         created_at AS createdAt
       FROM ai_insights
       WHERE tenant_id = $1
         AND status = 'open'
         AND severity IN ('critical', 'warning')
       ORDER BY created_at DESC
       LIMIT 20`,
            [tenantId],
        ),
        query<any>(
            `SELECT
         s.id,
         s.name,
         s.type,
         s.status,
         s.due_at AS dueAt,
         s.updated_at AS updatedAt,
         COUNT(i.id) AS itemCount,
         SUM(CASE WHEN i.counted_quantity IS NOT NULL THEN 1 ELSE 0 END) AS countedCount,
         SUM(CASE WHEN i.variance_quantity IS NOT NULL AND ABS(i.variance_quantity) > 0.0001 THEN 1 ELSE 0 END) AS varianceCount,
         SUM(CASE WHEN i.variance_quantity IS NOT NULL THEN i.variance_quantity ELSE 0 END) AS netVariance
       FROM stock_take_sessions s
       LEFT JOIN stock_take_items i ON i.session_id = s.id AND i.tenant_id = s.tenant_id
       WHERE s.tenant_id = $1
         AND s.status IN ('active','submitted')
         AND (
           s.status = 'submitted'
           OR (s.status = 'active' AND s.due_at IS NOT NULL AND s.due_at < NOW())
         )
       GROUP BY s.id, s.name, s.type, s.status, s.due_at, s.updated_at
       HAVING
         (s.status = 'active' AND s.due_at IS NOT NULL AND s.due_at < NOW())
         OR SUM(CASE WHEN i.variance_quantity IS NOT NULL AND ABS(i.variance_quantity) > 0.0001 THEN 1 ELSE 0 END) > 0
       ORDER BY
         CASE WHEN s.status = 'submitted' THEN 0 ELSE 1 END,
         s.updated_at DESC
       LIMIT 20`,
            [tenantId],
        ),
        query<any>(
            `SELECT
         id,
         action,
         entity_type AS entityType,
         entity_id AS entityId,
         staff_id AS staffId,
         staff_name AS staffName,
         source,
         details,
         created_at AS createdAt
       FROM audit_events
       WHERE tenant_id = $1
         AND action NOT LIKE 'manager_task.%'
         AND (
           action IN ('offline.sync_failed', 'offline.sync_conflict')
           OR action LIKE 'sync.%'
           OR action LIKE '%sync_failed%'
           OR action LIKE '%sync_conflict%'
           OR action LIKE '%sync.conflict%'
         )
       ORDER BY created_at DESC
       LIMIT 20`,
            [tenantId],
        ),
    ]);
    const parsedAuditEvents = auditEvents.map(normalizeAuditEvent);
    const parsedStockMovements = stockMovements.map(normalizeStockMovement);
    const parsedLowStock = lowStock.map((product) => ({
        ...product,
        stock: toNumber(product.stock),
        minStock: toNumber(product.minStock),
    }));
    const parsedCashExceptions = cashExceptions.map((session) => ({
        ...session,
        expectedCash: toNumber(session.expectedCash),
        actualCash: toNumber(session.actualCash),
        difference: toNumber(session.difference),
    }));
    const parsedSaleExceptions = saleExceptions.map((sale) => ({
        ...sale,
        total: toNumber(sale.total),
        refundedAmount: toNumber(sale.refundedAmount),
    }));
    const parsedAiInsights = aiInsights.map((insight) => ({
        ...insight,
        evidence: safeParse(insight.evidence, []),
        confidence: toNumber(insight.confidence),
    }));
    const parsedStockTakeExceptions = stockTakeExceptions.map((session) => ({
        ...session,
        itemCount: toNumber(session.itemCount),
        countedCount: toNumber(session.countedCount),
        varianceCount: toNumber(session.varianceCount),
        netVariance: toNumber(session.netVariance),
    }));
    const parsedOfflineSyncIssues = offlineSyncIssues.map((event) => ({
        ...event,
        details: safeParse(event.details, {}),
    }));
    const counts = {
        auditEvents: parsedAuditEvents.length,
        stockMovements: parsedStockMovements.length,
        lowStock: parsedLowStock.length,
        cashExceptions: parsedCashExceptions.length,
        saleExceptions: parsedSaleExceptions.length,
        aiWarnings: parsedAiInsights.length,
        stockTakeExceptions: parsedStockTakeExceptions.length,
        offlineSyncIssues: parsedOfflineSyncIssues.length,
    };
    return {
        counts,
        urgentCount:
            counts.lowStock + counts.cashExceptions + counts.saleExceptions + counts.aiWarnings + counts.stockTakeExceptions + counts.offlineSyncIssues,
        auditEvents: parsedAuditEvents,
        stockMovements: parsedStockMovements,
        lowStock: parsedLowStock,
        cashExceptions: parsedCashExceptions,
        saleExceptions: parsedSaleExceptions,
        aiInsights: parsedAiInsights,
        stockTakeExceptions: parsedStockTakeExceptions,
        offlineSyncIssues: parsedOfflineSyncIssues,
        generatedAt: new Date().toISOString(),
    };
}
export async function getManagerActivityHistory(tenantId: string, filters: ActivityFilters = {}) {
    const type = clean(filters.type) || 'all';
    const limit = clampLimit(filters.limit);
    const search = clean(filters.search).toLowerCase();
    const staff = clean(filters.staff);
    const productId = clean(filters.productId);
    const saleId = clean(filters.saleId);
    const customerId = clean(filters.customerId);
    const registerId = clean(filters.registerId);
    const deviceId = clean(filters.deviceId);
    const source = clean(filters.source).toLowerCase();
    const action = clean(filters.action);
    const includeAudit = type !== 'stock';
    const includeStock = type !== 'audit';
    const auditPromise = includeAudit
        ? (() => {
              const where = ['tenant_id = $1'];
              const params: unknown[] = [tenantId];
              addDateFilters(where, params, filters);
              if (staff) {
                  where.push("(staff_id = $1 OR LOWER(COALESCE(staff_name, '')) LIKE $2)");
                  params.push(staff, `%${staff.toLowerCase()}%`);
              }
              if (saleId) {
                  where.push('(related_sale_id = $1 OR entity_id = $2)');
                  params.push(saleId, saleId);
              }
              if (customerId) {
                  where.push("(customer_id = $1 OR (entity_type = 'customer' AND entity_id = $2) OR LOWER(COALESCE(details, '')) LIKE $3)");
                  params.push(customerId, customerId, `%${customerId.toLowerCase()}%`);
              }
              if (registerId) {
                  where.push(`(
        entity_id = $1
        OR LOWER(COALESCE(details, '')) LIKE $2
        OR related_sale_id IN (
          SELECT sale_id FROM cash_movements
          WHERE tenant_id = $3 AND cash_session_id = $4 AND sale_id IS NOT NULL
        )
      )`);
                  params.push(registerId, `%${registerId.toLowerCase()}%`, tenantId, registerId);
              }
              if (deviceId) {
                  where.push(`(
        entity_id = $1
        OR LOWER(COALESCE(details, '')) LIKE $2
      )`);
                  params.push(deviceId, `%${deviceId.toLowerCase()}%`);
              }
              if (productId) {
                  where.push('entity_id = $1');
                  params.push(productId);
              }
              if (source) {
                  where.push("LOWER(COALESCE(source, '')) LIKE $1");
                  params.push(`%${source}%`);
              }
              if (action) {
                  where.push('LOWER(action) LIKE $1');
                  params.push(`%${action.toLowerCase()}%`);
              }
              if (search) {
                  where.push(`(
        LOWER(action) LIKE $1
        OR LOWER(entity_type) LIKE $2
        OR LOWER(COALESCE(entity_id, '')) LIKE $3
        OR LOWER(COALESCE(related_sale_id, '')) LIKE $4
        OR LOWER(COALESCE(staff_id, '')) LIKE $5
        OR LOWER(COALESCE(staff_name, '')) LIKE $6
        OR LOWER(COALESCE(customer_id, '')) LIKE $7
        OR LOWER(COALESCE(source, '')) LIKE $8
        OR LOWER(COALESCE(details, '')) LIKE $9
      )`);
                  params.push(...Array(9).fill(`%${search}%`));
              }
              params.push(limit);
              return query<any>(
                  `SELECT
         id,
         action,
         entity_type AS entityType,
         entity_id AS entityId,
         related_sale_id AS relatedSaleId,
         staff_id AS staffId,
         staff_name AS staffName,
         customer_id AS customerId,
         source,
         details,
         created_at AS createdAt
       FROM audit_events
       WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
                  params,
              );
          })()
        : Promise.resolve([]);
    const stockPromise = includeStock
        ? (() => {
              const where = ['tenant_id = $1'];
              const params: unknown[] = [tenantId];
              addDateFilters(where, params, filters);
              if (staff) {
                  where.push("(staff_id = $1 OR LOWER(COALESCE(staff_name, '')) LIKE $2)");
                  params.push(staff, `%${staff.toLowerCase()}%`);
              }
              if (saleId) {
                  where.push('(sale_id = $1 OR reference_id = $2)');
                  params.push(saleId, saleId);
              }
              if (customerId) {
                  where.push(`(
        sale_id IN (SELECT id FROM sales WHERE tenant_id = $1 AND customer_id = $2)
        OR reference_id IN (SELECT id FROM sales WHERE tenant_id = $3 AND customer_id = $4)
      )`);
                  params.push(tenantId, customerId, tenantId, customerId);
              }
              if (registerId) {
                  where.push(`(
        reference_id = $1
        OR sale_id IN (
          SELECT sale_id FROM cash_movements
          WHERE tenant_id = $2 AND cash_session_id = $3 AND sale_id IS NOT NULL
        )
        OR reference_id IN (
          SELECT sale_id FROM cash_movements
          WHERE tenant_id = $4 AND cash_session_id = $5 AND sale_id IS NOT NULL
        )
      )`);
                  params.push(registerId, tenantId, registerId, tenantId, registerId);
              }
              if (deviceId) {
                  where.push(`(
        reference_id = $1
        OR sale_id IN (
          SELECT related_sale_id FROM audit_events
          WHERE tenant_id = $2 AND related_sale_id IS NOT NULL AND LOWER(COALESCE(details, '')) LIKE $3
        )
        OR reference_id IN (
          SELECT related_sale_id FROM audit_events
          WHERE tenant_id = $4 AND related_sale_id IS NOT NULL AND LOWER(COALESCE(details, '')) LIKE $5
        )
      )`);
                  params.push(deviceId, tenantId, `%${deviceId.toLowerCase()}%`, tenantId, `%${deviceId.toLowerCase()}%`);
              }
              if (productId) {
                  where.push('(product_id = $1 OR bulk_item_id = $2)');
                  params.push(productId, productId);
              }
              if (source) {
                  where.push("LOWER(COALESCE(reference_type, '')) LIKE $1");
                  params.push(`%${source}%`);
              }
              if (action) {
                  where.push("(LOWER(reason) LIKE $1 OR LOWER(COALESCE(reason_code, '')) LIKE $2)");
                  params.push(`%${action.toLowerCase()}%`, `%${action.toLowerCase().replace(/[\s-]+/g, '_')}%`);
              }
              if (search) {
                  where.push(`(
        LOWER(COALESCE(item_name, '')) LIKE $1
        OR LOWER(COALESCE(product_id, '')) LIKE $2
        OR LOWER(COALESCE(bulk_item_id, '')) LIKE $3
        OR LOWER(reason) LIKE $4
        OR LOWER(COALESCE(reason_code, '')) LIKE $5
        OR LOWER(COALESCE(reference_type, '')) LIKE $6
        OR LOWER(COALESCE(reference_id, '')) LIKE $7
        OR LOWER(COALESCE(sale_id, '')) LIKE $8
        OR LOWER(COALESCE(staff_id, '')) LIKE $9
        OR LOWER(COALESCE(staff_name, '')) LIKE $10
        OR LOWER(COALESCE(note, '')) LIKE $11
      )`);
                  params.push(
                      `%${search}%`,
                      `%${search}%`,
                      `%${search}%`,
                      `%${search}%`,
                      `%${search.replace(/[\s-]+/g, '_')}%`,
                      `%${search}%`,
                      `%${search}%`,
                      `%${search}%`,
                      `%${search}%`,
                      `%${search}%`,
                      `%${search}%`,
                  );
              }
              params.push(limit);
              return query<any>(
                  `SELECT
         id,
         item_type AS itemType,
         product_id AS productId,
         bulk_item_id AS bulkItemId,
         item_name AS itemName,
         quantity_delta AS quantityDelta,
         previous_quantity AS previousQuantity,
         new_quantity AS newQuantity,
         reason,
         reason_code AS reasonCode,
         reference_type AS referenceType,
         reference_id AS referenceId,
         sale_id AS saleId,
         sale_item_id AS saleItemId,
         staff_id AS staffId,
         staff_name AS staffName,
         note,
         created_at AS createdAt
       FROM stock_movements
       WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
                  params,
              );
          })()
        : Promise.resolve([]);
    const [auditRows, stockRows] = await Promise.all([auditPromise, stockPromise]);
    const auditEvents = auditRows.map(normalizeAuditEvent);
    const stockMovements = stockRows.map(normalizeStockMovement);
    const items = [
        ...auditEvents.map((event) => {
            const details = event.details || {};
            return {
                kind: 'audit',
                id: event.id,
                title: event.action,
                subtitle: event.entityType,
                staffId: event.staffId,
                staffName: event.staffName,
                productId: event.entityType === 'product' ? event.entityId : null,
                saleId: event.relatedSaleId || (event.entityType === 'sale' ? event.entityId : null),
                customerId: event.customerId || detailString(details, ['customerId', 'targetCustomerId']),
                registerId: event.entityType === 'cash_session' ? event.entityId : detailString(details, ['cashSessionId', 'registerId']),
                deviceId:
                    event.entityType === 'companion_device_assignment'
                        ? detailString(details, ['deviceId']) || event.entityId
                        : detailString(details, ['deviceId']),
                localReceiptNumber: detailString(details, ['localReceiptNumber']),
                source: event.source,
                createdAt: event.createdAt,
                details,
            };
        }),
        ...stockMovements.map((movement) => ({
            kind: 'stock',
            id: movement.id,
            title: movement.itemName || movement.productId || movement.bulkItemId || 'Stock item',
            subtitle: movement.reason,
            reasonCode: movement.reasonCode,
            staffId: movement.staffId,
            staffName: movement.staffName,
            productId: movement.productId || movement.bulkItemId || null,
            saleId: movement.saleId || (movement.referenceType === 'sale' ? movement.referenceId : null),
            customerId: null,
            registerId: movement.referenceType === 'cash_session' ? movement.referenceId : null,
            deviceId: null,
            localReceiptNumber: null,
            source: movement.referenceType || null,
            quantityDelta: movement.quantityDelta,
            previousQuantity: movement.previousQuantity,
            newQuantity: movement.newQuantity,
            referenceType: movement.referenceType,
            referenceId: movement.referenceId,
            note: movement.note,
            createdAt: movement.createdAt,
        })),
    ]
        .sort((a, b) => activityTime(b.createdAt) - activityTime(a.createdAt))
        .slice(0, limit);
    return {
        filters: {
            type,
            search,
            staff,
            productId,
            saleId,
            customerId,
            registerId,
            deviceId,
            source,
            action,
            from: clean(filters.from),
            to: clean(filters.to),
            limit,
        },
        counts: {
            auditEvents: auditEvents.length,
            stockMovements: stockMovements.length,
            total: items.length,
        },
        items,
        auditEvents,
        stockMovements,
        generatedAt: new Date().toISOString(),
    };
}
export async function getManagerActivityCsv(tenantId: string, filters: ActivityFilters = {}) {
    const history = await getManagerActivityHistory(tenantId, {
        ...filters,
        limit: filters.limit || 200,
    });
    const header = [
        'kind',
        'createdAt',
        'title',
        'subtitle',
        'reasonCode',
        'staffId',
        'staffName',
        'customerId',
        'productId',
        'saleId',
        'registerId',
        'deviceId',
        'localReceiptNumber',
        'source',
        'quantityDelta',
        'previousQuantity',
        'newQuantity',
        'referenceType',
        'referenceId',
        'note',
    ];
    const rows = history.items.map((item: any) => [
        item.kind,
        item.createdAt,
        item.title,
        item.subtitle,
        item.reasonCode,
        item.staffId,
        item.staffName,
        item.customerId,
        item.productId,
        item.saleId,
        item.registerId,
        item.deviceId,
        item.localReceiptNumber,
        item.source,
        item.quantityDelta,
        item.previousQuantity,
        item.newQuantity,
        item.referenceType,
        item.referenceId,
        item.note || (item.details ? JSON.stringify(item.details) : ''),
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    return {
        filename: `masepos-activity-${new Date().toISOString().slice(0, 10)}.csv`,
        mimeType: 'text/csv',
        count: history.items.length,
        csv,
        generatedAt: new Date().toISOString(),
    };
}
export async function getManagerAuditReport(tenantId: string, filters: ActivityFilters = {}) {
    const audience = normalizeReportAudience(filters.audience);
    const generatedAt = new Date().toISOString();
    const history = await getManagerActivityHistory(tenantId, {
        ...filters,
        limit: filters.limit || 500,
    });
    const items = history.items as any[];
    const auditItems = items.filter((item: any) => item.kind === 'audit');
    const stockItems = items.filter((item: any) => item.kind === 'stock');
    const titleMatches = (pattern: RegExp) => items.filter((item: any) => pattern.test(String(item.title || ''))).length;
    const titleOrSourceMatches = (pattern: RegExp) =>
        items.filter((item: any) => pattern.test(String(item.title || '')) || pattern.test(String(item.source || ''))).length;
    const summary = {
        totalRows: items.length,
        auditEvents: auditItems.length,
        stockMovements: stockItems.length,
        salesEvents: titleMatches(/^sale\./i),
        cashEvents: titleOrSourceMatches(/cash|wallet/i),
        permissionDenied: titleMatches(/^permission\.denied$/i),
        authEvents: titleMatches(/^auth\./i),
        settingsChanges: titleMatches(/^settings\./i),
        customerChanges: titleMatches(/^customer\./i),
        staffChanges: titleMatches(/^staff\./i),
        aiEvents: titleMatches(/^ai\./i),
        offlineEvents: titleMatches(/^offline\./i),
    };
    const actionBreakdown = countBy(auditItems, (item) => item.title).slice(0, 40);
    const sourceBreakdown = countBy(items, (item) => item.source).slice(0, 25);
    const staffBreakdown = countBy(items, (item) => item.staffName || item.staffId).slice(0, 25);
    const stockReasonBreakdown = countBy(stockItems, (item) => item.reasonCode || item.subtitle).slice(0, 25);
    const header = [
        'section',
        'audience',
        'generatedAt',
        'createdAt',
        'kind',
        'actionOrMetric',
        'entityOrReason',
        'staffId',
        'staffName',
        'customerId',
        'productId',
        'saleId',
        'registerId',
        'deviceId',
        'localReceiptNumber',
        'source',
        'amount',
        'quantityDelta',
        'reviewFocus',
        'details',
    ];
    const filterSummary = {
        ...history.filters,
        audience,
    };
    const rows: unknown[][] = [
        ['metadata', audience, generatedAt, '', '', 'tenantId', tenantId, '', '', '', '', '', '', '', '', '', '', '', 'report context', ''],
        ['metadata', audience, generatedAt, '', '', 'filters', '', '', '', '', '', '', '', '', '', '', '', '', 'report context', JSON.stringify(filterSummary)],
        ['summary', audience, generatedAt, '', '', 'totalRows', summary.totalRows, '', '', '', '', '', '', '', '', '', '', '', 'report summary', ''],
        ['summary', audience, generatedAt, '', '', 'auditEvents', summary.auditEvents, '', '', '', '', '', '', '', '', '', '', '', 'report summary', ''],
        ['summary', audience, generatedAt, '', '', 'stockMovements', summary.stockMovements, '', '', '', '', '', '', '', '', '', '', '', 'report summary', ''],
        ['summary', audience, generatedAt, '', '', 'salesEvents', summary.salesEvents, '', '', '', '', '', '', '', '', '', '', '', 'report summary', ''],
        ['summary', audience, generatedAt, '', '', 'cashEvents', summary.cashEvents, '', '', '', '', '', '', '', '', '', '', '', 'report summary', ''],
        [
            'summary',
            audience,
            generatedAt,
            '',
            '',
            'permissionDenied',
            summary.permissionDenied,
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            'report summary',
            '',
        ],
        ['summary', audience, generatedAt, '', '', 'authEvents', summary.authEvents, '', '', '', '', '', '', '', '', '', '', '', 'report summary', ''],
        [
            'summary',
            audience,
            generatedAt,
            '',
            '',
            'settingsChanges',
            summary.settingsChanges,
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            'report summary',
            '',
        ],
        [
            'summary',
            audience,
            generatedAt,
            '',
            '',
            'customerChanges',
            summary.customerChanges,
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            'report summary',
            '',
        ],
        ['summary', audience, generatedAt, '', '', 'staffChanges', summary.staffChanges, '', '', '', '', '', '', '', '', '', '', '', 'report summary', ''],
        ['summary', audience, generatedAt, '', '', 'aiEvents', summary.aiEvents, '', '', '', '', '', '', '', '', '', '', '', 'report summary', ''],
        ['summary', audience, generatedAt, '', '', 'offlineEvents', summary.offlineEvents, '', '', '', '', '', '', '', '', '', '', '', 'report summary', ''],
    ];
    for (const [action, count] of actionBreakdown) {
        rows.push(['breakdown', audience, generatedAt, '', '', 'action', action, '', '', '', '', '', '', '', '', '', count, '', 'action breakdown', '']);
    }
    for (const [source, count] of sourceBreakdown) {
        rows.push(['breakdown', audience, generatedAt, '', '', 'source', source, '', '', '', '', '', '', '', '', '', count, '', 'source breakdown', '']);
    }
    for (const [staff, count] of staffBreakdown) {
        rows.push(['breakdown', audience, generatedAt, '', '', 'staff', staff, '', '', '', '', '', '', '', '', '', count, '', 'staff breakdown', '']);
    }
    for (const [reason, count] of stockReasonBreakdown) {
        rows.push(['breakdown', audience, generatedAt, '', '', 'stockReason', reason, '', '', '', '', '', '', '', '', '', count, '', 'stock breakdown', '']);
    }
    for (const item of items) {
        rows.push([
            'activity',
            audience,
            generatedAt,
            item.createdAt,
            item.kind,
            item.title,
            item.subtitle || item.reasonCode || '',
            item.staffId,
            item.staffName,
            item.customerId,
            item.productId,
            item.saleId,
            item.registerId,
            item.deviceId,
            item.localReceiptNumber,
            item.source,
            amountForReport(item),
            item.quantityDelta,
            reviewFocusForReport(audience, item),
            item.note || (item.details ? JSON.stringify(item.details) : ''),
        ]);
    }
    const pdfBase64 = createSimplePdfBase64(`MasePOS ${audience} audit and accounting activity pack`, [
        {
            heading: 'Summary',
            rows: [
                `Rows: ${summary.totalRows}`,
                `Audit events: ${summary.auditEvents}`,
                `Stock movements: ${summary.stockMovements}`,
                `Sales events: ${summary.salesEvents}`,
                `Cash and wallet events: ${summary.cashEvents}`,
                `Permission denied: ${summary.permissionDenied}`,
                `Auth events: ${summary.authEvents}`,
                `Settings changes: ${summary.settingsChanges}`,
                `Customer changes: ${summary.customerChanges}`,
                `Staff changes: ${summary.staffChanges}`,
                `AI events: ${summary.aiEvents}`,
                `Offline events: ${summary.offlineEvents}`,
            ],
        },
        {
            heading: 'Action breakdown',
            rows: actionBreakdown.length
                ? actionBreakdown.slice(0, 16).map(([action, count]) => [action, `${count} event${count === 1 ? '' : 's'}`])
                : ['No audit actions in this report pack.'],
        },
        {
            heading: 'Source breakdown',
            rows: sourceBreakdown.length
                ? sourceBreakdown.slice(0, 12).map(([source, count]) => [source, `${count} row${count === 1 ? '' : 's'}`])
                : ['No source metadata in this report pack.'],
        },
        {
            heading: 'Staff breakdown',
            rows: staffBreakdown.length
                ? staffBreakdown.slice(0, 12).map(([staff, count]) => [staff, `${count} row${count === 1 ? '' : 's'}`])
                : ['No staff metadata in this report pack.'],
        },
        {
            heading: 'Stock reason breakdown',
            rows: stockReasonBreakdown.length
                ? stockReasonBreakdown.slice(0, 12).map(([reason, count]) => [reason, `${count} movement${count === 1 ? '' : 's'}`])
                : ['No stock movements in this report pack.'],
        },
        {
            heading: 'Activity detail',
            rows: items
                .slice(0, 30)
                .map((item: any) => [
                    item.createdAt,
                    item.kind,
                    reportLabel(item.title),
                    reviewFocusForReport(audience, item),
                    item.staffName || item.staffId || 'No staff',
                    item.customerId || item.productId || item.saleId || item.registerId || item.deviceId || 'No entity',
                    item.kind === 'stock' ? `qty ${formatReportQuantity(item.quantityDelta)}` : `amount ${formatReportAmount(amountForReport(item))}`,
                ]),
        },
    ]);
    return {
        filename: `masepos-${audience}-audit-report-${new Date().toISOString().slice(0, 10)}.csv`,
        pdfFilename: `masepos-${audience}-audit-report-${new Date().toISOString().slice(0, 10)}.pdf`,
        mimeType: 'text/csv',
        pdfMimeType: 'application/pdf',
        audience,
        count: items.length,
        summary,
        csv: [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n'),
        pdfBase64,
        generatedAt,
    };
}
