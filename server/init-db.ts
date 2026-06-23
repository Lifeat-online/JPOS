import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { query } from "./db.js";
import { ensureLicenceSchema } from "./licenceSchema.js";
import { ensurePushNotificationSchema } from "./pushNotifications.js";
import { ensureRealtimePubsubSchema } from "./realtimePubsub.js";

dotenv.config();

const POSTGRES_FALLBACK_SCHEMA = String.raw`CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS slugs (
  slug TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_token_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  replaced_by_token_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS app_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  payfast_merchant_id TEXT DEFAULT '10000100',
  payfast_merchant_key TEXT DEFAULT '46f0cd694581a',
  payfast_passphrase TEXT DEFAULT 'jt7v60h69n8a1',
  payfast_sandbox SMALLINT DEFAULT 1 CHECK (payfast_sandbox IN (0, 1)),
  business TEXT DEFAULT '{}'::TEXT,
  setup_completed SMALLINT DEFAULT 0 CHECK (setup_completed IN (0, 1)),
  categories TEXT DEFAULT '{}'::TEXT,
  slug TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(12,2) DEFAULT 0,
  section TEXT,
  category TEXT,
  sub_category TEXT,
  stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  image_url TEXT,
  barcode TEXT,
  workstation_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  loyalty_points INTEGER DEFAULT 0,
  wallet_balance NUMERIC(12,2) DEFAULT 0,
  account_enabled SMALLINT DEFAULT 0 CHECK (account_enabled IN (0, 1)),
  account_limit NUMERIC(12,2) DEFAULT 0,
  account_balance NUMERIC(12,2) DEFAULT 0,
  uid TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'cashier' CHECK (role IN ('admin','cashier','manager','chef','dev')),
  email TEXT NOT NULL,
  password_hash TEXT,
  security_pin_hash TEXT,
  two_factor_enabled SMALLINT DEFAULT 0 CHECK (two_factor_enabled IN (0, 1)),
  two_factor_secret TEXT,
  two_factor_confirmed_at TIMESTAMPTZ,
  phone TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
  permissions TEXT DEFAULT '{}'::TEXT,
  assigned_sections TEXT DEFAULT '[]'::TEXT,
  assigned_categories TEXT DEFAULT '[]'::TEXT,
  id_number TEXT,
  pay_rate NUMERIC(12,2) DEFAULT 0,
  pay_type TEXT CHECK (pay_type IN ('hourly','salary')),
  accumulated_leave INTEGER DEFAULT 0,
  wallet_balance NUMERIC(12,2) DEFAULT 0,
  metrics TEXT DEFAULT '{}'::TEXT,
  badges TEXT DEFAULT '[]'::TEXT,
  rank TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workstations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'other' CHECK (type IN ('kitchen','bar','other')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS companion_device_assignments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  workstation_id TEXT NOT NULL REFERENCES workstations(id) ON DELETE CASCADE,
  default_mode TEXT DEFAULT 'wireless_scanner' CHECK (default_mode IN ('wireless_scanner','pole_display')),
  assigned_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, device_id)
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id TEXT,
  user_id TEXT,
  staff_id TEXT,
  total NUMERIC(12,2) DEFAULT 0,
  subtotal NUMERIC(12,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  tax_rate NUMERIC(5,2) DEFAULT 0,
  tax_inclusive SMALLINT DEFAULT 0 CHECK (tax_inclusive IN (0, 1)),
  payment_method TEXT DEFAULT 'pending' CHECK (payment_method IN ('cash','payfast','card','wallet','account','qr','bnpl','pending')),
  tendered_amount NUMERIC(12,2) DEFAULT 0,
  change_amount NUMERIC(12,2) DEFAULT 0,
  tip_amount NUMERIC(12,2) DEFAULT 0,
  cash_out_amount NUMERIC(12,2) DEFAULT 0,
  points_discount NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','open','kitchen')),
  payfast_payment_id TEXT,
  table_number TEXT,
  is_tab SMALLINT DEFAULT 0 CHECK (is_tab IN (0, 1)),
  tab_name TEXT,
  offline_event_id TEXT,
  sync_source TEXT DEFAULT 'online',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id TEXT,
  product_name TEXT NOT NULL,
  price NUMERIC(12,2) DEFAULT 0,
  quantity INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','ready','delivered')),
  workstation_id TEXT,
  ordered_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  action_staff_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('uber_eats','mr_d')),
  external_order_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','accepted','preparing','ready','dispatched','completed','cancelled')),
  customer_name TEXT,
  customer_phone TEXT,
  delivery_address TEXT,
  subtotal NUMERIC(12,2) DEFAULT 0,
  delivery_fee NUMERIC(12,2) DEFAULT 0,
  tip_amount NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'ZAR',
  placed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  sale_id TEXT REFERENCES sales(id) ON DELETE SET NULL,
  raw_payload TEXT DEFAULT '{}'::TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, provider, external_order_id)
);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_status
  ON delivery_orders (tenant_id, status, placed_at);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_provider
  ON delivery_orders (tenant_id, provider, placed_at);

CREATE TABLE IF NOT EXISTS delivery_order_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  delivery_order_id TEXT NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
  external_item_id TEXT,
  product_id TEXT,
  product_name TEXT NOT NULL,
  quantity NUMERIC(12,3) DEFAULT 1,
  price NUMERIC(12,2) DEFAULT 0,
  note TEXT,
  modifiers TEXT DEFAULT '[]'::TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_delivery_order_items_order
  ON delivery_order_items (tenant_id, delivery_order_id);

CREATE TABLE IF NOT EXISTS cash_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL,
  staff_name TEXT,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  reconciled_at TIMESTAMPTZ,
  reconciled_by TEXT,
  opening_float NUMERIC(12,2) DEFAULT 0,
  opening_breakdown TEXT DEFAULT '{}'::TEXT,
  expected_cash NUMERIC(12,2) DEFAULT 0,
  actual_cash NUMERIC(12,2) DEFAULT 0,
  closing_breakdown TEXT DEFAULT '{}'::TEXT,
  difference NUMERIC(12,2) DEFAULT 0,
  accumulated_tips NUMERIC(12,2) DEFAULT 0,
  net_tips NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','closed')),
  review_status TEXT DEFAULT 'in_progress' CHECK (review_status IN ('in_progress','submitted','reviewed','reconciled','disputed')),
  notes TEXT,
  manager_notes TEXT,
  variance_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cash_movements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cash_session_id TEXT NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('opening_float','cash_sale','refund','cash_drop','cash_added','cash_removed','cash_out','tip','manager_adjustment','no_sale','wallet_cash_in','wallet_cash_out')),
  direction TEXT NOT NULL DEFAULT 'neutral' CHECK (direction IN ('in','out','neutral')),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  sale_id TEXT,
  payment_id TEXT,
  staff_id TEXT,
  staff_name TEXT,
  created_by TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS manager_cash_movements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('safe_drop','cash_added','petty_cash','payout','wallet_cash_in','wallet_cash_out','register_close','manager_adjustment','transfer')),
  direction TEXT NOT NULL DEFAULT 'neutral' CHECK (direction IN ('in','out','neutral')),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_session_id TEXT REFERENCES cash_sessions(id) ON DELETE SET NULL,
  staff_id TEXT,
  staff_name TEXT,
  customer_id TEXT,
  customer_name TEXT,
  source_type TEXT DEFAULT 'manager_float',
  cash_source TEXT DEFAULT 'manager_float',
  reference_id TEXT,
  category TEXT,
  note TEXT,
  receipt_attachment_url TEXT,
  receipt_attachment_name TEXT,
  counted_breakdown TEXT DEFAULT '{}'::TEXT,
  approved_by TEXT,
  approved_by_name TEXT,
  approved_at TIMESTAMPTZ,
  created_by TEXT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cash_custody_transfers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_confirmation' CHECK (status IN ('pending_confirmation','confirmed','cancelled')),
  from_type TEXT NOT NULL CHECK (from_type IN ('register','staff','manager_float','safe','petty_cash')),
  from_id TEXT,
  from_name TEXT,
  to_type TEXT NOT NULL CHECK (to_type IN ('register','staff','manager_float','safe','petty_cash')),
  to_id TEXT,
  to_name TEXT,
  cash_session_id TEXT REFERENCES cash_sessions(id) ON DELETE SET NULL,
  expected_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  counted_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  variance NUMERIC(12,2) NOT NULL DEFAULT 0,
  counted_breakdown TEXT DEFAULT '{}'::TEXT,
  note TEXT,
  requested_by TEXT,
  requested_by_name TEXT,
  confirmed_by TEXT,
  confirmed_by_name TEXT,
  cancelled_by TEXT,
  cancelled_by_name TEXT,
  cancel_reason TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cash_close_checkpoints (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'review_needed' CHECK (status IN ('balanced','review_needed')),
  expected_physical_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  counted_physical_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  variance NUMERIC(12,2) NOT NULL DEFAULT 0,
  manager_float NUMERIC(12,2) NOT NULL DEFAULT 0,
  open_register_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  pending_cash_up_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  wallet_liability NUMERIC(12,2) NOT NULL DEFAULT 0,
  pending_payouts NUMERIC(12,2) NOT NULL DEFAULT 0,
  petty_cash_today NUMERIC(12,2) NOT NULL DEFAULT 0,
  wallet_cash_in_today NUMERIC(12,2) NOT NULL DEFAULT 0,
  wallet_cash_out_today NUMERIC(12,2) NOT NULL DEFAULT 0,
  custody_pending_count INTEGER NOT NULL DEFAULT 0,
  custody_variance_today NUMERIC(12,2) NOT NULL DEFAULT 0,
  unresolved_items TEXT DEFAULT '[]'::TEXT,
  counted_breakdown TEXT DEFAULT '{}'::TEXT,
  note TEXT,
  closed_by TEXT,
  closed_by_name TEXT,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, business_date)
);

CREATE TABLE IF NOT EXISTS customer_payout_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id TEXT,
  customer_name TEXT,
  customer_email TEXT,
  amount NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paid')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processed_by TEXT,
  note TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_by TEXT DEFAULT '[]'::TEXT,
  is_dev_broadcast SMALLINT DEFAULT 0 CHECK (is_dev_broadcast IN (0, 1)),
  is_system SMALLINT DEFAULT 0 CHECK (is_system IN (0, 1))
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vendor_id TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sent','received','cancelled')),
  type TEXT DEFAULT 'once_off' CHECK (type IN ('once_off','recurring')),
  recurring_frequency TEXT CHECK (recurring_frequency IN ('weekly','monthly')),
  items TEXT NOT NULL,
  total_amount NUMERIC(12,2) DEFAULT 0,
  expected_delivery_date TIMESTAMPTZ,
  invoice_status TEXT DEFAULT 'unpaid' CHECK (invoice_status IN ('unpaid','paid')),
  invoice_number TEXT,
  invoice_date TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  received_by TEXT,
  received_by_name TEXT,
  receiving_note TEXT,
  received_total_amount NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_batches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  purchase_order_id TEXT,
  vendor_id TEXT,
  supplier_invoice_number TEXT,
  supplier_invoice_date DATE,
  batch_number TEXT,
  received_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  remaining_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12,2) DEFAULT 0,
  expiry_date DATE,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  received_by TEXT,
  received_by_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','depleted','expired')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payout_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_id TEXT,
  staff_name TEXT,
  customer_id TEXT,
  customer_name TEXT,
  customer_email TEXT,
  amount NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paid')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processed_by TEXT,
  note TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS table_sections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  section_id TEXT,
  capacity INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_payments (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('cash','payfast','card','wallet','account','qr','bnpl')),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tendered_amount NUMERIC(12,2) DEFAULT 0,
  change_amount NUMERIC(12,2) DEFAULT 0,
  tip_amount NUMERIC(12,2) DEFAULT 0,
  cash_out_amount NUMERIC(12,2) DEFAULT 0,
  provider TEXT,
  provider_device_id TEXT,
  provider_reference TEXT,
  authorization_code TEXT,
  provider_status TEXT DEFAULT 'confirmed',
  provider_note TEXT,
  qr_payload TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO tenants (id, name) VALUES ('default', 'Default Tenant')
ON CONFLICT (id) DO NOTHING;

INSERT INTO staff (id, tenant_id, name, role, email, password_hash, status)
VALUES (
  'admin',
  'default',
  'Admin',
  'dev',
  'jameskoen78@gmail.com',
  '$2b$10$cllz1VjHJl97oeAyzvZWsOpYd66l7kaOXG977GZ6yDT6C58SgMf9S',
  'active'
)
ON CONFLICT (id) DO NOTHING;`;

