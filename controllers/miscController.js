// controllers/categoriesController.js
const pool = require('../config/database');
const { auditLog } = require('../middleware/audit');

exports.getCategories = async (req, res) => {
  const categories = await pool.query(
    `SELECT c.*, u.full_name AS created_by_name, COUNT(p.id) AS product_count
     FROM categories c LEFT JOIN users u ON c.created_by=u.id
     LEFT JOIN products p ON p.category_id=c.id GROUP BY c.id, u.full_name ORDER BY c.category_name`
  );
  res.render('categories/index', { title: 'Categories', user: req.session.user, categories: categories.rows });
};

exports.postCreateCategory = async (req, res) => {
  const { category_name, description } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO categories (category_name, description, created_by) VALUES ($1,$2,$3) RETURNING id`,
      [category_name, description, req.session.user.id]
    );
    await auditLog(req.session.user.id, 'CATEGORY_CREATED', 'Categories', result.rows[0].id, { category_name }, req.ip);
    req.flash('success', `Category "${category_name}" created.`);
  } catch (err) {
    req.flash('error', 'Category name must be unique.');
  }
  res.redirect('/categories');
};

exports.postEditCategory = async (req, res) => {
  const { id } = req.params;
  const { category_name, description, status } = req.body;
  await pool.query(`UPDATE categories SET category_name=$1,description=$2,status=$3,updated_at=NOW() WHERE id=$4`, [category_name, description, status, id]);
  req.flash('success', 'Category updated.');
  res.redirect('/categories');
};

exports.toggleCategoryStatus = async (req, res) => {
  const { id } = req.params;
  await pool.query(`UPDATE categories SET status=CASE WHEN status='active' THEN 'inactive' ELSE 'active' END WHERE id=$1`, [id]);
  req.flash('success', 'Category status updated.');
  res.redirect('/categories');
};

// ─── Branches ────────────────────────────────────────────────────────────────
exports.getBranches = async (req, res) => {
  const branches = await pool.query(
    `SELECT b.*, COUNT(u.id) AS user_count FROM branches b LEFT JOIN users u ON u.branch_id=b.id GROUP BY b.id ORDER BY b.branch_name`
  );
  res.render('branches/index', { title: 'Branches', user: req.session.user, branches: branches.rows });
};

exports.postCreateBranch = async (req, res) => {
  const { branch_name, location, phone, email } = req.body;
  try {
    await pool.query(`INSERT INTO branches (branch_name, location, phone, email) VALUES ($1,$2,$3,$4)`, [branch_name, location, phone, email]);
    req.flash('success', `Branch "${branch_name}" created.`);
  } catch (err) {
    req.flash('error', 'Branch name must be unique.');
  }
  res.redirect('/branches');
};

exports.postEditBranch = async (req, res) => {
  const { id } = req.params;
  const { branch_name, location, phone, email, status } = req.body;
  await pool.query(`UPDATE branches SET branch_name=$1,location=$2,phone=$3,email=$4,status=$5,updated_at=NOW() WHERE id=$6`, [branch_name, location, phone, email, status, id]);
  req.flash('success', 'Branch updated.');
  res.redirect('/branches');
};

// ─── Suppliers ───────────────────────────────────────────────────────────────
exports.getSuppliers = async (req, res) => {
  const suppliers = await pool.query(`SELECT * FROM suppliers ORDER BY supplier_name`);
  res.render('suppliers/index', { title: 'Suppliers', user: req.session.user, suppliers: suppliers.rows });
};

exports.postCreateSupplier = async (req, res) => {
  const { supplier_name, contact_person, phone, email, address } = req.body;
  await pool.query(`INSERT INTO suppliers (supplier_name,contact_person,phone,email,address) VALUES ($1,$2,$3,$4,$5)`, [supplier_name, contact_person, phone, email, address]);
  req.flash('success', `Supplier "${supplier_name}" added.`);
  res.redirect('/suppliers');
};

exports.postEditSupplier = async (req, res) => {
  const { id } = req.params;
  const { supplier_name, contact_person, phone, email, address, status } = req.body;
  await pool.query(`UPDATE suppliers SET supplier_name=$1,contact_person=$2,phone=$3,email=$4,address=$5,status=$6,updated_at=NOW() WHERE id=$7`, [supplier_name, contact_person, phone, email, address, status, id]);
  req.flash('success', 'Supplier updated.');
  res.redirect('/suppliers');
};

// ─── Cashier Balancing ───────────────────────────────────────────────────────
exports.getCashierBalancing = async (req, res) => {
  const branchId = req.session.user.branch_id;
  const { date = new Date().toISOString().split('T')[0] } = req.query;
  const agents = await pool.query(
    `SELECT u.id, u.full_name,
            COALESCE(SUM(s.total_amount),0) AS expected_cash,
            COUNT(s.id) AS sale_count,
            cb.submitted_cash, cb.variance, cb.status AS balance_status
     FROM users u
     LEFT JOIN sales s ON s.sales_agent_id=u.id AND DATE(s.sale_date)=$1 AND s.status='completed'
     LEFT JOIN cashier_balances cb ON cb.sales_agent_id=u.id AND cb.balance_date=$1 AND cb.branch_id=$2
     WHERE u.branch_id=$2 AND u.role='sales_agent' AND u.status='active'
     GROUP BY u.id, u.full_name, cb.submitted_cash, cb.variance, cb.status`,
    [date, branchId]
  );
  res.render('cashier/index', { title: 'Cashier Balancing', user: req.session.user, agents: agents.rows, date });
};

exports.postApproveBalance = async (req, res) => {
  const { agent_id, balance_date, submitted_cash, expected_cash, notes } = req.body;
  const branchId = req.session.user.branch_id;
  const managerId = req.session.user.id;
  await pool.query(
    `INSERT INTO cashier_balances (branch_id, sales_agent_id, manager_id, balance_date, expected_cash, submitted_cash, notes, status, approved_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (branch_id, sales_agent_id, balance_date) DO UPDATE
     SET submitted_cash=$6, notes=$7, status=$8, approved_at=NOW(), manager_id=$3`,
    [branchId, agent_id, managerId, balance_date, expected_cash, submitted_cash,
     notes, Math.abs(submitted_cash - expected_cash) > 0 ? 'flagged' : 'approved']
  );
  req.flash('success', 'Cashier balance recorded.');
  res.redirect(`/cashier?date=${balance_date}`);
};

// ─── Notifications ───────────────────────────────────────────────────────────
exports.getLowStockAlerts = async (req, res) => {
  const branchId = req.session.user.branch_id;
  const alerts = await pool.query(
    `SELECT p.product_name, bi.quantity_available, p.reorder_level, c.category_name,
            CASE WHEN bi.quantity_available=0 THEN 'out_of_stock' ELSE 'low_stock' END AS alert_type
     FROM branch_inventory bi JOIN products p ON bi.product_id=p.id
     JOIN categories c ON p.category_id=c.id
     WHERE bi.branch_id=$1 AND bi.quantity_available <= p.reorder_level
     ORDER BY bi.quantity_available ASC`,
    [branchId]
  );
  res.render('notifications/alerts', { title: 'Stock Alerts', user: req.session.user, alerts: alerts.rows });
};

// ─── Bug Reports ─────────────────────────────────────────────────────────────
const { sendBugReport } = require('../config/mailer');

exports.getBugReport = (req, res) => {
  res.render('notifications/bug-report', { title: 'Report a Bug', user: req.session.user });
};

exports.postBugReport = async (req, res) => {
  const { module: mod, severity, description } = req.body;
  const user = req.session.user;
  try {
    await pool.query(
      `INSERT INTO bug_reports (reported_by, module, severity, description) VALUES ($1,$2,$3,$4)`,
      [user.id, mod, severity, description]
    );
    await sendBugReport({ reportedBy: user.full_name, userEmail: user.email, description, module: mod, severity });
    req.flash('success', 'Bug report submitted. Thank you!');
  } catch (err) {
    req.flash('error', 'Failed to submit bug report.');
  }
  res.redirect('/bug-report');
};

// ─── Audit Logs ──────────────────────────────────────────────────────────────
exports.getAuditLogs = async (req, res) => {
  const { user_id, module: mod, date_from, date_to } = req.query;
  let query = `SELECT al.*, u.full_name, u.username FROM audit_logs al LEFT JOIN users u ON al.user_id=u.id WHERE 1=1`;
  const params = [];
  if (user_id) { query += ` AND al.user_id=$${params.length+1}`; params.push(user_id); }
  if (mod) { query += ` AND al.module=$${params.length+1}`; params.push(mod); }
  if (date_from) { query += ` AND DATE(al.created_at)>=$${params.length+1}`; params.push(date_from); }
  if (date_to) { query += ` AND DATE(al.created_at)<=$${params.length+1}`; params.push(date_to); }
  query += ' ORDER BY al.created_at DESC LIMIT 500';

  const [logs, users] = await Promise.all([
    pool.query(query, params),
    pool.query(`SELECT id, full_name, username FROM users ORDER BY full_name`),
  ]);
  res.render('maintenance/audit-logs', {
    title: 'Audit Logs',
    user: req.session.user,
    logs: logs.rows,
    users: users.rows,
    filters: { user_id, mod, date_from, date_to },
  });
};

// ─── Maintenance ─────────────────────────────────────────────────────────────
exports.getMaintenance = async (req, res) => {
  const [settings, bugReports] = await Promise.all([
    pool.query(`SELECT * FROM system_settings ORDER BY setting_key`),
    pool.query(`SELECT br.*, u.full_name AS reporter FROM bug_reports br LEFT JOIN users u ON br.reported_by=u.id ORDER BY br.created_at DESC`),
  ]);
  res.render('maintenance/index', {
    title: 'System Maintenance',
    user: req.session.user,
    settings: settings.rows,
    bugReports: bugReports.rows,
  });
};

exports.postUpdateSettings = async (req, res) => {
  const { settings } = req.body;
  try {
    for (const [key, value] of Object.entries(settings)) {
      await pool.query(
        `UPDATE system_settings SET setting_value=$1, updated_by=$2, updated_at=NOW() WHERE setting_key=$3`,
        [value, req.session.user.id, key]
      );
    }
    await auditLog(req.session.user.id, 'SETTINGS_UPDATED', 'Maintenance', null, null, req.ip);
    req.flash('success', 'System settings updated.');
  } catch (err) {
    req.flash('error', 'Failed to update settings.');
  }
  res.redirect('/maintenance');
};

exports.postUpdateBugStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  await pool.query(`UPDATE bug_reports SET status=$1, updated_at=NOW() WHERE id=$2`, [status, id]);
  req.flash('success', 'Bug report status updated.');
  res.redirect('/maintenance');
};
