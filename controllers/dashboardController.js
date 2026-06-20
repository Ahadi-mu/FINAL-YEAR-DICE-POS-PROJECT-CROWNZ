// controllers/dashboardController.js
const pool = require('../config/database');

exports.getDashboard = async (req, res) => {
  const user = req.session.user;
  try {
    if (user.role === 'director') {
      return await renderDirectorDashboard(req, res);
    } else if (user.role === 'manager') {
      return await renderManagerDashboard(req, res);
    } else {
      return await renderSalesDashboard(req, res);
    }
  } catch (err) {
    console.error('Dashboard error:', err);
    req.flash('error', 'Failed to load dashboard.');
    res.render('dashboard/index', { title: 'Dashboard', stats: {}, user });
  }
};

async function renderDirectorDashboard(req, res) {
  const [branchCount, totalSales, totalInventoryValue, topProducts, branchPerformance, procurementTotal] =
    await Promise.all([
      pool.query(`SELECT COUNT(*) FROM branches WHERE status = 'active'`),
      pool.query(`SELECT COALESCE(SUM(total_amount),0) AS total FROM sales WHERE status='completed'`),
      pool.query(`SELECT COALESCE(SUM(bi.quantity_available * p.cost_price),0) AS total FROM branch_inventory bi JOIN products p ON bi.product_id = p.id`),
      pool.query(`SELECT p.product_name, SUM(si.quantity) AS qty_sold, SUM(si.subtotal) AS revenue
                  FROM sale_items si JOIN products p ON si.product_id = p.id
                  JOIN sales s ON si.sale_id = s.id WHERE s.status='completed'
                  GROUP BY p.product_name ORDER BY qty_sold DESC LIMIT 5`),
      pool.query(`SELECT b.branch_name, COALESCE(SUM(s.total_amount),0) AS total_sales
                  FROM branches b LEFT JOIN sales s ON b.id = s.branch_id AND s.status='completed'
                  GROUP BY b.branch_name ORDER BY total_sales DESC`),
      pool.query(`SELECT COALESCE(SUM(total_cost),0) AS total FROM procurements`),
    ]);

  res.render('dashboard/director', {
    title: 'Director Dashboard',
    user: req.session.user,
    stats: {
      branchCount: branchCount.rows[0].count,
      totalSales: totalSales.rows[0].total,
      inventoryValue: totalInventoryValue.rows[0].total,
      procurementTotal: procurementTotal.rows[0].total,
    },
    topProducts: topProducts.rows,
    branchPerformance: branchPerformance.rows,
  });
}

async function renderManagerDashboard(req, res) {
  const branchId = req.session.user.branch_id;
  const today = new Date().toISOString().split('T')[0];

  const [dailySales, inventorySummary, lowStock, recentProcurements, cashierSummary] =
    await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(total_amount),0) AS total, COUNT(*) AS count FROM sales
         WHERE branch_id=$1 AND status='completed' AND DATE(sale_date)=$2`,
        [branchId, today]
      ),
      pool.query(
        `SELECT COUNT(*) AS total_products,
                SUM(CASE WHEN bi.quantity_available <= p.reorder_level THEN 1 ELSE 0 END) AS low_stock,
                SUM(CASE WHEN bi.quantity_available = 0 THEN 1 ELSE 0 END) AS out_of_stock
         FROM branch_inventory bi JOIN products p ON bi.product_id=p.id
         WHERE bi.branch_id=$1`,
        [branchId]
      ),
      pool.query(
        `SELECT p.product_name, bi.quantity_available, p.reorder_level
         FROM branch_inventory bi JOIN products p ON bi.product_id=p.id
         WHERE bi.branch_id=$1 AND bi.quantity_available <= p.reorder_level
         ORDER BY bi.quantity_available ASC LIMIT 5`,
        [branchId]
      ),
      pool.query(
        `SELECT pr.*, s.supplier_name FROM procurements pr
         LEFT JOIN suppliers s ON pr.supplier_id=s.id
         WHERE pr.branch_id=$1 ORDER BY pr.created_at DESC LIMIT 5`,
        [branchId]
      ),
      pool.query(
        `SELECT u.full_name, COALESCE(SUM(s.total_amount),0) AS total_sales, COUNT(s.id) AS sale_count
         FROM users u LEFT JOIN sales s ON u.id=s.sales_agent_id AND DATE(s.sale_date)=$2 AND s.status='completed'
         WHERE u.branch_id=$1 AND u.role='sales_agent' AND u.status='active'
         GROUP BY u.id, u.full_name`,
        [branchId, today]
      ),
    ]);

  res.render('dashboard/manager', {
    title: 'Manager Dashboard',
    user: req.session.user,
    dailySales: dailySales.rows[0],
    inventory: inventorySummary.rows[0],
    lowStockItems: lowStock.rows,
    recentProcurements: recentProcurements.rows,
    cashierSummary: cashierSummary.rows,
  });
}

async function renderSalesDashboard(req, res) {
  const branchId = req.session.user.branch_id;
  const agentId = req.session.user.id;
  const today = new Date().toISOString().split('T')[0];

  const [myDailySales, recentSales] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(total_amount),0) AS total, COUNT(*) AS count
       FROM sales WHERE sales_agent_id=$1 AND DATE(sale_date)=$2 AND status='completed'`,
      [agentId, today]
    ),
    pool.query(
      `SELECT s.receipt_number, s.total_amount, s.sale_date
       FROM sales s WHERE s.sales_agent_id=$1 AND s.status='completed'
       ORDER BY s.sale_date DESC LIMIT 5`,
      [agentId]
    ),
  ]);

  res.render('dashboard/sales-agent', {
    title: 'Sales Dashboard',
    user: req.session.user,
    myDailySales: myDailySales.rows[0],
    recentSales: recentSales.rows,
  });
}