export async function initDb() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  // In production (dist/server), the db folder is at ../../db
  // In dev (server), the db folder is at ../db
  const isProd = currentDir.includes("dist");
  const schemaPath = path.join(
    currentDir,
    isProd ? ".." : "",
    "..",
    "db",
    "schema.postgres.sql"
  );
  
  const sql = fs.existsSync(schemaPath)
    ? fs.readFileSync(schemaPath, "utf8")
    : POSTGRES_FALLBACK_SCHEMA;
  const sqlWithoutLineComments = sql
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return true;
      if (trimmed.startsWith("--")) return false;
      if (trimmed.startsWith("#")) return false;
      return true;
    })
    .join("\n");

  const statements = sqlWithoutLineComments
    .split(/;\s*(?:\r?\n|$)/)
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);

  for (const statement of statements) {
    console.log("Executing:", statement.split("\n")[0]);
    await query(statement);
  }

  await ensureStaffPermissionsSchema();
  await ensureRefreshTokenSessionSchema();
  await ensureSensitiveActionSchema();
  await ensureTwoFactorSchema();
  await ensureStaffSchedulingSchema();
  await ensureTipPoolingSchema();
  await ensureStaffPerformanceSchema();
  await ensureLicenceSchema();
  await ensureRetentionPolicySchema();
  await ensureSalePaymentsTable();
  await ensureCustomerAccountSchema();
  await ensurePersonDiscountSchema();
  await ensureCustomerPrivacySchema();
  await ensureCustomerConsentSchema();
  await ensureLoyaltySchema();
  await ensurePromotionSchema();
  await ensureCashManagementSchema();
  await ensureRefundSchema();
  await ensureOfflineSaleSyncSchema();
  await ensureAuditAndStockLedgerSchema();
  await ensureLaybySchema();
  await ensureManagerTaskSchema();
  await ensureStockTakeSchema();
  await ensureBulkInventorySchema();
  await ensurePurchaseOrderReceivingSchema();
  await ensureEventBookingSchema();
  await ensureStockBatchSchema();
  await ensureReorderRecommendationSchema();
  await ensureMultiLocationInventorySchema();
  await ensureReorderNotificationRuleSchema();
  await ensureDeliveryIntegrationSchema();
  await ensureIntegrationAccessSchema();
  await ensureHardwareDeviceSchema();
  await ensureRealtimePubsubSchema();
  await ensureTaxPeriodSchema();
  await ensurePushNotificationSchema();
  await ensureAiSchema();
}

export { ensurePushNotificationSchema, ensureRealtimePubsubSchema };

export async function ensureDeliveryIntegrationSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS delivery_orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK (provider IN ('uber_eats','mr_d')),
      external_order_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','accepted','preparing','ready','dispatched','completed','cancelled')),
      customer_name TEXT,
      customer_phone TEXT,
      delivery_address TEXT,
      subtotal NUMERIC(12,2) DEFAULT 0,
      delivery_fee NUMERIC(12,2) DEFAULT 0,
      tip_amount NUMERIC(12,2) DEFAULT 0,
      discount_amount NUMERIC(12,2) DEFAULT 0,
      total NUMERIC(12,2) DEFAULT 0,
      currency TEXT DEFAULT 'ZAR',
      placed_at TIMESTAMPTZ,
      accepted_at TIMESTAMPTZ,
      due_at TIMESTAMPTZ,
      sale_id TEXT REFERENCES sales(id) ON DELETE SET NULL,
      raw_payload TEXT DEFAULT '{}'::TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, provider, external_order_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_delivery_orders_status ON delivery_orders (tenant_id, status, placed_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_delivery_orders_provider ON delivery_orders (tenant_id, provider, placed_at)`);
  await query(`
    CREATE TABLE IF NOT EXISTS delivery_order_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      delivery_order_id TEXT NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
      external_item_id TEXT,
      product_id TEXT,
      product_name TEXT NOT NULL,
      quantity NUMERIC(12,3) DEFAULT 1,
      price NUMERIC(12,2) DEFAULT 0,
      note TEXT,
      modifiers TEXT DEFAULT '[]'::TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_delivery_order_items_order ON delivery_order_items (tenant_id, delivery_order_id)`);
}

export async function ensureIntegrationAccessSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS integration_api_keys (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      scopes TEXT DEFAULT '[]'::TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
      last_used_at TIMESTAMPTZ,
      created_by TEXT,
      created_by_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      revoked_at TIMESTAMPTZ,
      revoked_by TEXT,
      revoked_by_name TEXT
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_integration_api_keys_tenant ON integration_api_keys (tenant_id, status, created_at)`);
  await query(`
    CREATE TABLE IF NOT EXISTS integration_webhook_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      api_key_id TEXT REFERENCES integration_api_keys(id) ON DELETE SET NULL,
      source TEXT NOT NULL,
      event_type TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','applied','failed','duplicate')),
      entity_type TEXT,
      entity_id TEXT,
      payload TEXT DEFAULT '{}'::TEXT,
      result TEXT DEFAULT '{}'::TEXT,
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      processed_at TIMESTAMPTZ,
      UNIQUE (tenant_id, source, idempotency_key)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_integration_webhook_events_tenant ON integration_webhook_events (tenant_id, created_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_integration_webhook_events_status ON integration_webhook_events (tenant_id, status, created_at)`);
}

export async function ensureRefreshTokenSessionSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS refresh_token_sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      staff_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      ip_address TEXT,
      user_agent TEXT,
      expires_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      revoked_reason TEXT,
      replaced_by_token_hash TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_used_at TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_refresh_token_sessions_staff ON refresh_token_sessions (tenant_id, staff_id, revoked_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_refresh_token_sessions_token_hash ON refresh_token_sessions (token_hash)`);
}

export async function ensureSensitiveActionSchema() {
  await query(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS security_pin_hash TEXT`);
}

export async function ensureTwoFactorSchema() {
  await query(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS two_factor_enabled SMALLINT DEFAULT 0`);
  await query(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS two_factor_secret TEXT`);
  await query(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS two_factor_confirmed_at TIMESTAMPTZ`);
  await query(`UPDATE staff SET two_factor_enabled = COALESCE(two_factor_enabled, 0)`);
}

export async function ensureRetentionPolicySchema() {
  await query(`ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS retention_policy TEXT DEFAULT '{}'::TEXT`);
  await query(`UPDATE app_settings SET retention_policy = COALESCE(retention_policy, '{}'::TEXT)`);
}

export async function ensureCustomerPrivacySchema() {
  await query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_anonymized SMALLINT DEFAULT 0`);
  await query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ`);
  await query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS anonymized_by TEXT`);
  await query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS anonymized_by_name TEXT`);
  await query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS anonymization_reason TEXT`);
  await query(`UPDATE customers SET is_anonymized = COALESCE(is_anonymized, 0)`);
}

export async function ensureCustomerConsentSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS customer_consents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      consent_type TEXT NOT NULL CHECK (consent_type IN ('loyalty','marketing','customer_portal','stored_contact_details','promotions','ai_recommendations')),
      status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown','granted','denied','revoked')),
      source TEXT,
      note TEXT,
      captured_by TEXT,
      captured_by_name TEXT,
      captured_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, customer_id, consent_type)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_customer_consents_customer ON customer_consents (tenant_id, customer_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_customer_consents_status ON customer_consents (tenant_id, consent_type, status)`);
  await query(`
    CREATE TABLE IF NOT EXISTS customer_consent_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      consent_type TEXT NOT NULL CHECK (consent_type IN ('loyalty','marketing','customer_portal','stored_contact_details','promotions','ai_recommendations')),
      previous_status TEXT DEFAULT 'unknown' CHECK (previous_status IN ('unknown','granted','denied','revoked')),
      status TEXT NOT NULL CHECK (status IN ('unknown','granted','denied','revoked')),
      source TEXT,
      note TEXT,
      captured_by TEXT,
      captured_by_name TEXT,
      captured_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_customer_consent_events_customer ON customer_consent_events (tenant_id, customer_id, created_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_customer_consent_events_type ON customer_consent_events (tenant_id, consent_type, created_at)`);
}

export async function ensurePurchaseOrderReceivingSchema() {
  await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS invoice_number TEXT`);
  await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS invoice_date TIMESTAMPTZ`);
  await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ`);
  await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_by TEXT`);
  await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_by_name TEXT`);
  await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS receiving_note TEXT`);
  await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_total_amount NUMERIC(12,2) DEFAULT 0`);
  await query(`UPDATE purchase_orders SET received_total_amount = COALESCE(received_total_amount, 0)`);
}

