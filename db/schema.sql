-- MariaDB schema for Jimmy's POS
-- Use MariaDB 10.2+ for JSON support

CREATE TABLE IF NOT EXISTS tenants (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS slugs (
  slug VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS users (
  uid VARCHAR(128) PRIMARY KEY,
  tenant_id VARCHAR(64),
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  tenant_id VARCHAR(64) PRIMARY KEY,
  payfast_merchant_id VARCHAR(128) DEFAULT '10000100',
  payfast_merchant_key VARCHAR(128) DEFAULT '46f0cd694581a',
  payfast_passphrase VARCHAR(128) DEFAULT 'jt7v60h69n8a1',
  payfast_sandbox BOOLEAN DEFAULT TRUE,
  business JSON DEFAULT JSON_OBJECT(),
  setup_completed BOOLEAN DEFAULT FALSE,
  categories JSON DEFAULT JSON_OBJECT(),
  slug VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS licences (
  licence_id VARCHAR(64) PRIMARY KEY,
  tenant_name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(128) NOT NULL UNIQUE,
  tier VARCHAR(32) NOT NULL,
  max_registers INT NOT NULL DEFAULT 2,
  features TEXT NOT NULL DEFAULT '[]',
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at DATETIME,
  revoked_reason TEXT,
  INDEX idx_licences_key_hash (key_hash)
);

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  cost_price DECIMAL(12,2) DEFAULT 0,
  section VARCHAR(255),
  category VARCHAR(255),
  sub_category VARCHAR(255),
  stock INT DEFAULT 0,
  min_stock INT DEFAULT 0,
  image_url TEXT,
  barcode VARCHAR(255),
  workstation_id VARCHAR(64),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(64),
  address TEXT,
  notes TEXT,
  loyalty_points INT DEFAULT 0,
  wallet_balance DECIMAL(12,2) DEFAULT 0,
  uid VARCHAR(128),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staff (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role ENUM('admin','cashier','manager','chef','dev') DEFAULT 'cashier',
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  phone VARCHAR(64),
  status ENUM('active','inactive') DEFAULT 'active',
  permissions JSON DEFAULT JSON_OBJECT(),
  assigned_sections JSON DEFAULT JSON_ARRAY(),
  assigned_categories JSON DEFAULT JSON_ARRAY(),
  id_number VARCHAR(128),
  pay_rate DECIMAL(12,2) DEFAULT 0,
  pay_type ENUM('hourly','salary'),
  accumulated_leave INT DEFAULT 0,
  wallet_balance DECIMAL(12,2) DEFAULT 0,
  metrics JSON DEFAULT JSON_OBJECT(),
  badges JSON DEFAULT JSON_ARRAY(),
  rank VARCHAR(128),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workstations (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type ENUM('kitchen','bar','other') DEFAULT 'other',
  status ENUM('active','inactive') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sales (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64),
  user_id VARCHAR(128),
  staff_id VARCHAR(64),
  total DECIMAL(12,2) DEFAULT 0,
  subtotal DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  tax_inclusive BOOLEAN DEFAULT FALSE,
  payment_method ENUM('cash','payfast','card','wallet','pending') DEFAULT 'pending',
  tendered_amount DECIMAL(12,2) DEFAULT 0,
  change_amount DECIMAL(12,2) DEFAULT 0,
  tip_amount DECIMAL(12,2) DEFAULT 0,
  cash_out_amount DECIMAL(12,2) DEFAULT 0,
  points_discount DECIMAL(12,2) DEFAULT 0,
  status ENUM('pending','completed','failed','open','kitchen') DEFAULT 'pending',
  payfast_payment_id VARCHAR(128),
  table_number VARCHAR(64),
  is_tab BOOLEAN DEFAULT FALSE,
  tab_name VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sale_items (
  id VARCHAR(64) PRIMARY KEY,
  sale_id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64),
  product_name VARCHAR(255) NOT NULL,
  price DECIMAL(12,2) DEFAULT 0,
  quantity INT DEFAULT 1,
  status ENUM('pending','accepted','ready','delivered') DEFAULT 'pending',
  workstation_id VARCHAR(64),
  ordered_at DATETIME,
  accepted_at DATETIME,
  ready_at DATETIME,
  delivered_at DATETIME,
  action_staff_id VARCHAR(64),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sale_payments (
  id VARCHAR(64) PRIMARY KEY,
  sale_id VARCHAR(64) NOT NULL,
  method ENUM('cash','payfast','card','wallet') NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tendered_amount DECIMAL(12,2) DEFAULT 0,
  change_amount DECIMAL(12,2) DEFAULT 0,
  tip_amount DECIMAL(12,2) DEFAULT 0,
  cash_out_amount DECIMAL(12,2) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cash_sessions (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  staff_id VARCHAR(64) NOT NULL,
  staff_name VARCHAR(255),
  opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME,
  submitted_at DATETIME,
  reviewed_at DATETIME,
  reviewed_by VARCHAR(64),
  reconciled_at DATETIME,
  reconciled_by VARCHAR(64),
  opening_float DECIMAL(12,2) DEFAULT 0,
  opening_breakdown JSON DEFAULT JSON_OBJECT(),
  expected_cash DECIMAL(12,2) DEFAULT 0,
  actual_cash DECIMAL(12,2) DEFAULT 0,
  closing_breakdown JSON DEFAULT JSON_OBJECT(),
  difference DECIMAL(12,2) DEFAULT 0,
  accumulated_tips DECIMAL(12,2) DEFAULT 0,
  net_tips DECIMAL(12,2) DEFAULT 0,
  status ENUM('open','closed') DEFAULT 'open',
  review_status ENUM('in_progress','submitted','reviewed','reconciled','disputed') DEFAULT 'in_progress',
  notes TEXT,
  manager_notes TEXT,
  variance_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cash_movements (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  cash_session_id VARCHAR(64) NOT NULL,
  type ENUM('opening_float','cash_sale','refund','cash_drop','cash_added','cash_removed','cash_out','tip','manager_adjustment') NOT NULL,
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
);

CREATE TABLE IF NOT EXISTS customer_payout_requests (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64),
  customer_name VARCHAR(255),
  customer_email VARCHAR(255),
  amount DECIMAL(12,2) DEFAULT 0,
  status ENUM('pending','approved','rejected','paid') DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  processed_by VARCHAR(128),
  note TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  channel VARCHAR(255) NOT NULL,
  sender_id VARCHAR(128) NOT NULL,
  sender_name VARCHAR(255) NOT NULL,
  sender_role VARCHAR(255) NOT NULL,
  text TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  read_by JSON DEFAULT JSON_ARRAY(),
  is_dev_broadcast BOOLEAN DEFAULT FALSE,
  is_system BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  vendor_id VARCHAR(64),
  status ENUM('draft','sent','received','cancelled') DEFAULT 'draft',
  type ENUM('once_off','recurring') DEFAULT 'once_off',
  recurring_frequency ENUM('weekly','monthly'),
  items JSON NOT NULL,
  total_amount DECIMAL(12,2) DEFAULT 0,
  expected_delivery_date DATETIME,
  invoice_status ENUM('unpaid','paid') DEFAULT 'unpaid',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vendors (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(64),
  address TEXT,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payout_requests (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  staff_id VARCHAR(64),
  staff_name VARCHAR(255),
  customer_id VARCHAR(64),
  customer_name VARCHAR(255),
  customer_email VARCHAR(255),
  amount DECIMAL(12,2) DEFAULT 0,
  status ENUM('pending','approved','rejected','paid') DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  processed_by VARCHAR(128),
  note TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS table_sections (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(64),
  `order` INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  section_id VARCHAR(64),
  capacity INT DEFAULT 1,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

INSERT INTO tenants (id, name) VALUES ('default', 'Default Tenant');

INSERT INTO staff (id, tenant_id, name, role, email, password_hash, status)
VALUES (
  'admin',
  'default',
  'Admin',
  'dev',
  'jameskoen78@gmail.com',
  '$2b$10$cllz1VjHJl97oeAyzvZWsOpYd66l7kaOXG977GZ6yDT6C58SgMf9S',
  'active'
);

CREATE TABLE IF NOT EXISTS bulk_items (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  item_type ENUM('single','bulk') DEFAULT 'single',
  unit VARCHAR(32) NOT NULL DEFAULT 'items', -- ml, g, kg, items, etc.
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
);

CREATE TABLE IF NOT EXISTS product_recipes (
  product_id VARCHAR(64) NOT NULL,
  bulk_item_id VARCHAR(64) NOT NULL,
  quantity DECIMAL(12,3) NOT NULL, -- e.g. 25.000 for ml
  PRIMARY KEY (product_id, bulk_item_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (bulk_item_id) REFERENCES bulk_items(id) ON DELETE CASCADE
);

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
);

CREATE TABLE IF NOT EXISTS modifier_options (
  id VARCHAR(64) PRIMARY KEY,
  modifier_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  price_extra DECIMAL(12,2) DEFAULT 0,
  bulk_item_id VARCHAR(64), -- Optional: modifier can also deduct from bulk stock
  bulk_quantity DECIMAL(12,3) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (modifier_id) REFERENCES product_modifiers(id) ON DELETE CASCADE,
  FOREIGN KEY (bulk_item_id) REFERENCES bulk_items(id) ON DELETE SET NULL
);
