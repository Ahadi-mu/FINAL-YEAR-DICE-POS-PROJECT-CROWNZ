-- ============================================================
-- CSRMS Database Schema - Crown Stores Retail Management System
-- ============================================================

-- Drop tables in reverse dependency order (for clean resets)
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS bug_reports CASCADE;
DROP TABLE IF EXISTS cashier_balances CASCADE;
DROP TABLE IF EXISTS sale_items CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS inventory_movements CASCADE;
DROP TABLE IF EXISTS stock_adjustments CASCADE;
DROP TABLE IF EXISTS procurement_items CASCADE;
DROP TABLE IF EXISTS procurements CASCADE;
DROP TABLE IF EXISTS branch_inventory CASCADE;
DROP TABLE IF EXISTS barcodes CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS branches CASCADE;
DROP TABLE IF EXISTS password_resets CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;

-- ============================================================
-- BRANCHES
-- ============================================================
CREATE TABLE branches (
  id SERIAL PRIMARY KEY,
  branch_name VARCHAR(150) NOT NULL UNIQUE,
  location VARCHAR(255),
  phone VARCHAR(30),
  email VARCHAR(150),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  branch_id INT REFERENCES branches(id) ON DELETE SET NULL,
  full_name VARCHAR(150) NOT NULL,
  username VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(30) NOT NULL CHECK (role IN ('director', 'manager', 'sales_agent')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- PASSWORD RESETS
-- ============================================================
CREATE TABLE password_resets (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- CATEGORIES (global)
-- ============================================================
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  category_name VARCHAR(150) NOT NULL UNIQUE,
  description TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- SUPPLIERS
-- ============================================================
CREATE TABLE suppliers (
  id SERIAL PRIMARY KEY,
  supplier_name VARCHAR(150) NOT NULL,
  contact_person VARCHAR(150),
  phone VARCHAR(30),
  email VARCHAR(150),
  address TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- PRODUCTS (global catalog)
-- ============================================================
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  category_id INT NOT NULL REFERENCES categories(id),
  product_name VARCHAR(200) NOT NULL,
  description TEXT,
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  reorder_level INT NOT NULL DEFAULT 10,
  unit VARCHAR(50) DEFAULT 'piece',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- BARCODES (multiple per product)
-- ============================================================
CREATE TABLE barcodes (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  barcode_value VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- BRANCH INVENTORY (per branch stock levels)
-- ============================================================
CREATE TABLE branch_inventory (
  id SERIAL PRIMARY KEY,
  branch_id INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity_available INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (branch_id, product_id)
);

-- ============================================================
-- SUPPLIERS ALREADY DEFINED ABOVE
-- ============================================================

-- ============================================================
-- PROCUREMENTS
-- ============================================================
CREATE TABLE procurements (
  id SERIAL PRIMARY KEY,
  branch_id INT NOT NULL REFERENCES branches(id),
  supplier_id INT REFERENCES suppliers(id),
  recorded_by INT REFERENCES users(id),
  reference_number VARCHAR(100),
  notes TEXT,
  total_cost NUMERIC(14,2) DEFAULT 0,
  procurement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE procurement_items (
  id SERIAL PRIMARY KEY,
  procurement_id INT NOT NULL REFERENCES procurements(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id),
  quantity INT NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL,
  subtotal NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED
);

-- ============================================================
-- STOCK ADJUSTMENTS
-- ============================================================
CREATE TABLE stock_adjustments (
  id SERIAL PRIMARY KEY,
  branch_id INT NOT NULL REFERENCES branches(id),
  product_id INT NOT NULL REFERENCES products(id),
  adjusted_by INT REFERENCES users(id),
  adjustment_quantity INT NOT NULL,  -- positive = increase, negative = decrease
  reason TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INVENTORY MOVEMENTS (audit trail of all stock changes)
-- ============================================================
CREATE TABLE inventory_movements (
  id SERIAL PRIMARY KEY,
  branch_id INT NOT NULL REFERENCES branches(id),
  product_id INT NOT NULL REFERENCES products(id),
  movement_type VARCHAR(30) NOT NULL CHECK (movement_type IN ('procurement', 'sale', 'adjustment', 'opening')),
  quantity_change INT NOT NULL,
  quantity_before INT NOT NULL,
  quantity_after INT NOT NULL,
  reference_id INT,        -- sale_id, procurement_id, adjustment_id
  notes TEXT,
  recorded_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- SALES
-- ============================================================
CREATE TABLE sales (
  id SERIAL PRIMARY KEY,
  branch_id INT NOT NULL REFERENCES branches(id),
  sales_agent_id INT NOT NULL REFERENCES users(id),
  receipt_number VARCHAR(50) NOT NULL UNIQUE,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(14,2) NOT NULL,
  change_given NUMERIC(14,2) GENERATED ALWAYS AS (amount_paid - total_amount) STORED,
  payment_method VARCHAR(30) DEFAULT 'cash',
  status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed', 'voided')),
  sale_date TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id),
  quantity INT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  subtotal NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);

-- ============================================================
-- CASHIER BALANCING
-- ============================================================
CREATE TABLE cashier_balances (
  id SERIAL PRIMARY KEY,
  branch_id INT NOT NULL REFERENCES branches(id),
  sales_agent_id INT NOT NULL REFERENCES users(id),
  manager_id INT REFERENCES users(id),
  balance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_cash NUMERIC(14,2) NOT NULL,
  submitted_cash NUMERIC(14,2),
  variance NUMERIC(14,2) GENERATED ALWAYS AS (submitted_cash - expected_cash) STORED,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'flagged')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  UNIQUE (branch_id, sales_agent_id, balance_date)
);

-- ============================================================
-- BUG REPORTS
-- ============================================================
CREATE TABLE bug_reports (
  id SERIAL PRIMARY KEY,
  reported_by INT REFERENCES users(id),
  module VARCHAR(100),
  severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  module VARCHAR(100),
  record_id INT,
  details JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- SYSTEM SETTINGS
-- ============================================================
CREATE TABLE system_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT,
  description TEXT,
  updated_by INT REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_users_branch ON users(branch_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_barcodes_product ON barcodes(product_id);
CREATE INDEX idx_branch_inventory ON branch_inventory(branch_id, product_id);
CREATE INDEX idx_procurements_branch ON procurements(branch_id);
CREATE INDEX idx_procurement_items_procurement ON procurement_items(procurement_id);
CREATE INDEX idx_sales_branch ON sales(branch_id);
CREATE INDEX idx_sales_agent ON sales(sales_agent_id);
CREATE INDEX idx_sales_date ON sales(sale_date);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_inventory_movements_branch ON inventory_movements(branch_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- ============================================================
-- SEED: Default System Settings
-- ============================================================
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
  ('company_name', 'Crown Stores', 'Company name'),
  ('company_address', '123 Main Street, Kampala, Uganda', 'Company address'),
  ('company_phone', '+256 700 000000', 'Company phone'),
  ('receipt_footer', 'Thank you for shopping with Crown Stores!', 'Receipt footer message'),
  ('low_stock_notifications', 'true', 'Enable low stock email alerts'),
  ('session_timeout_minutes', '60', 'Session timeout in minutes');

-- ============================================================
-- SEED: Default Branch
-- ============================================================
INSERT INTO branches (branch_name, location, phone, email, status)
VALUES ('Head Office Branch', 'Kampala, Uganda', '+256 700 000001', 'headoffice@crownstores.com', 'active');

CREATE TABLE "session" (
    sid varchar NOT NULL PRIMARY KEY,
    sess json NOT NULL,
    expire timestamp(6) NOT NULL
);

CREATE INDEX "IDX_session_expire"
ON "session"(expire);
-- ============================================================
-- SEED: Default Director Account
-- password: Admin@1234 (change immediately)
-- ============================================================
-- Run this separately after generating bcrypt hash via Node.js:
-- node -e "const bcrypt=require('bcrypt'); bcrypt.hash('Admin@1234',12).then(h=>console.log(h))"
-- Then: INSERT INTO users (branch_id, full_name, username, email, password_hash, role)
--       VALUES (NULL, 'System Director', 'director', 'director@crownstores.com', '<hash>', 'director');