export async function ensureEventBookingSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS event_bookings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      customer_id TEXT,
      customer_name TEXT,
      contact_phone TEXT,
      contact_email TEXT,
      title TEXT NOT NULL,
      event_type TEXT NOT NULL DEFAULT 'private' CHECK (event_type IN ('private','public','restaurant','catering','other')),
      status TEXT NOT NULL DEFAULT 'inquiry' CHECK (status IN ('inquiry','confirmed','in_progress','completed','cancelled')),
      start_at TIMESTAMPTZ NOT NULL,
      end_at TIMESTAMPTZ,
      guest_count INTEGER DEFAULT 0,
      table_numbers TEXT DEFAULT '[]'::TEXT,
      table_ids TEXT DEFAULT '[]'::TEXT,
      deposit_amount NUMERIC(12,2) DEFAULT 0,
      deposit_status TEXT DEFAULT 'none' CHECK (deposit_status IN ('none','unpaid','paid','refunded')),
      deposit_due_at TIMESTAMPTZ,
      deposit_paid_at TIMESTAMPTZ,
      deposit_reference TEXT,
      menu_notes TEXT,
      internal_notes TEXT,
      reminder_at TIMESTAMPTZ,
      reminder_status TEXT DEFAULT 'none' CHECK (reminder_status IN ('none','pending','sent','failed','skipped')),
      reminder_sent_at TIMESTAMPTZ,
      reminder_note TEXT,
      created_by TEXT,
      created_by_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE event_bookings ADD COLUMN IF NOT EXISTS table_ids TEXT DEFAULT '[]'::TEXT`);
  await query(`ALTER TABLE event_bookings ADD COLUMN IF NOT EXISTS deposit_due_at TIMESTAMPTZ`);
  await query(`ALTER TABLE event_bookings ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMPTZ`);
  await query(`ALTER TABLE event_bookings ADD COLUMN IF NOT EXISTS deposit_reference TEXT`);
  await query(`ALTER TABLE event_bookings ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ`);
  await query(`ALTER TABLE event_bookings ADD COLUMN IF NOT EXISTS reminder_status TEXT DEFAULT 'none'`);
  await query(`ALTER TABLE event_bookings ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ`);
  await query(`ALTER TABLE event_bookings ADD COLUMN IF NOT EXISTS reminder_note TEXT`);
  await query(`UPDATE event_bookings SET table_ids = COALESCE(table_ids, '[]'::TEXT), reminder_status = COALESCE(reminder_status, 'none')`);
  await query(`CREATE INDEX IF NOT EXISTS idx_event_bookings_calendar ON event_bookings (tenant_id, start_at, status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_event_bookings_customer ON event_bookings (tenant_id, customer_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_event_bookings_deposits ON event_bookings (tenant_id, deposit_status, deposit_due_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_event_bookings_reminders ON event_bookings (tenant_id, reminder_status, reminder_at)`);
}

export async function ensureStockBatchSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS stock_batches (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      purchase_order_id TEXT,
      vendor_id TEXT,
      supplier_invoice_number TEXT,
      supplier_invoice_date DATE,
      batch_number TEXT,
      received_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
      remaining_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
      unit_cost NUMERIC(12,2) DEFAULT 0,
      expiry_date DATE,
      received_at TIMESTAMPTZ DEFAULT NOW(),
      received_by TEXT,
      received_by_name TEXT,
      location_id TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','depleted','expired')),
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_batches_tenant_expiry ON stock_batches (tenant_id, status, expiry_date)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_batches_product ON stock_batches (tenant_id, product_id, status, expiry_date)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_batches_purchase_order ON stock_batches (tenant_id, purchase_order_id)`);
  await query(`ALTER TABLE stock_batches ADD COLUMN IF NOT EXISTS location_id TEXT`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_batches_location ON stock_batches (tenant_id, location_id, status, expiry_date)`);
}

export async function ensureReorderRecommendationSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS reorder_recommendations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','approved','ordered','dismissed')),
      priority TEXT NOT NULL DEFAULT 'high' CHECK (priority IN ('low','normal','high','critical')),
      current_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
      min_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
      target_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
      recommended_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
      estimated_unit_cost NUMERIC(12,2) DEFAULT 0,
      estimated_total_cost NUMERIC(12,2) DEFAULT 0,
      avg_daily_sales NUMERIC(12,3) DEFAULT 0,
      days_of_cover INTEGER DEFAULT 14,
      vendor_id TEXT,
      location_id TEXT,
      source TEXT DEFAULT 'min_stock',
      evidence TEXT DEFAULT '[]'::TEXT,
      purchase_order_id TEXT,
      requested_by TEXT,
      requested_by_name TEXT,
      approved_by TEXT,
      approved_by_name TEXT,
      approved_at TIMESTAMPTZ,
      dismissed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_reorder_recommendations_status ON reorder_recommendations (tenant_id, status, priority, updated_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_reorder_recommendations_product ON reorder_recommendations (tenant_id, product_id, status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_reorder_recommendations_purchase_order ON reorder_recommendations (tenant_id, purchase_order_id)`);
}

export async function ensureReorderNotificationRuleSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS reorder_notification_rules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
      location_id TEXT,
      trigger_type TEXT NOT NULL DEFAULT 'below_threshold' CHECK (trigger_type IN ('below_threshold','critical_only','days_cover')),
      priority TEXT NOT NULL DEFAULT 'high' CHECK (priority IN ('normal','high','critical')),
      days_of_cover INTEGER DEFAULT 14,
      vendor_id TEXT,
      notify_roles TEXT DEFAULT '[]'::TEXT,
      last_run_at TIMESTAMPTZ,
      last_result TEXT DEFAULT '{}'::TEXT,
      created_by TEXT,
      created_by_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_reorder_notification_rules_status ON reorder_notification_rules (tenant_id, status, location_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_reorder_notification_rules_location ON reorder_notification_rules (tenant_id, location_id)`);
}

export async function ensureTaxPeriodSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS tax_periods (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      status TEXT DEFAULT 'locked' CHECK (status IN ('locked')),
      locked_at TIMESTAMPTZ DEFAULT NOW(),
      locked_by TEXT,
      locked_by_name TEXT,
      lock_note TEXT,
      currency TEXT DEFAULT 'ZAR',
      standard_rate NUMERIC(5,2) DEFAULT 15,
      gross_sales NUMERIC(12,2) DEFAULT 0,
      taxable_sales NUMERIC(12,2) DEFAULT 0,
      zero_rated_sales NUMERIC(12,2) DEFAULT 0,
      exempt_sales NUMERIC(12,2) DEFAULT 0,
      output_tax NUMERIC(12,2) DEFAULT 0,
      input_tax NUMERIC(12,2) DEFAULT 0,
      net_vat_payable NUMERIC(12,2) DEFAULT 0,
      invoice_count INTEGER DEFAULT 0,
      refund_count INTEGER DEFAULT 0,
      summary_snapshot TEXT,
      report_snapshot TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, period_start, period_end)
    )
  `);
  await query(`ALTER TABLE tax_periods ADD COLUMN IF NOT EXISTS summary_snapshot TEXT`);
  await query(`ALTER TABLE tax_periods ADD COLUMN IF NOT EXISTS report_snapshot TEXT`);
  await query(`ALTER TABLE tax_periods ADD COLUMN IF NOT EXISTS input_tax NUMERIC(12,2) DEFAULT 0`);
  await query(`ALTER TABLE tax_periods ADD COLUMN IF NOT EXISTS net_vat_payable NUMERIC(12,2) DEFAULT 0`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tax_periods_range ON tax_periods (tenant_id, period_start, period_end)`);
}

export async function ensureMultiLocationInventorySchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS inventory_locations (
      id TEXT NOT NULL,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'branch' CHECK (type IN ('branch','warehouse','register','kitchen','other')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
      is_default SMALLINT DEFAULT 0 CHECK (is_default IN (0, 1)),
      address TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (tenant_id, id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_inventory_locations_status ON inventory_locations (tenant_id, status)`);
  await query(`
    CREATE TABLE IF NOT EXISTS product_location_stock (
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
      min_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
      reorder_threshold NUMERIC(12,3) NOT NULL DEFAULT 0,
      updated_by TEXT,
      updated_by_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (tenant_id, product_id, location_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_product_location_stock_location ON product_location_stock (tenant_id, location_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_product_location_stock_reorder ON product_location_stock (tenant_id, location_id, reorder_threshold)`);
  await query(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS default_location_id TEXT`);
  await query(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS assigned_location_ids TEXT DEFAULT '[]'::TEXT`);
  await query(`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS location_id TEXT`);
  await query(`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS from_location_id TEXT`);
  await query(`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS to_location_id TEXT`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_location ON stock_movements (tenant_id, location_id, created_at)`);
  await query(`ALTER TABLE stock_batches ADD COLUMN IF NOT EXISTS location_id TEXT`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_batches_location ON stock_batches (tenant_id, location_id, status, expiry_date)`);
  await query(`
    CREATE TABLE IF NOT EXISTS stock_transfer_orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      from_location_id TEXT NOT NULL,
      to_location_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('draft','requested','approved','in_transit','completed','cancelled')),
      requested_by TEXT,
      requested_by_name TEXT,
      approved_by TEXT,
      approved_by_name TEXT,
      completed_by TEXT,
      completed_by_name TEXT,
      notes TEXT,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_transfer_orders_status ON stock_transfer_orders (tenant_id, status, updated_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_transfer_orders_locations ON stock_transfer_orders (tenant_id, from_location_id, to_location_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS stock_transfer_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      transfer_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
      from_previous_quantity NUMERIC(12,3) DEFAULT 0,
      from_new_quantity NUMERIC(12,3) DEFAULT 0,
      to_previous_quantity NUMERIC(12,3) DEFAULT 0,
      to_new_quantity NUMERIC(12,3) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer ON stock_transfer_items (tenant_id, transfer_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_product ON stock_transfer_items (tenant_id, product_id)`);
  await query(`
    INSERT INTO inventory_locations (id, tenant_id, name, type, status, is_default, created_at, updated_at)
    SELECT 'main', id, 'Primary stock pool', 'branch', 'active', 1, NOW(), NOW()
      FROM tenants
    ON CONFLICT (tenant_id, id) DO NOTHING
  `);
  await query(`
    INSERT INTO product_location_stock (
      tenant_id, product_id, location_id, quantity, min_stock, reorder_threshold, created_at, updated_at
    )
    SELECT tenant_id, id, 'main', COALESCE(stock, 0), COALESCE(min_stock, 0), COALESCE(min_stock, 0), NOW(), NOW()
      FROM products
    ON CONFLICT (tenant_id, product_id, location_id) DO NOTHING
  `);
  await query(`UPDATE reorder_recommendations SET location_id = COALESCE(location_id, 'main')`);
}

export async function ensurePersonDiscountSchema() {
  await query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) DEFAULT 0`);
  await query(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) DEFAULT 0`);
  await query(`UPDATE customers SET discount_percent = COALESCE(discount_percent, 0)`);
  await query(`UPDATE staff SET discount_percent = COALESCE(discount_percent, 0)`);
}

export async function ensureLoyaltySchema() {
  await query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS loyalty_member_status TEXT DEFAULT 'active'`);
  await query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS loyalty_tier_id TEXT`);
  await query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS membership_card_id TEXT`);
  await query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS membership_barcode TEXT`);
  await query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS membership_started_at TIMESTAMPTZ`);
  await query(`UPDATE customers SET loyalty_member_status = COALESCE(loyalty_member_status, 'active')`);
  await query(`
    CREATE TABLE IF NOT EXISTS loyalty_tiers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
      min_points INTEGER DEFAULT 0,
      earn_multiplier NUMERIC(8,3) DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_loyalty_tiers_threshold ON loyalty_tiers (tenant_id, status, min_points)`);
  await query(`
    CREATE TABLE IF NOT EXISTS loyalty_reward_rules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
      rule_type TEXT DEFAULT 'base' CHECK (rule_type IN ('base','category','product','time_window')),
      points_per_currency NUMERIC(12,4) DEFAULT 0,
      multiplier NUMERIC(8,3) DEFAULT 1,
      bonus_points INTEGER DEFAULT 0,
      min_subtotal NUMERIC(12,2) DEFAULT 0,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      target_product_ids TEXT DEFAULT '[]'::TEXT,
      target_categories TEXT DEFAULT '[]'::TEXT,
      days_of_week TEXT DEFAULT '[]'::TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_loyalty_reward_rules_status ON loyalty_reward_rules (tenant_id, status, rule_type)`);
}

export async function ensurePromotionSchema() {
  await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS promotion_id TEXT`);
  await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS promotion_code TEXT`);
  await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS promotion_discount NUMERIC(12,2) DEFAULT 0`);
  await query(`
    CREATE TABLE IF NOT EXISTS promotions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
      discount_type TEXT DEFAULT 'percent' CHECK (discount_type IN ('percent','fixed')),
      discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      min_subtotal NUMERIC(12,2) DEFAULT 0,
      max_discount_amount NUMERIC(12,2),
      applies_to TEXT DEFAULT 'cart' CHECK (applies_to IN ('cart','products','categories')),
      target_product_ids TEXT DEFAULT '[]'::TEXT,
      target_categories TEXT DEFAULT '[]'::TEXT,
      customer_scope TEXT DEFAULT 'all' CHECK (customer_scope IN ('all','selected','no_customer')),
      target_customer_ids TEXT DEFAULT '[]'::TEXT,
      total_redemption_limit INTEGER,
      per_customer_limit INTEGER,
      redemption_count INTEGER DEFAULT 0,
      created_by TEXT,
      created_by_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, code)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_promotions_status_window ON promotions (tenant_id, status, starts_at, ends_at)`);
  await query(`
    CREATE TABLE IF NOT EXISTS promotion_redemptions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      promotion_id TEXT NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
      promotion_code TEXT NOT NULL,
      sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      customer_id TEXT,
      staff_id TEXT,
      discount_amount NUMERIC(12,2) DEFAULT 0,
      subtotal NUMERIC(12,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_promotion ON promotion_redemptions (tenant_id, promotion_id, created_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_customer ON promotion_redemptions (tenant_id, promotion_id, customer_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_sale ON promotion_redemptions (tenant_id, sale_id)`);
}

