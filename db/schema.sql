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
  account_enabled TINYINT(1) DEFAULT 0,
  account_limit DECIMAL(12,2) DEFAULT 0,
  account_balance DECIMAL(12,2) DEFAULT 0,
  discount_percent DECIMAL(5,2) DEFAULT 0,
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
  discount_percent DECIMAL(5,2) DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS companion_device_assignments (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  device_id VARCHAR(128) NOT NULL,
  device_name VARCHAR(255) NOT NULL,
  workstation_id VARCHAR(64) NOT NULL,
  default_mode ENUM('remote_control','wireless_scanner','pole_display') DEFAULT 'remote_control',
  assigned_by VARCHAR(64),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_companion_device (tenant_id, device_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (workstation_id) REFERENCES workstations(id) ON DELETE CASCADE
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
  payment_method ENUM('cash','payfast','card','wallet','account','pending') DEFAULT 'pending',
  tendered_amount DECIMAL(12,2) DEFAULT 0,
  change_amount DECIMAL(12,2) DEFAULT 0,
  tip_amount DECIMAL(12,2) DEFAULT 0,
  cash_out_amount DECIMAL(12,2) DEFAULT 0,
  points_discount DECIMAL(12,2) DEFAULT 0,
  status ENUM('pending','completed','failed','open','kitchen') DEFAULT 'pending',
  transaction_type VARCHAR(24) DEFAULT 'sale',
  parent_sale_id VARCHAR(64),
  refund_status VARCHAR(24) DEFAULT 'none',
  refunded_amount DECIMAL(12,2) DEFAULT 0,
  refund_reason TEXT,
  refunded_by VARCHAR(64),
  void_reason TEXT,
  voided_by VARCHAR(64),
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
  method ENUM('cash','payfast','card','wallet','account') NOT NULL,
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
  type ENUM('opening_float','cash_sale','refund','cash_drop','cash_added','cash_removed','cash_out','tip','manager_adjustment','no_sale') NOT NULL,
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
);

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
);

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
);

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
);

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
);

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
);

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

CREATE TABLE IF NOT EXISTS push_notification_settings (
  tenant_id VARCHAR(64) PRIMARY KEY,
  vapid_public_key TEXT,
  vapid_private_key TEXT,
  subject VARCHAR(255) NOT NULL DEFAULT 'mailto:dev@jimmyspos.local',
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  staff_id VARCHAR(64),
  endpoint VARCHAR(500) NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(255) NOT NULL,
  expiration_time TIMESTAMP NULL,
  device_label VARCHAR(160),
  user_agent VARCHAR(500),
  disabled_at TIMESTAMP NULL,
  last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_push_subscription_endpoint (tenant_id, endpoint),
  INDEX idx_push_subscriptions_tenant (tenant_id),
  INDEX idx_push_subscriptions_staff (tenant_id, staff_id),
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
);

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
);

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
);

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
