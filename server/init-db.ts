import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { isPostgres, query } from "./db.js";
import { ensureLicenceSchema } from "./licenceSchema.js";
import { ensurePushNotificationSchema } from "./pushNotifications.js";

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
  payment_method TEXT DEFAULT 'pending' CHECK (payment_method IN ('cash','payfast','card','wallet','account','pending')),
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
  reference_id TEXT,
  category TEXT,
  note TEXT,
  counted_breakdown TEXT DEFAULT '{}'::TEXT,
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
  method TEXT NOT NULL CHECK (method IN ('cash','payfast','card','wallet','account')),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tendered_amount NUMERIC(12,2) DEFAULT 0,
  change_amount NUMERIC(12,2) DEFAULT 0,
  tip_amount NUMERIC(12,2) DEFAULT 0,
  cash_out_amount NUMERIC(12,2) DEFAULT 0,
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
    isPostgres() ? "schema.postgres.sql" : "schema.sql"
  );
  
  const sql = fs.existsSync(schemaPath)
    ? fs.readFileSync(schemaPath, "utf8")
    : isPostgres()
      ? POSTGRES_FALLBACK_SCHEMA
      : (() => {
          throw new Error(`Schema file not found: ${schemaPath}`);
        })();
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
  await ensureLicenceSchema();
  await ensureSalePaymentsTable();
  await ensureCustomerAccountSchema();
  await ensurePersonDiscountSchema();
  await ensureCashManagementSchema();
  await ensureRefundSchema();
  await ensureAuditAndStockLedgerSchema();
  await ensureManagerTaskSchema();
  await ensureStockTakeSchema();
  await ensureBulkInventorySchema();
  await ensurePushNotificationSchema();
  await ensureAiSchema();
}

export { ensurePushNotificationSchema };

export async function ensurePersonDiscountSchema() {
  if (isPostgres()) {
    await query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) DEFAULT 0`);
    await query(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) DEFAULT 0`);
    await query(`UPDATE customers SET discount_percent = COALESCE(discount_percent, 0)`);
    await query(`UPDATE staff SET discount_percent = COALESCE(discount_percent, 0)`);
    return;
  }

  const addColumn = async (table: 'customers' | 'staff', definition: string) => {
    try {
      await query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
    } catch (err: any) {
      const message = String(err?.message || "");
      if (!message.includes("Duplicate column")) throw err;
    }
  };

  await addColumn('customers', `discount_percent DECIMAL(5,2) DEFAULT 0 AFTER account_balance`);
  await addColumn('staff', `discount_percent DECIMAL(5,2) DEFAULT 0 AFTER wallet_balance`);
  await query(`UPDATE customers SET discount_percent = COALESCE(discount_percent, 0)`);
  await query(`UPDATE staff SET discount_percent = COALESCE(discount_percent, 0)`);
}

export async function ensureCustomerAccountSchema() {
  if (isPostgres()) {
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
          CHECK (payment_method IN ('cash','payfast','card','wallet','account','pending'));
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
          CHECK (method IN ('cash','payfast','card','wallet','account'));
      END $$;
    `);
    return;
  }

  const addColumn = async (definition: string) => {
    try {
      await query(`ALTER TABLE customers ADD COLUMN ${definition}`);
    } catch (err: any) {
      const message = String(err?.message || "");
      if (!message.includes("Duplicate column")) throw err;
    }
  };

  await addColumn(`account_enabled TINYINT(1) DEFAULT 0 AFTER wallet_balance`);
  await addColumn(`account_limit DECIMAL(12,2) DEFAULT 0 AFTER account_enabled`);
  await addColumn(`account_balance DECIMAL(12,2) DEFAULT 0 AFTER account_limit`);
  await query(`UPDATE customers SET account_enabled = COALESCE(account_enabled, 0), account_limit = COALESCE(account_limit, 0), account_balance = COALESCE(account_balance, 0)`);
  await query(`ALTER TABLE sales MODIFY payment_method ENUM('cash','payfast','card','wallet','account','pending') DEFAULT 'pending'`);
  await query(`ALTER TABLE sale_payments MODIFY method ENUM('cash','payfast','card','wallet','account') NOT NULL`);
}

export async function ensureStaffPermissionsSchema() {
  if (isPostgres()) {
    await query(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS permissions TEXT DEFAULT '{}'::TEXT`);
    return;
  }

  try {
    await query(`ALTER TABLE staff ADD COLUMN permissions JSON DEFAULT JSON_OBJECT() AFTER status`);
  } catch (err: any) {
    const message = String(err?.message || "");
    if (!message.includes("Duplicate column")) throw err;
  }
}