export async function ensureCustomerAccountSchema() {
  await query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS account_enabled SMALLINT DEFAULT 0`);
  await query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS account_limit NUMERIC(12,2) DEFAULT 0`);
  await query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS account_balance NUMERIC(12,2) DEFAULT 0`);
  await query(`UPDATE customers SET account_enabled = COALESCE(account_enabled, 0), account_limit = COALESCE(account_limit, 0), account_balance = COALESCE(account_balance, 0)`);
  await query(`
    DO $$
    DECLARE
      constraint_name text;
    BEGIN
      SELECT con.conname INTO constraint_name
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
      WHERE rel.relname = 'sales'
        AND att.attname = 'payment_method'
        AND con.contype = 'c'
      LIMIT 1;

      IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE sales DROP CONSTRAINT %I', constraint_name);
      END IF;

      ALTER TABLE sales
        ADD CONSTRAINT sales_payment_method_check
        CHECK (payment_method IN ('cash','payfast','card','wallet','account','qr','bnpl','pending'));
    END $$;
  `);
  await query(`
    DO $$
    DECLARE
      constraint_name text;
    BEGIN
      SELECT con.conname INTO constraint_name
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
      WHERE rel.relname = 'sale_payments'
        AND att.attname = 'method'
        AND con.contype = 'c'
      LIMIT 1;

      IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE sale_payments DROP CONSTRAINT %I', constraint_name);
      END IF;

      ALTER TABLE sale_payments
        ADD CONSTRAINT sale_payments_method_check
        CHECK (method IN ('cash','payfast','card','wallet','account','qr','bnpl'));
    END $$;
  `);
}

export async function ensureStaffPermissionsSchema() {
  await query(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS permissions TEXT DEFAULT '{}'::TEXT`);
}

export async function ensureStaffSchedulingSchema() {
  await query(`CREATE TABLE IF NOT EXISTS staff_shifts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    staff_name TEXT NOT NULL,
    role TEXT,
    shift_date DATE NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft','published','cancelled','completed')),
    location_id TEXT,
    break_minutes_planned INTEGER DEFAULT 0,
    notes TEXT,
    published_at TIMESTAMPTZ,
    published_by TEXT,
    published_by_name TEXT,
    created_by TEXT,
    created_by_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_staff_shifts_roster ON staff_shifts (tenant_id, shift_date, status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_staff_shifts_staff ON staff_shifts (tenant_id, staff_id, shift_date)`);
  await query(`CREATE TABLE IF NOT EXISTS staff_attendance (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    staff_name TEXT NOT NULL,
    shift_id TEXT REFERENCES staff_shifts(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'open' CHECK (status IN ('open','closed')),
    clock_in_at TIMESTAMPTZ NOT NULL,
    clock_out_at TIMESTAMPTZ,
    break_started_at TIMESTAMPTZ,
    break_minutes INTEGER DEFAULT 0,
    scheduled_minutes INTEGER DEFAULT 0,
    worked_minutes INTEGER DEFAULT 0,
    regular_minutes INTEGER DEFAULT 0,
    overtime_minutes INTEGER DEFAULT 0,
    pay_rate NUMERIC(12,2) DEFAULT 0,
    pay_type TEXT DEFAULT 'hourly' CHECK (pay_type IN ('hourly','salary')),
    payroll_amount NUMERIC(12,2) DEFAULT 0,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff ON staff_attendance (tenant_id, staff_id, clock_in_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_staff_attendance_status ON staff_attendance (tenant_id, status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_staff_attendance_shift ON staff_attendance (tenant_id, shift_id)`);
}

export async function ensureTipPoolingSchema() {
  await query(`CREATE TABLE IF NOT EXISTS tip_pool_rules (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
    distribution_method TEXT DEFAULT 'worked_hours' CHECK (distribution_method IN ('worked_hours','equal_shift','role_weighted')),
    source TEXT DEFAULT 'sale_tips' CHECK (source IN ('sale_tips')),
    included_roles TEXT DEFAULT '[]'::TEXT,
    role_weights TEXT DEFAULT '{}'::TEXT,
    created_by TEXT,
    created_by_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tip_pool_rules_status ON tip_pool_rules (tenant_id, status)`);
  await query(`CREATE TABLE IF NOT EXISTS tip_pool_payouts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rule_id TEXT NOT NULL REFERENCES tip_pool_rules(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    staff_id TEXT NOT NULL,
    staff_name TEXT NOT NULL,
    attendance_id TEXT REFERENCES staff_attendance(id) ON DELETE SET NULL,
    shift_id TEXT REFERENCES staff_shifts(id) ON DELETE SET NULL,
    shift_date DATE,
    worked_minutes INTEGER DEFAULT 0,
    weight NUMERIC(12,4) DEFAULT 0,
    tip_pool_amount NUMERIC(12,2) DEFAULT 0,
    payout_amount NUMERIC(12,2) DEFAULT 0,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft','approved','paid','void')),
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    generated_by TEXT,
    generated_by_name TEXT,
    approved_at TIMESTAMPTZ,
    approved_by TEXT,
    approved_by_name TEXT,
    paid_at TIMESTAMPTZ,
    paid_by TEXT,
    paid_by_name TEXT,
    notes TEXT
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tip_pool_payouts_period ON tip_pool_payouts (tenant_id, period_start, period_end, status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tip_pool_payouts_staff ON tip_pool_payouts (tenant_id, staff_id, shift_date)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tip_pool_payouts_rule ON tip_pool_payouts (tenant_id, rule_id, period_start, period_end)`);
}

export async function ensureStaffPerformanceSchema() {
  await query(`CREATE TABLE IF NOT EXISTS staff_coaching_notes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    staff_name TEXT NOT NULL,
    note_type TEXT DEFAULT 'coaching' CHECK (note_type IN ('coaching','recognition','warning','follow_up')),
    title TEXT NOT NULL,
    note TEXT NOT NULL,
    source TEXT DEFAULT 'manager' CHECK (source IN ('manager','ai','performance')),
    created_by TEXT,
    created_by_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_staff_coaching_notes_staff ON staff_coaching_notes (tenant_id, staff_id, created_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_staff_coaching_notes_type ON staff_coaching_notes (tenant_id, note_type, created_at)`);
}

