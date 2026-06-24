import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
export type SchemaRequirement = {
    table: string;
    columns: string[];
    reason: string;
};
export type SchemaVerificationResult = {
    provider: 'postgres';
    checkedAt: string;
    checkedTables: number;
    checkedColumns: number;
    missingTables: string[];
    missingColumns: Array<{
        table: string;
        column: string;
    }>;
    ok: boolean;
};
export type QueryRunner = (sql: string, params?: any[]) => Promise<any[]>;
export const REQUIRED_SCHEMA_CHECKS: SchemaRequirement[] = [
    {
        table: 'staff',
        columns: ['password_hash', 'security_pin_hash', 'two_factor_enabled', 'two_factor_secret', 'two_factor_confirmed_at'],
        reason: 'password login, sensitive action re-auth, and two-factor controls',
    },
    {
        table: 'refresh_token_sessions',
        columns: ['token_hash', 'expires_at', 'revoked_at', 'last_used_at'],
        reason: 'session rotation and revocation',
    },
    {
        table: 'audit_events',
        columns: ['tenant_id', 'action', 'entity_type', 'entity_id', 'staff_id', 'details', 'created_at'],
        reason: 'immutable audit trail',
    },
    {
        table: 'stock_movements',
        columns: ['tenant_id', 'product_id', 'quantity_delta', 'reason', 'reason_code', 'location_id', 'sale_id', 'staff_id', 'created_at'],
        reason: 'stock ledger, variances, receiving, and location stock',
    },
    {
        table: 'manager_tasks',
        columns: ['task_type', 'status', 'source_type', 'source_id', 'assigned_to', 'decision_note', 'details', 'due_at'],
        reason: 'manager approval and Action Center workflows',
    },
    {
        table: 'sale_payments',
        columns: [
            'method',
            'amount',
            'provider',
            'provider_device_id',
            'provider_reference',
            'authorization_code',
            'provider_status',
            'provider_note',
            'qr_payload',
        ],
        reason: 'split tenders and provider reconciliation',
    },
    {
        table: 'inventory_locations',
        columns: ['tenant_id', 'name', 'is_default', 'status'],
        reason: 'multi-location stock',
    },
    {
        table: 'product_location_stock',
        columns: ['tenant_id', 'product_id', 'location_id', 'quantity', 'min_stock'],
        reason: 'location-specific quantities and reorder thresholds',
    },
    {
        table: 'stock_batches',
        columns: ['tenant_id', 'product_id', 'batch_number', 'received_quantity', 'remaining_quantity', 'unit_cost', 'expiry_date', 'location_id', 'status'],
        reason: 'batch, expiry, and supplier invoice traceability',
    },
    {
        table: 'stock_transfer_orders',
        columns: ['tenant_id', 'from_location_id', 'to_location_id', 'status', 'requested_by', 'approved_by', 'completed_at'],
        reason: 'location transfer workflow',
    },
    {
        table: 'integration_api_keys',
        columns: ['tenant_id', 'key_hash', 'key_prefix', 'status', 'scopes', 'created_at'],
        reason: 'external API access',
    },
    {
        table: 'integration_webhook_events',
        columns: ['tenant_id', 'source', 'event_type', 'idempotency_key', 'status', 'payload', 'processed_at'],
        reason: 'ERP and stock-system sync auditability',
    },
    {
        table: 'hardware_devices',
        columns: ['tenant_id', 'name', 'device_type', 'connection_type', 'status', 'connection_config', 'workstation_id'],
        reason: 'direct hardware adapter configuration',
    },
    {
        table: 'hardware_device_events',
        columns: ['tenant_id', 'device_id', 'event_type', 'status', 'request_payload', 'created_at'],
        reason: 'hardware readiness and command audit trail',
    },
    {
        table: 'realtime_pubsub_events',
        columns: ['instance_id', 'channel', 'event_name', 'payload', 'created_at', 'expires_at'],
        reason: 'multi-instance Socket.IO fan-out',
    },
    {
        table: 'ai_agent_runs',
        columns: ['tenant_id', 'mode', 'status', 'requires_human_approval', 'full_autopilot', 'apply_result', 'created_at'],
        reason: 'persisted AI proposal runs',
    },
    {
        table: 'ai_agent_run_steps',
        columns: ['tenant_id', 'run_id', 'step_id', 'step_type', 'risk', 'approved', 'status', 'payload', 'result'],
        reason: 'per-step AI approval and execution trace',
    },
    {
        table: 'products',
        columns: ['tenant_id', 'name', 'price', 'cost_price', 'stock', 'min_stock', 'barcode'],
        reason: 'test tenant catalog and checkout',
    },
    {
        table: 'customers',
        columns: ['tenant_id', 'name', 'email', 'wallet_balance', 'account_enabled', 'loyalty_points'],
        reason: 'test tenant customer and loyalty scenarios',
    },
    {
        table: 'sales',
        columns: ['tenant_id', 'staff_id', 'customer_id', 'status', 'total', 'is_tab', 'table_number', 'offline_event_id'],
        reason: 'checkout, tabs, and offline recovery',
    },
    {
        table: 'sale_items',
        columns: ['sale_id', 'product_id', 'quantity', 'price', 'status', 'workstation_id'],
        reason: 'line-level checkout and kitchen routing',
    },
    {
        table: 'table_sections',
        columns: ['tenant_id', 'name', 'color', 'order'],
        reason: 'restaurant table setup',
    },
    {
        table: 'restaurant_tables',
        columns: ['tenant_id', 'section_id', 'label', 'status'],
        reason: 'restaurant floor and handheld flows',
    },
];
export function buildTableLookupQuery(table: string) {
    return {
        sql: 'SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1 LIMIT 1',
        params: [table],
    };
}
export function buildColumnLookupQuery(table: string, column: string) {
    return {
        sql: 'SELECT column_name AS columnName FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2 LIMIT 1',
        params: [table, column],
    };
}
function hasRows(rows: unknown) {
    return Array.isArray(rows) && rows.length > 0;
}
export async function verifyRequiredSchema(runQuery: QueryRunner, checkedAt = new Date().toISOString()): Promise<SchemaVerificationResult> {
    const missingTables: string[] = [];
    const missingColumns: Array<{
        table: string;
        column: string;
    }> = [];
    let checkedColumns = 0;
    for (const requirement of REQUIRED_SCHEMA_CHECKS) {
        const tableLookup = buildTableLookupQuery(requirement.table);
        const tableRows = await runQuery(tableLookup.sql, tableLookup.params);
        if (!hasRows(tableRows)) {
            missingTables.push(requirement.table);
            checkedColumns += requirement.columns.length;
            continue;
        }
        for (const column of requirement.columns) {
            checkedColumns += 1;
            const columnLookup = buildColumnLookupQuery(requirement.table, column);
            const columnRows = await runQuery(columnLookup.sql, columnLookup.params);
            if (!hasRows(columnRows)) {
                missingColumns.push({ table: requirement.table, column });
            }
        }
    }
    return {
        provider: 'postgres',
        checkedAt,
        checkedTables: REQUIRED_SCHEMA_CHECKS.length,
        checkedColumns,
        missingTables,
        missingColumns,
        ok: missingTables.length === 0 && missingColumns.length === 0,
    };
}
export function summarizeSchemaVerification(result: SchemaVerificationResult) {
    if (result.ok) {
        return `Schema verification passed for ${result.provider}: ${result.checkedTables} tables and ${result.checkedColumns} columns checked.`;
    }
    const parts: string[] = [];
    if (result.missingTables.length > 0) {
        parts.push(`missing tables: ${result.missingTables.join(', ')}`);
    }
    if (result.missingColumns.length > 0) {
        parts.push(`missing columns: ${result.missingColumns.map((item) => `${item.table}.${item.column}`).join(', ')}`);
    }
    return `Schema verification failed for ${result.provider}: ${parts.join('; ')}.`;
}
export function isDirectRun(metaUrl: string, argv: string[]) {
    return Boolean(argv[1]) && fileURLToPath(metaUrl) === path.resolve(argv[1]);
}
export async function runSchemaVerificationCli() {
    dotenv.config({ override: false });
    const db = await import('../server/db.js');
    const result = await verifyRequiredSchema((sql, params) => db.query(sql, params || []));
    console.log(JSON.stringify(result, null, 2));
    const summary = summarizeSchemaVerification(result);
    if (!result.ok) {
        console.error(summary);
        process.exitCode = 1;
        return;
    }
    console.log(summary);
}
if (isDirectRun(import.meta.url, process.argv)) {
    runSchemaVerificationCli()
        .then(() => process.exit(process.exitCode || 0))
        .catch((err) => {
            console.error('Production schema verification failed:', err);
            process.exit(1);
        });
}