export async function ensureCashManagementSchema() {
  if (isPostgres()) {
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
        reference_id TEXT,
        category TEXT,
        note TEXT,
        counted_breakdown TEXT DEFAULT '{}'::TEXT,
        created_by TEXT,
        created_by_name TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_manager_cash_tenant_created ON manager_cash_movements (tenant_id, created_at)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_manager_cash_reference ON manager_cash_movements (tenant_id, movement_type, reference_id)`);
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
    return;
  }

  const addColumn = async (definition: string) => {
    try {
      await query(`ALTER TABLE cash_sessions ADD COLUMN ${definition}`);
    } catch (err: any) {
      const message = String(err?.message || "");
      if (!message.includes("Duplicate column")) throw err;
    }
  };

  await addColumn(`submitted_at DATETIME`);
  await addColumn(`reviewed_at DATETIME`);
  await addColumn(`reviewed_by VARCHAR(64)`);
  await addColumn(`reconciled_at DATETIME`);
  await addColumn(`reconciled_by VARCHAR(64)`);
  await addColumn(`opening_breakdown JSON DEFAULT JSON_OBJECT()`);
  await addColumn(`closing_breakdown JSON DEFAULT JSON_OBJECT()`);
  await addColumn(`review_status ENUM('in_progress','submitted','reviewed','reconciled','disputed') DEFAULT 'in_progress'`);
  await addColumn(`manager_notes TEXT`);
  await addColumn(`variance_reason TEXT`);

  await query(`
    CREATE TABLE IF NOT EXISTS cash_movements (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL,
      cash_session_id VARCHAR(64) NOT NULL,
      type ENUM('opening_float','cash_sale','refund','cash_drop','cash_added','cash_removed','cash_out','tip','manager_adjustment','no_sale','wallet_cash_in','wallet_cash_out') NOT NULL,
      direction ENUM('in','out','neutral') NOT NULL DEFAULT 'neutral',
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      sale_id VARCHAR(64),
      payment_id VARCHAR(64),
      staff_id VARCHAR(64),
      staff_name VARCHAR(255),
      created_by VARCHAR(64),
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id) ON DELETE CASCADE
    )
  `);
  await query(`ALTER TABLE cash_movements MODIFY type ENUM('opening_float','cash_sale','refund','cash_drop','cash_added','cash_removed','cash_out','tip','manager_adjustment','no_sale','wallet_cash_in','wallet_cash_out') NOT NULL`);
  await query(`
    CREATE TABLE IF NOT EXISTS manager_cash_movements (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL,
      movement_type ENUM('safe_drop','cash_added','petty_cash','payout','wallet_cash_in','wallet_cash_out','register_close','manager_adjustment','transfer') NOT NULL,
      direction ENUM('in','out','neutral') NOT NULL DEFAULT 'neutral',
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      cash_session_id VARCHAR(64),
      staff_id VARCHAR(64),
      staff_name VARCHAR(255),
      customer_id VARCHAR(64),
      customer_name VARCHAR(255),
      source_type VARCHAR(64) DEFAULT 'manager_float',
      reference_id VARCHAR(128),
      category VARCHAR(96),
      note TEXT,
      counted_breakdown JSON DEFAULT JSON_OBJECT(),
      created_by VARCHAR(64),
      created_by_name VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_manager_cash_tenant_created (tenant_id, created_at),
      INDEX idx_manager_cash_reference (tenant_id, movement_type, reference_id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id) ON DELETE SET NULL
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS cash_custody_transfers (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL,
      status ENUM('pending_confirmation','confirmed','cancelled') NOT NULL DEFAULT 'pending_confirmation',
      from_type ENUM('register','staff','manager_float','safe','petty_cash') NOT NULL,
      from_id VARCHAR(64),
      from_name VARCHAR(255),
      to_type ENUM('register','staff','manager_float','safe','petty_cash') NOT NULL,
      to_id VARCHAR(64),
      to_name VARCHAR(255),
      cash_session_id VARCHAR(64),
      expected_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      counted_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      variance DECIMAL(12,2) NOT NULL DEFAULT 0,
      counted_breakdown JSON DEFAULT JSON_OBJECT(),
      note TEXT,
      requested_by VARCHAR(64),
      requested_by_name VARCHAR(255),
      confirmed_by VARCHAR(64),
      confirmed_by_name VARCHAR(255),
      cancelled_by VARCHAR(64),
      cancelled_by_name VARCHAR(255),
      cancel_reason TEXT,
      requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      confirmed_at DATETIME,
      cancelled_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_cash_custody_tenant_status (tenant_id, status, created_at),
      INDEX idx_cash_custody_session (tenant_id, cash_session_id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id) ON DELETE SET NULL
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS cash_close_checkpoints (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL,
      business_date DATE NOT NULL,
      status ENUM('balanced','review_needed') NOT NULL DEFAULT 'review_needed',
      expected_physical_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
      counted_physical_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
      variance DECIMAL(12,2) NOT NULL DEFAULT 0,
      manager_float DECIMAL(12,2) NOT NULL DEFAULT 0,
      open_register_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
      pending_cash_up_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
      wallet_liability DECIMAL(12,2) NOT NULL DEFAULT 0,
      pending_payouts DECIMAL(12,2) NOT NULL DEFAULT 0,
      petty_cash_today DECIMAL(12,2) NOT NULL DEFAULT 0,
      wallet_cash_in_today DECIMAL(12,2) NOT NULL DEFAULT 0,
      wallet_cash_out_today DECIMAL(12,2) NOT NULL DEFAULT 0,
      custody_pending_count INT NOT NULL DEFAULT 0,
      custody_variance_today DECIMAL(12,2) NOT NULL DEFAULT 0,
      unresolved_items JSON DEFAULT JSON_ARRAY(),
      counted_breakdown JSON DEFAULT JSON_OBJECT(),
      note TEXT,
      closed_by VARCHAR(64),
      closed_by_name VARCHAR(255),
      closed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_cash_close_business_date (tenant_id, business_date),
      INDEX idx_cash_close_tenant_status (tenant_id, status, business_date),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);
  await query(`UPDATE cash_sessions SET review_status = IF(status = 'open', 'in_progress', COALESCE(review_status, 'submitted')) WHERE review_status IS NULL`);
}

export async function ensureRefundSchema() {
  if (isPostgres()) {
    await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS transaction_type TEXT DEFAULT 'sale'`);
    await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS parent_sale_id TEXT`);
    await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS refund_status TEXT DEFAULT 'none'`);
    await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(12,2) DEFAULT 0`);
    await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS refund_reason TEXT`);
    await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS refunded_by TEXT`);
    await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS void_reason TEXT`);
    await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS voided_by TEXT`);
    await query(`UPDATE sales SET transaction_type = COALESCE(transaction_type, 'sale'), refund_status = COALESCE(refund_status, 'none'), refunded_amount = COALESCE(refunded_amount, 0)`);
    return;
  }

  const addColumn = async (definition: string) => {
    try {
      await query(`ALTER TABLE sales ADD COLUMN ${definition}`);
    } catch (err: any) {
      const message = String(err?.message || "");
      if (!message.includes("Duplicate column")) throw err;
    }
  };

  await addColumn(`transaction_type VARCHAR(24) DEFAULT 'sale' AFTER status`);
  await addColumn(`parent_sale_id VARCHAR(64) AFTER transaction_type`);
  await addColumn(`refund_status VARCHAR(24) DEFAULT 'none' AFTER parent_sale_id`);
  await addColumn(`refunded_amount DECIMAL(12,2) DEFAULT 0 AFTER refund_status`);
  await addColumn(`refund_reason TEXT AFTER refunded_amount`);
  await addColumn(`refunded_by VARCHAR(64) AFTER refund_reason`);
  await addColumn(`void_reason TEXT AFTER refunded_by`);
  await addColumn(`voided_by VARCHAR(64) AFTER void_reason`);
  await query(`UPDATE sales SET transaction_type = COALESCE(transaction_type, 'sale'), refund_status = COALESCE(refund_status, 'none'), refunded_amount = COALESCE(refunded_amount, 0)`);
}