export async function ensureCashManagementSchema() {
  await query(`ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ`);
  await query(`ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`);
  await query(`ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS reviewed_by TEXT`);
  await query(`ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ`);
  await query(`ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS reconciled_by TEXT`);
  await query(`ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS opening_breakdown TEXT DEFAULT '{}'::TEXT`);
  await query(`ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS closing_breakdown TEXT DEFAULT '{}'::TEXT`);
  await query(`ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'in_progress'`);
  await query(`ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS manager_notes TEXT`);
  await query(`ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS variance_reason TEXT`);
  await query(`
    CREATE TABLE IF NOT EXISTS cash_movements (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      cash_session_id TEXT NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('opening_float','cash_sale','refund','cash_drop','cash_added','cash_removed','cash_out','tip','manager_adjustment','no_sale','wallet_cash_in','wallet_cash_out')),
      direction TEXT NOT NULL DEFAULT 'neutral' CHECK (direction IN ('in','out','neutral')),
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      sale_id TEXT,
      payment_id TEXT,
      staff_id TEXT,
      staff_name TEXT,
      created_by TEXT,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS manager_cash_movements (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      movement_type TEXT NOT NULL CHECK (movement_type IN ('safe_drop','cash_added','petty_cash','payout','wallet_cash_in','wallet_cash_out','register_close','manager_adjustment','transfer')),
      direction TEXT NOT NULL DEFAULT 'neutral' CHECK (direction IN ('in','out','neutral')),
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      cash_session_id TEXT REFERENCES cash_sessions(id) ON DELETE SET NULL,
      staff_id TEXT,
      staff_name TEXT,
      customer_id TEXT,
      customer_name TEXT,
      source_type TEXT DEFAULT 'manager_float',
      cash_source TEXT DEFAULT 'manager_float',
      reference_id TEXT,
      category TEXT,
      note TEXT,
      receipt_attachment_url TEXT,
      receipt_attachment_name TEXT,
      counted_breakdown TEXT DEFAULT '{}'::TEXT,
      approved_by TEXT,
      approved_by_name TEXT,
      approved_at TIMESTAMPTZ,
      created_by TEXT,
      created_by_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE manager_cash_movements ADD COLUMN IF NOT EXISTS cash_source TEXT DEFAULT 'manager_float'`);
  await query(`ALTER TABLE manager_cash_movements ADD COLUMN IF NOT EXISTS receipt_attachment_url TEXT`);
  await query(`ALTER TABLE manager_cash_movements ADD COLUMN IF NOT EXISTS receipt_attachment_name TEXT`);
  await query(`ALTER TABLE manager_cash_movements ADD COLUMN IF NOT EXISTS approved_by TEXT`);
  await query(`ALTER TABLE manager_cash_movements ADD COLUMN IF NOT EXISTS approved_by_name TEXT`);
  await query(`ALTER TABLE manager_cash_movements ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`);
  await query(`CREATE INDEX IF NOT EXISTS idx_manager_cash_tenant_created ON manager_cash_movements (tenant_id, created_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_manager_cash_reference ON manager_cash_movements (tenant_id, movement_type, reference_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_manager_cash_source ON manager_cash_movements (tenant_id, cash_source, created_at)`);
  await query(`
    CREATE TABLE IF NOT EXISTS cash_custody_transfers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending_confirmation' CHECK (status IN ('pending_confirmation','confirmed','cancelled')),
      from_type TEXT NOT NULL CHECK (from_type IN ('register','staff','manager_float','safe','petty_cash')),
      from_id TEXT,
      from_name TEXT,
      to_type TEXT NOT NULL CHECK (to_type IN ('register','staff','manager_float','safe','petty_cash')),
      to_id TEXT,
      to_name TEXT,
      cash_session_id TEXT REFERENCES cash_sessions(id) ON DELETE SET NULL,
      expected_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      counted_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      variance NUMERIC(12,2) NOT NULL DEFAULT 0,
      counted_breakdown TEXT DEFAULT '{}'::TEXT,
      note TEXT,
      requested_by TEXT,
      requested_by_name TEXT,
      confirmed_by TEXT,
      confirmed_by_name TEXT,
      cancelled_by TEXT,
      cancelled_by_name TEXT,
      cancel_reason TEXT,
      requested_at TIMESTAMPTZ DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_cash_custody_tenant_status ON cash_custody_transfers (tenant_id, status, created_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_cash_custody_session ON cash_custody_transfers (tenant_id, cash_session_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS cash_close_checkpoints (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      business_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'review_needed' CHECK (status IN ('balanced','review_needed')),
      expected_physical_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
      counted_physical_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
      variance NUMERIC(12,2) NOT NULL DEFAULT 0,
      manager_float NUMERIC(12,2) NOT NULL DEFAULT 0,
      open_register_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
      pending_cash_up_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
      wallet_liability NUMERIC(12,2) NOT NULL DEFAULT 0,
      pending_payouts NUMERIC(12,2) NOT NULL DEFAULT 0,
      petty_cash_today NUMERIC(12,2) NOT NULL DEFAULT 0,
      wallet_cash_in_today NUMERIC(12,2) NOT NULL DEFAULT 0,
      wallet_cash_out_today NUMERIC(12,2) NOT NULL DEFAULT 0,
      custody_pending_count INTEGER NOT NULL DEFAULT 0,
      custody_variance_today NUMERIC(12,2) NOT NULL DEFAULT 0,
      unresolved_items TEXT DEFAULT '[]'::TEXT,
      counted_breakdown TEXT DEFAULT '{}'::TEXT,
      note TEXT,
      closed_by TEXT,
      closed_by_name TEXT,
      closed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, business_date)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_cash_close_tenant_status ON cash_close_checkpoints (tenant_id, status, business_date)`);
  await query(`UPDATE cash_sessions SET review_status = CASE WHEN status = 'open' THEN 'in_progress' ELSE COALESCE(review_status, 'submitted') END WHERE review_status IS NULL`);
}

export async function ensureRefundSchema() {
  await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS transaction_type TEXT DEFAULT 'sale'`);
  await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS parent_sale_id TEXT`);
  await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS refund_status TEXT DEFAULT 'none'`);
  await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(12,2) DEFAULT 0`);
  await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS refund_reason TEXT`);
  await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS refunded_by TEXT`);
  await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS void_reason TEXT`);
  await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS voided_by TEXT`);
  await query(`UPDATE sales SET transaction_type = COALESCE(transaction_type, 'sale'), refund_status = COALESCE(refund_status, 'none'), refunded_amount = COALESCE(refunded_amount, 0)`);
}

export async function ensureOfflineSaleSyncSchema() {
  await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS offline_event_id TEXT`);
  await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS sync_source TEXT DEFAULT 'online'`);
  await query(`UPDATE sales SET sync_source = COALESCE(sync_source, 'online')`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_tenant_offline_event ON sales (tenant_id, offline_event_id) WHERE offline_event_id IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sales_tenant_sync_source ON sales (tenant_id, sync_source, created_at)`);
}

export async function ensureAuditAndStockLedgerSchema() {
  const stockReasonCodes = "'receiving','sale','refund','void','adjustment','count_correction','transfer','wastage','shrinkage'";
  const stockReasonBackfill = `
    UPDATE stock_movements
       SET reason_code = CASE
         WHEN LOWER(COALESCE(reason, '')) IN ('sale','sale_completed','sale_deduction','checkout') THEN 'sale'
         WHEN LOWER(COALESCE(reason, '')) IN ('refund','refund_restock','refund_reversal') THEN 'refund'
         WHEN LOWER(COALESCE(reason, '')) IN ('void','void_restock','void_reversal') THEN 'void'
         WHEN LOWER(COALESCE(reason, '')) IN ('stock_take','stocktake','cycle_count','spot_check','count_correction') THEN 'count_correction'
         WHEN LOWER(COALESCE(reason, '')) IN ('purchase_order','invoice_receiving','receiving','received') THEN 'receiving'
         WHEN LOWER(COALESCE(reason, '')) IN ('stock_transfer','transfer') THEN 'transfer'
         WHEN LOWER(COALESCE(reason, '')) IN ('waste','wastage','expired','expiry','spoiled','spoilage','damage','damaged') THEN 'wastage'
         WHEN LOWER(COALESCE(reason, '')) IN ('shrink','shrinkage','theft','loss','lost','missing') THEN 'shrinkage'
         ELSE 'adjustment'
       END
     WHERE reason_code IS NULL OR reason_code = 'adjustment'
  `;

  await query(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      related_sale_id TEXT,
      staff_id TEXT,
      staff_name TEXT,
      customer_id TEXT,
      source TEXT DEFAULT 'server',
      details TEXT DEFAULT '{}'::TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_created ON audit_events (tenant_id, created_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events (tenant_id, entity_type, entity_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_events_staff ON audit_events (tenant_id, staff_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      item_type TEXT NOT NULL DEFAULT 'product' CHECK (item_type IN ('product','bulk')),
      product_id TEXT,
      bulk_item_id TEXT,
      item_name TEXT,
      quantity_delta NUMERIC(12,3) NOT NULL DEFAULT 0,
      previous_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
      new_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      reason_code TEXT NOT NULL DEFAULT 'adjustment' CHECK (reason_code IN ('receiving','sale','refund','void','adjustment','count_correction','transfer','wastage','shrinkage')),
      reference_type TEXT,
      reference_id TEXT,
      sale_id TEXT,
      sale_item_id TEXT,
      staff_id TEXT,
      staff_name TEXT,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_created ON stock_movements (tenant_id, created_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements (tenant_id, product_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_sale ON stock_movements (tenant_id, sale_id)`);
  await query(`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS reason_code TEXT NOT NULL DEFAULT 'adjustment' CHECK (reason_code IN (${stockReasonCodes}))`);
  await query(stockReasonBackfill);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_reason_code ON stock_movements (tenant_id, reason_code, created_at)`);
}

export async function ensureLaybySchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS layby_orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      customer_name TEXT NOT NULL,
      staff_id TEXT,
      staff_name TEXT,
      status TEXT DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
      subtotal NUMERIC(12,2) DEFAULT 0,
      tax_amount NUMERIC(12,2) DEFAULT 0,
      tax_rate NUMERIC(5,2) DEFAULT 0,
      tax_inclusive SMALLINT DEFAULT 1 CHECK (tax_inclusive IN (0, 1)),
      total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      deposit_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
      balance_due NUMERIC(12,2) NOT NULL DEFAULT 0,
      refund_amount NUMERIC(12,2) DEFAULT 0,
      forfeited_amount NUMERIC(12,2) DEFAULT 0,
      due_date DATE NOT NULL,
      cancel_reason TEXT,
      cancelled_by TEXT,
      cancelled_by_name TEXT,
      cancelled_at TIMESTAMPTZ,
      completed_sale_id TEXT REFERENCES sales(id) ON DELETE SET NULL,
      completed_by TEXT,
      completed_by_name TEXT,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_layby_orders_tenant_status ON layby_orders (tenant_id, status, due_date)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_layby_orders_customer ON layby_orders (tenant_id, customer_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS layby_items (
      id TEXT PRIMARY KEY,
      layby_order_id TEXT NOT NULL REFERENCES layby_orders(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      price NUMERIC(12,2) DEFAULT 0,
      quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
      reserved_quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_layby_items_order ON layby_items (layby_order_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_layby_items_product ON layby_items (product_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS layby_payments (
      id TEXT PRIMARY KEY,
      layby_order_id TEXT NOT NULL REFERENCES layby_orders(id) ON DELETE CASCADE,
      method TEXT NOT NULL CHECK (method IN ('cash','payfast','card','wallet','account')),
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      tendered_amount NUMERIC(12,2) DEFAULT 0,
      change_amount NUMERIC(12,2) DEFAULT 0,
      staff_id TEXT,
      staff_name TEXT,
      cash_session_id TEXT,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_layby_payments_order ON layby_payments (layby_order_id, created_at)`);
}

export async function ensureManagerTaskSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS manager_tasks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      task_type TEXT NOT NULL CHECK (task_type IN ('cash_variance','sale_exception','refund_request','void_request','stock_adjustment_request','low_stock','ai_recommendation','stock_variance','offline_sync')),
      title TEXT NOT NULL,
      summary TEXT,
      priority TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
      status TEXT DEFAULT 'open' CHECK (status IN ('open','in_review','approved','declined','done','dismissed')),
      source_type TEXT,
      source_id TEXT,
      related_sale_id TEXT,
      related_product_id TEXT,
      assigned_to TEXT,
      requested_by TEXT,
      decided_by TEXT,
      decision_note TEXT,
      details TEXT DEFAULT '{}'::TEXT,
      due_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, task_type, source_type, source_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_manager_tasks_tenant_status ON manager_tasks (tenant_id, status, updated_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_manager_tasks_source ON manager_tasks (tenant_id, source_type, source_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_manager_tasks_assigned ON manager_tasks (tenant_id, assigned_to)`);
  await query(`
    DO $$
    DECLARE
      constraint_name text;
    BEGIN
      SELECT con.conname INTO constraint_name
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
      WHERE rel.relname = 'manager_tasks'
        AND att.attname = 'task_type'
        AND con.contype = 'c'
      LIMIT 1;

      IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE manager_tasks DROP CONSTRAINT %I', constraint_name);
      END IF;

      ALTER TABLE manager_tasks
        ADD CONSTRAINT manager_tasks_task_type_check
        CHECK (task_type IN ('cash_variance','sale_exception','refund_request','void_request','stock_adjustment_request','low_stock','ai_recommendation','stock_variance','offline_sync'));
    END $$;
  `);
  await ensureManagerOverrideSchema();
}

export async function ensureManagerOverrideSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS manager_overrides (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      override_type TEXT NOT NULL DEFAULT 'manager_task',
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT,
      reason TEXT NOT NULL,
      requested_by TEXT,
      approved_by TEXT,
      approved_by_name TEXT,
      related_sale_id TEXT,
      related_product_id TEXT,
      source TEXT DEFAULT 'manager_action_center',
      details TEXT DEFAULT '{}'::TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_manager_overrides_tenant_created ON manager_overrides (tenant_id, created_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_manager_overrides_target ON manager_overrides (tenant_id, target_type, target_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_manager_overrides_approved_by ON manager_overrides (tenant_id, approved_by, created_at)`);
}