export async function ensureAuditAndStockLedgerSchema() {
  if (isPostgres()) {
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
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL,
      action VARCHAR(96) NOT NULL,
      entity_type VARCHAR(64) NOT NULL,
      entity_id VARCHAR(64),
      related_sale_id VARCHAR(64),
      staff_id VARCHAR(64),
      staff_name VARCHAR(255),
      customer_id VARCHAR(64),
      source VARCHAR(32) DEFAULT 'server',
      details JSON DEFAULT JSON_OBJECT(),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_events_tenant_created (tenant_id, created_at),
      INDEX idx_audit_events_entity (tenant_id, entity_type, entity_id),
      INDEX idx_audit_events_staff (tenant_id, staff_id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL,
      item_type ENUM('product','bulk') NOT NULL DEFAULT 'product',
      product_id VARCHAR(64),
      bulk_item_id VARCHAR(64),
      item_name VARCHAR(255),
      quantity_delta DECIMAL(12,3) NOT NULL DEFAULT 0,
      previous_quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
      new_quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
      reason VARCHAR(64) NOT NULL,
      reference_type VARCHAR(64),
      reference_id VARCHAR(64),
      sale_id VARCHAR(64),
      sale_item_id VARCHAR(64),
      staff_id VARCHAR(64),
      staff_name VARCHAR(255),
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_stock_movements_tenant_created (tenant_id, created_at),
      INDEX idx_stock_movements_product (tenant_id, product_id),
      INDEX idx_stock_movements_sale (tenant_id, sale_id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);
}

export async function ensureManagerTaskSchema() {
  if (isPostgres()) {
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
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS manager_tasks (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL,
      task_type ENUM('cash_variance','sale_exception','refund_request','void_request','stock_adjustment_request','low_stock','ai_recommendation','stock_variance','offline_sync') NOT NULL,
      title VARCHAR(255) NOT NULL,
      summary TEXT,
      priority ENUM('low','normal','high','critical') DEFAULT 'normal',
      status ENUM('open','in_review','approved','declined','done','dismissed') DEFAULT 'open',
      source_type VARCHAR(64),
      source_id VARCHAR(64),
      related_sale_id VARCHAR(64),
      related_product_id VARCHAR(64),
      assigned_to VARCHAR(64),
      requested_by VARCHAR(64),
      decided_by VARCHAR(64),
      decision_note TEXT,
      details JSON DEFAULT JSON_OBJECT(),
      due_at DATETIME,
      resolved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_manager_task_source (tenant_id, task_type, source_type, source_id),
      INDEX idx_manager_tasks_tenant_status (tenant_id, status, updated_at),
      INDEX idx_manager_tasks_source (tenant_id, source_type, source_id),
      INDEX idx_manager_tasks_assigned (tenant_id, assigned_to),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);
  await query(`ALTER TABLE manager_tasks MODIFY task_type ENUM('cash_variance','sale_exception','refund_request','void_request','stock_adjustment_request','low_stock','ai_recommendation','stock_variance','offline_sync') NOT NULL`);
}

export async function ensureStockTakeSchema() {
  if (isPostgres()) {
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
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS stock_take_sessions (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      type ENUM('full','cycle','spot_check') NOT NULL DEFAULT 'cycle',
      status ENUM('draft','active','submitted','approved','cancelled') NOT NULL DEFAULT 'active',
      assigned_by VARCHAR(64),
      assigned_by_name VARCHAR(255),
      due_at DATETIME,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      submitted_at DATETIME,
      approved_at DATETIME,
      approved_by VARCHAR(64),
      approved_by_name VARCHAR(255),
      INDEX idx_stock_take_sessions_tenant_status (tenant_id, status, updated_at),
      INDEX idx_stock_take_sessions_type_due (tenant_id, type, due_at),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS stock_take_items (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL,
      session_id VARCHAR(64) NOT NULL,
      product_id VARCHAR(64) NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      barcode VARCHAR(128),
      expected_quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
      counted_quantity DECIMAL(12,3),
      variance_quantity DECIMAL(12,3),
      assigned_to VARCHAR(64),
      assigned_to_name VARCHAR(255),
      counted_by VARCHAR(64),
      counted_by_name VARCHAR(255),
      status ENUM('assigned','counted','confirmed','recount') NOT NULL DEFAULT 'assigned',
      counted_at DATETIME,
      confirmed_at DATETIME,
      confirmed_by VARCHAR(64),
      confirmed_by_name VARCHAR(255),
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_stock_take_item_product (session_id, product_id),
      INDEX idx_stock_take_items_tenant_status (tenant_id, status, updated_at),
      INDEX idx_stock_take_items_assigned (tenant_id, assigned_to, status),
      INDEX idx_stock_take_items_product (tenant_id, product_id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES stock_take_sessions(id) ON DELETE CASCADE
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS stock_take_rules (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      status ENUM('active','paused') NOT NULL DEFAULT 'active',
      schedule_type ENUM('daily') NOT NULL DEFAULT 'daily',
      run_time VARCHAR(5) NOT NULL DEFAULT '08:00',
      product_scope ENUM('random','low_stock','category','manual') NOT NULL DEFAULT 'random',
      product_count INT NOT NULL DEFAULT 5,
      category VARCHAR(255),
      product_ids JSON DEFAULT JSON_ARRAY(),
      assigned_to VARCHAR(64),
      assigned_to_name VARCHAR(255),
      last_run_for_date DATE,
      last_run_at DATETIME,
      created_by VARCHAR(64),
      created_by_name VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_stock_take_rules_tenant_status (tenant_id, status, run_time),
      INDEX idx_stock_take_rules_assigned (tenant_id, assigned_to),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);
}

export async function ensureBulkInventorySchema() {
  await ensureRestaurantInventoryTables();

  if (isPostgres()) {
    await query(`ALTER TABLE bulk_items ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'single'`);
    await query(`ALTER TABLE bulk_items ADD COLUMN IF NOT EXISTS pack_name TEXT`);
    await query(`ALTER TABLE bulk_items ADD COLUMN IF NOT EXISTS pack_quantity NUMERIC(12,3) DEFAULT 1`);
    await query(`ALTER TABLE bulk_items ADD COLUMN IF NOT EXISTS single_unit_name TEXT DEFAULT 'item'`);
    await query(`UPDATE bulk_items SET item_type = COALESCE(item_type, 'single'), pack_quantity = COALESCE(pack_quantity, 1), single_unit_name = COALESCE(single_unit_name, 'item')`);
    return;
  }

  const addColumn = async (definition: string) => {
    try {
      await query(`ALTER TABLE bulk_items ADD COLUMN ${definition}`);
    } catch (err: any) {
      const message = String(err?.message || "");
      if (!message.includes("Duplicate column")) throw err;
    }
  };

  await addColumn(`item_type ENUM('single','bulk') DEFAULT 'single' AFTER name`);
  await addColumn(`pack_name VARCHAR(64) AFTER barcode`);
  await addColumn(`pack_quantity DECIMAL(12,3) DEFAULT 1 AFTER pack_name`);
  await addColumn(`single_unit_name VARCHAR(64) DEFAULT 'item' AFTER pack_quantity`);
  await query(`UPDATE bulk_items SET item_type = COALESCE(item_type, 'single'), pack_quantity = COALESCE(pack_quantity, 1), single_unit_name = COALESCE(single_unit_name, 'item')`);
}

export async function ensureAiSchema() {
  if (isPostgres()) {
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
    await query(`ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS base_url TEXT`);
    await query(`ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS api_key TEXT`);
    await query(`ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS workspace_slug TEXT`);
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS ai_settings (
      tenant_id VARCHAR(64) PRIMARY KEY,
        enabled BOOLEAN DEFAULT TRUE,
        provider VARCHAR(32) DEFAULT 'openai',
        model VARCHAR(64) DEFAULT 'gpt-5-mini',
        api_key TEXT,
        base_url VARCHAR(255),
        workspace_slug VARCHAR(128),
      insights_enabled BOOLEAN DEFAULT TRUE,
      staff_scoring_enabled BOOLEAN DEFAULT TRUE,
      visible_roles JSON DEFAULT JSON_ARRAY('admin', 'manager', 'dev'),
      staff_score_visible_roles JSON DEFAULT JSON_ARRAY('admin', 'manager', 'dev'),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ai_insights (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL,
      category ENUM('sales','stock','cash','staff','restaurant','customer','package') NOT NULL,
      severity ENUM('info','success','warning','critical') NOT NULL,
      title VARCHAR(255) NOT NULL,
      summary TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      evidence JSON DEFAULT JSON_ARRAY(),
      confidence INT DEFAULT 0,
      status ENUM('open','dismissed','done') DEFAULT 'open',
      source ENUM('deterministic','openai') DEFAULT 'deterministic',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ai_staff_scores (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL,
      staff_id VARCHAR(64) NOT NULL,
      staff_name VARCHAR(255) NOT NULL,
      period_start DATETIME NOT NULL,
      period_end DATETIME NOT NULL,
      score INT NOT NULL DEFAULT 0,
      grade VARCHAR(32) NOT NULL,
      component_scores JSON DEFAULT JSON_OBJECT(),
      strengths JSON DEFAULT JSON_ARRAY(),
      coaching_notes JSON DEFAULT JSON_ARRAY(),
      badges JSON DEFAULT JSON_ARRAY(),
      risk_flags JSON DEFAULT JSON_ARRAY(),
      source ENUM('deterministic','openai') DEFAULT 'deterministic',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ai_audit_log (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL,
      action VARCHAR(64) NOT NULL,
      requested_by VARCHAR(64),
      provider VARCHAR(32),
      status VARCHAR(32) NOT NULL,
      details JSON DEFAULT JSON_OBJECT(),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  const addAiColumn = async (definition: string) => {
    try {
      await query(`ALTER TABLE ai_settings ADD COLUMN ${definition}`);
    } catch (err: any) {
      const message = String(err?.message || "");
      if (!message.includes("Duplicate column")) throw err;
    }
  };
  await addAiColumn(`api_key TEXT AFTER model`);
  await addAiColumn(`base_url VARCHAR(255) AFTER model`);
  await addAiColumn(`workspace_slug VARCHAR(128) AFTER base_url`);
}

export async function ensureCompanionDeviceAssignmentsSchema() {
  if (isPostgres()) {
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
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS companion_device_assignments (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL,
      device_id VARCHAR(128) NOT NULL,
      device_name VARCHAR(255) NOT NULL,
      workstation_id VARCHAR(64) NOT NULL,
      default_mode ENUM('wireless_scanner','pole_display') DEFAULT 'wireless_scanner',
      assigned_by VARCHAR(64),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_companion_device (tenant_id, device_id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (workstation_id) REFERENCES workstations(id) ON DELETE CASCADE
    )
  `);
}

export async function ensureRestaurantInventoryTables() {
  if (isPostgres()) {
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
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS bulk_items (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      item_type ENUM('single','bulk') DEFAULT 'single',
      unit VARCHAR(32) NOT NULL DEFAULT 'items',
      stock DECIMAL(12,3) DEFAULT 0,
      min_stock DECIMAL(12,3) DEFAULT 0,
      cost_per_unit DECIMAL(12,2) DEFAULT 0,
      barcode VARCHAR(255),
      pack_name VARCHAR(64),
      pack_quantity DECIMAL(12,3) DEFAULT 1,
      single_unit_name VARCHAR(64) DEFAULT 'item',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS product_recipes (
      product_id VARCHAR(64) NOT NULL,
      bulk_item_id VARCHAR(64) NOT NULL,
      quantity DECIMAL(12,3) NOT NULL,
      PRIMARY KEY (product_id, bulk_item_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (bulk_item_id) REFERENCES bulk_items(id) ON DELETE CASCADE
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS product_modifiers (
      id VARCHAR(64) PRIMARY KEY,
      product_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      type ENUM('single', 'multiple') DEFAULT 'single',
      required BOOLEAN DEFAULT FALSE,
      min_selection INT DEFAULT 0,
      max_selection INT DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS modifier_options (
      id VARCHAR(64) PRIMARY KEY,
      modifier_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      price_extra DECIMAL(12,2) DEFAULT 0,
      bulk_item_id VARCHAR(64),
      bulk_quantity DECIMAL(12,3) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (modifier_id) REFERENCES product_modifiers(id) ON DELETE CASCADE,
      FOREIGN KEY (bulk_item_id) REFERENCES bulk_items(id) ON DELETE SET NULL
    )
  `);
}

export async function ensureSalePaymentsTable() {
  if (isPostgres()) {
    await query(`
      CREATE TABLE IF NOT EXISTS sale_payments (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        method TEXT NOT NULL CHECK (method IN ('cash','payfast','card','wallet','account')),
        amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        tendered_amount NUMERIC(12,2) DEFAULT 0,
        change_amount NUMERIC(12,2) DEFAULT 0,
        tip_amount NUMERIC(12,2) DEFAULT 0,
        cash_out_amount NUMERIC(12,2) DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS sale_payments (
      id VARCHAR(64) PRIMARY KEY,
      sale_id VARCHAR(64) NOT NULL,
      method ENUM('cash','payfast','card','wallet','account') NOT NULL,
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      tendered_amount DECIMAL(12,2) DEFAULT 0,
      change_amount DECIMAL(12,2) DEFAULT 0,
      tip_amount DECIMAL(12,2) DEFAULT 0,
      cash_out_amount DECIMAL(12,2) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
    )
  `);
}

export async function ensureStaffRoleSupportsChef() {
  if (isPostgres()) {
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
    return;
  }

  await query(`
    ALTER TABLE staff
      MODIFY role ENUM('admin','cashier','manager','chef','dev') DEFAULT 'cashier'
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