export async function ensureStockTakeSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS stock_take_sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'cycle' CHECK (type IN ('full','cycle','spot_check')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','submitted','approved','cancelled')),
      assigned_by TEXT,
      assigned_by_name TEXT,
      due_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      submitted_at TIMESTAMPTZ,
      approved_at TIMESTAMPTZ,
      approved_by TEXT,
      approved_by_name TEXT
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_take_sessions_tenant_status ON stock_take_sessions (tenant_id, status, updated_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_take_sessions_type_due ON stock_take_sessions (tenant_id, type, due_at)`);
  await query(`
    CREATE TABLE IF NOT EXISTS stock_take_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES stock_take_sessions(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      barcode TEXT,
      expected_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
      counted_quantity NUMERIC(12,3),
      variance_quantity NUMERIC(12,3),
      assigned_to TEXT,
      assigned_to_name TEXT,
      counted_by TEXT,
      counted_by_name TEXT,
      variance_reason TEXT,
      variance_reason_label TEXT,
      variance_severity TEXT NOT NULL DEFAULT 'none' CHECK (variance_severity IN ('none','low','medium','high','critical')),
      supervisor_recount_required SMALLINT NOT NULL DEFAULT 0 CHECK (supervisor_recount_required IN (0, 1)),
      supervisor_recount_threshold NUMERIC(12,3) NOT NULL DEFAULT 0,
      supervisor_recount_at TIMESTAMPTZ,
      supervisor_recount_by TEXT,
      supervisor_recount_by_name TEXT,
      status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','counted','confirmed','recount')),
      counted_at TIMESTAMPTZ,
      confirmed_at TIMESTAMPTZ,
      confirmed_by TEXT,
      confirmed_by_name TEXT,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (session_id, product_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_take_items_tenant_status ON stock_take_items (tenant_id, status, updated_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_take_items_assigned ON stock_take_items (tenant_id, assigned_to, status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_take_items_product ON stock_take_items (tenant_id, product_id)`);
  await query(`ALTER TABLE stock_take_items ADD COLUMN IF NOT EXISTS variance_reason TEXT`);
  await query(`ALTER TABLE stock_take_items ADD COLUMN IF NOT EXISTS variance_reason_label TEXT`);
  await query(`ALTER TABLE stock_take_items ADD COLUMN IF NOT EXISTS variance_severity TEXT NOT NULL DEFAULT 'none'`);
  await query(`ALTER TABLE stock_take_items ADD COLUMN IF NOT EXISTS supervisor_recount_required SMALLINT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE stock_take_items ADD COLUMN IF NOT EXISTS supervisor_recount_threshold NUMERIC(12,3) NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE stock_take_items ADD COLUMN IF NOT EXISTS supervisor_recount_at TIMESTAMPTZ`);
  await query(`ALTER TABLE stock_take_items ADD COLUMN IF NOT EXISTS supervisor_recount_by TEXT`);
  await query(`ALTER TABLE stock_take_items ADD COLUMN IF NOT EXISTS supervisor_recount_by_name TEXT`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_take_items_supervisor_recount ON stock_take_items (tenant_id, supervisor_recount_required, status)`);
  await query(`
    CREATE TABLE IF NOT EXISTS stock_take_rules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
      schedule_type TEXT NOT NULL DEFAULT 'daily' CHECK (schedule_type IN ('daily')),
      run_time TEXT NOT NULL DEFAULT '08:00',
      product_scope TEXT NOT NULL DEFAULT 'random' CHECK (product_scope IN ('random','low_stock','category','manual')),
      product_count INT NOT NULL DEFAULT 5,
      category TEXT,
      product_ids TEXT DEFAULT '[]'::TEXT,
      assigned_to TEXT,
      assigned_to_name TEXT,
      last_run_for_date DATE,
      last_run_at TIMESTAMPTZ,
      created_by TEXT,
      created_by_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_take_rules_tenant_status ON stock_take_rules (tenant_id, status, run_time)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_take_rules_assigned ON stock_take_rules (tenant_id, assigned_to)`);
}

export async function ensureBulkInventorySchema() {
  await ensureRestaurantInventoryTables();

  await query(`ALTER TABLE bulk_items ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'single'`);
  await query(`ALTER TABLE bulk_items ADD COLUMN IF NOT EXISTS pack_name TEXT`);
  await query(`ALTER TABLE bulk_items ADD COLUMN IF NOT EXISTS pack_quantity NUMERIC(12,3) DEFAULT 1`);
  await query(`ALTER TABLE bulk_items ADD COLUMN IF NOT EXISTS single_unit_name TEXT DEFAULT 'item'`);
  await query(`UPDATE bulk_items SET item_type = COALESCE(item_type, 'single'), pack_quantity = COALESCE(pack_quantity, 1), single_unit_name = COALESCE(single_unit_name, 'item')`);
}

export async function ensureAiSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS ai_settings (
      tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
      enabled SMALLINT DEFAULT 1 CHECK (enabled IN (0, 1)),
      provider TEXT DEFAULT 'openai',
      model TEXT DEFAULT 'gpt-5-mini',
      api_key TEXT,
      base_url TEXT,
      workspace_slug TEXT,
      insights_enabled SMALLINT DEFAULT 1 CHECK (insights_enabled IN (0, 1)),
      staff_scoring_enabled SMALLINT DEFAULT 1 CHECK (staff_scoring_enabled IN (0, 1)),
      visible_roles TEXT DEFAULT '["admin","manager","dev"]'::TEXT,
      staff_score_visible_roles TEXT DEFAULT '["admin","manager","dev"]'::TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ai_insights (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      evidence TEXT DEFAULT '[]'::TEXT,
      confidence INTEGER DEFAULT 0,
      status TEXT DEFAULT 'open',
      source TEXT DEFAULT 'deterministic',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ai_staff_scores (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      staff_id TEXT NOT NULL,
      staff_name TEXT NOT NULL,
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      grade TEXT NOT NULL,
      component_scores TEXT DEFAULT '{}'::TEXT,
      strengths TEXT DEFAULT '[]'::TEXT,
      coaching_notes TEXT DEFAULT '[]'::TEXT,
      badges TEXT DEFAULT '[]'::TEXT,
      risk_flags TEXT DEFAULT '[]'::TEXT,
      source TEXT DEFAULT 'deterministic',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ai_audit_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      requested_by TEXT,
      provider TEXT,
      status TEXT NOT NULL,
      details TEXT DEFAULT '{}'::TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ai_agent_runs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      mode TEXT NOT NULL CHECK (mode IN ('invoice','low_stock','event')),
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','applying','completed','failed')),
      summary TEXT NOT NULL,
      requires_human_approval SMALLINT DEFAULT 1 CHECK (requires_human_approval IN (0, 1)),
      full_autopilot SMALLINT DEFAULT 0 CHECK (full_autopilot IN (0, 1)),
      requested_by TEXT,
      requested_by_name TEXT,
      warnings TEXT DEFAULT '[]'::TEXT,
      data_access TEXT DEFAULT '[]'::TEXT,
      apply_result TEXT DEFAULT '{}'::TEXT,
      applied_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_tenant_created ON ai_agent_runs (tenant_id, created_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_tenant_status ON ai_agent_runs (tenant_id, status, created_at)`);
  await query(`
    CREATE TABLE IF NOT EXISTS ai_agent_run_steps (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      run_id TEXT NOT NULL REFERENCES ai_agent_runs(id) ON DELETE CASCADE,
      step_id TEXT NOT NULL,
      step_type TEXT NOT NULL,
      label TEXT NOT NULL,
      risk TEXT NOT NULL CHECK (risk IN ('low','medium','high')),
      confidence NUMERIC(5,4) DEFAULT 0,
      approved SMALLINT DEFAULT 0 CHECK (approved IN (0, 1)),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','applied','skipped','failed')),
      payload TEXT DEFAULT '{}'::TEXT,
      evidence TEXT DEFAULT '[]'::TEXT,
      result TEXT DEFAULT '{}'::TEXT,
      skip_reason TEXT,
      approved_by TEXT,
      approved_by_name TEXT,
      approved_at TIMESTAMPTZ,
      applied_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, run_id, step_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_ai_agent_steps_run ON ai_agent_run_steps (tenant_id, run_id, status)`);
  await query(`ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS base_url TEXT`);
  await query(`ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS api_key TEXT`);
  await query(`ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS workspace_slug TEXT`);
}

export async function ensureCompanionDeviceAssignmentsSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS companion_device_assignments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      device_id TEXT NOT NULL,
      device_name TEXT NOT NULL,
      workstation_id TEXT NOT NULL REFERENCES workstations(id) ON DELETE CASCADE,
      default_mode TEXT DEFAULT 'wireless_scanner' CHECK (default_mode IN ('wireless_scanner','pole_display')),
      assigned_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, device_id)
    )
  `);
}

export async function ensureHardwareDeviceSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS hardware_devices (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      device_type TEXT NOT NULL CHECK (device_type IN ('receipt_printer','kitchen_printer','cash_drawer','scale','barcode_scanner','pole_display','card_terminal')),
      connection_type TEXT NOT NULL CHECK (connection_type IN ('browser_print','escpos_network','escpos_usb','serial','webserial','webhid','keyboard_wedge','local_bridge','payment_provider')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
      workstation_id TEXT REFERENCES workstations(id) ON DELETE SET NULL,
      is_default SMALLINT DEFAULT 0 CHECK (is_default IN (0, 1)),
      connection_config TEXT DEFAULT '{}'::TEXT,
      capabilities TEXT DEFAULT '[]'::TEXT,
      last_check_status TEXT,
      last_check_message TEXT,
      last_checked_at TIMESTAMPTZ,
      created_by TEXT,
      created_by_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_hardware_devices_tenant_type ON hardware_devices (tenant_id, device_type, status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_hardware_devices_workstation ON hardware_devices (tenant_id, workstation_id, device_type)`);
  await query(`
    CREATE TABLE IF NOT EXISTS hardware_device_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      device_id TEXT REFERENCES hardware_devices(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      command_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped')),
      request_payload TEXT DEFAULT '{}'::TEXT,
      response_payload TEXT DEFAULT '{}'::TEXT,
      error_message TEXT,
      created_by TEXT,
      created_by_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_hardware_device_events_tenant ON hardware_device_events (tenant_id, created_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_hardware_device_events_device ON hardware_device_events (tenant_id, device_id, created_at)`);
}

export async function ensureRestaurantInventoryTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS bulk_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      item_type TEXT DEFAULT 'single',
      unit TEXT NOT NULL DEFAULT 'items',
      stock NUMERIC(12,3) DEFAULT 0,
      min_stock NUMERIC(12,3) DEFAULT 0,
      cost_per_unit NUMERIC(12,2) DEFAULT 0,
      barcode TEXT,
      pack_name TEXT,
      pack_quantity NUMERIC(12,3) DEFAULT 1,
      single_unit_name TEXT DEFAULT 'item',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS product_recipes (
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      bulk_item_id TEXT NOT NULL REFERENCES bulk_items(id) ON DELETE CASCADE,
      quantity NUMERIC(12,3) NOT NULL,
      yield_quantity NUMERIC(12,3) DEFAULT 1,
      waste_percent NUMERIC(5,2) DEFAULT 0,
      substitute_group TEXT,
      substitute_rank INTEGER DEFAULT 0,
      is_optional SMALLINT DEFAULT 0,
      PRIMARY KEY (product_id, bulk_item_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS product_modifiers (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'single',
      required SMALLINT DEFAULT 0,
      min_selection INTEGER DEFAULT 0,
      max_selection INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS modifier_options (
      id TEXT PRIMARY KEY,
      modifier_id TEXT NOT NULL REFERENCES product_modifiers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price_extra NUMERIC(12,2) DEFAULT 0,
      bulk_item_id TEXT REFERENCES bulk_items(id) ON DELETE SET NULL,
      bulk_quantity NUMERIC(12,3) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE product_recipes ADD COLUMN IF NOT EXISTS yield_quantity NUMERIC(12,3) DEFAULT 1`);
  await query(`ALTER TABLE product_recipes ADD COLUMN IF NOT EXISTS waste_percent NUMERIC(5,2) DEFAULT 0`);
  await query(`ALTER TABLE product_recipes ADD COLUMN IF NOT EXISTS substitute_group TEXT`);
  await query(`ALTER TABLE product_recipes ADD COLUMN IF NOT EXISTS substitute_rank INTEGER DEFAULT 0`);
  await query(`ALTER TABLE product_recipes ADD COLUMN IF NOT EXISTS is_optional SMALLINT DEFAULT 0`);
  await query(`UPDATE product_recipes SET yield_quantity = COALESCE(NULLIF(yield_quantity, 0), 1), waste_percent = COALESCE(waste_percent, 0), substitute_rank = COALESCE(substitute_rank, 0), is_optional = COALESCE(is_optional, 0)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_product_recipes_substitute_group ON product_recipes (product_id, substitute_group, substitute_rank)`);
}

export async function ensureSalePaymentsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS sale_payments (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      method TEXT NOT NULL CHECK (method IN ('cash','payfast','card','wallet','account','qr','bnpl')),
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      tendered_amount NUMERIC(12,2) DEFAULT 0,
      change_amount NUMERIC(12,2) DEFAULT 0,
      tip_amount NUMERIC(12,2) DEFAULT 0,
      cash_out_amount NUMERIC(12,2) DEFAULT 0,
      provider TEXT,
      provider_device_id TEXT,
      provider_reference TEXT,
      authorization_code TEXT,
      provider_status TEXT DEFAULT 'confirmed',
      provider_note TEXT,
      qr_payload TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS provider TEXT`);
  await query(`ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS provider_device_id TEXT`);
  await query(`ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS provider_reference TEXT`);
  await query(`ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS authorization_code TEXT`);
  await query(`ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS provider_status TEXT DEFAULT 'confirmed'`);
  await query(`ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS provider_note TEXT`);
  await query(`ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS qr_payload TEXT`);
}

export async function ensureStaffRoleSupportsChef() {
  await query(`
    DO $$
    DECLARE
      constraint_name text;
    BEGIN
      SELECT con.conname INTO constraint_name
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
      WHERE rel.relname = 'staff'
        AND att.attname = 'role'
        AND con.contype = 'c'
      LIMIT 1;

      IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE staff DROP CONSTRAINT %I', constraint_name);
      END IF;

      ALTER TABLE staff
        ADD CONSTRAINT staff_role_check
        CHECK (role IN ('admin','cashier','manager','chef','dev'));
    END $$;
  `);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initDb()
    .then(() => {
      console.log("Database schema initialized successfully.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Failed to initialize database schema:", err);
      process.exit(1);
    });
}
