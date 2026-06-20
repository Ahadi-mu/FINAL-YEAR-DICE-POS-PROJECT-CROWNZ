// controllers/reportsController.js
const pool = require('../config/database');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

// ─── Helper: PDF header ───────────────────────────────────────────────────────
function pdfHeader(doc, title) {
  doc.fontSize(18).font('Helvetica-Bold').text('Crown Stores', { align: 'center' });
  doc.fontSize(12).font('Helvetica').text('Retail Management System', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(14).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.fontSize(10).font('Helvetica').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown(1);
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown(0.5);
}

// ─── Helper: Excel header ────────────────────────────────────────────────────
function xlsxHeader(sheet, title, columns) {
  sheet.addRow([`Crown Stores - ${title}`]);
  sheet.getRow(1).font = { bold: true, size: 14 };
  sheet.addRow([`Generated: ${new Date().toLocaleString()}`]);
  sheet.addRow([]);
  const headerRow = sheet.addRow(columns);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A56DB' } };
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  return 4; // data starts at row 5
}

// ═══════════════════════════════════════════════════════════════════
// DAILY SALES REPORT
// ═══════════════════════════════════════════════════════════════════
exports.getDailySalesReport = async (req, res) => {
  const { date = new Date().toISOString().split('T')[0], branch_id } = req.query;
  const user = req.session.user;
  const bId = user.role === 'director' ? branch_id : user.branch_id;
  try {
    const [sales, summary, branches] = await Promise.all([
      pool.query(
        `SELECT s.receipt_number, u.full_name AS agent_name, s.total_amount, s.sale_date,
                COUNT(si.id) AS items
         FROM sales s JOIN users u ON s.sales_agent_id=u.id
         LEFT JOIN sale_items si ON si.sale_id=s.id
         WHERE s.status='completed' AND DATE(s.sale_date)=$1
           ${bId ? 'AND s.branch_id=$2' : ''}
         GROUP BY s.id, u.full_name ORDER BY s.sale_date`,
        bId ? [date, bId] : [date]
      ),
      pool.query(
        `SELECT COALESCE(SUM(total_amount),0) AS total, COUNT(*) AS count
         FROM sales WHERE status='completed' AND DATE(sale_date)=$1
           ${bId ? 'AND branch_id=$2' : ''}`,
        bId ? [date, bId] : [date]
      ),
      user.role === 'director'
        ? pool.query(`SELECT id, branch_name FROM branches WHERE status='active' ORDER BY branch_name`)
        : Promise.resolve({ rows: [] }),
    ]);
    res.render('reports/daily-sales', {
      title: 'Daily Sales Report',
      user,
      sales: sales.rows,
      summary: summary.rows[0],
      branches: branches.rows,
      filters: { date, branch_id: bId },
    });
  } catch (err) {
    req.flash('error', 'Failed to load report.');
    res.redirect('/dashboard');
  }
};

// ═══════════════════════════════════════════════════════════════════
// INVENTORY REPORT
// ═══════════════════════════════════════════════════════════════════
exports.getInventoryReport = async (req, res) => {
  const user = req.session.user;
  const bId = user.role === 'director' ? req.query.branch_id : user.branch_id;
  try {
    const result = await pool.query(
      `SELECT p.product_name, c.category_name, bi.quantity_available,
              p.reorder_level, p.cost_price, p.selling_price,
              (bi.quantity_available * p.cost_price) AS inventory_value,
              CASE WHEN bi.quantity_available=0 THEN 'Out of Stock'
                   WHEN bi.quantity_available<=p.reorder_level THEN 'Low Stock'
                   ELSE 'OK' END AS stock_status
       FROM products p JOIN categories c ON p.category_id=c.id
       LEFT JOIN branch_inventory bi ON bi.product_id=p.id AND bi.branch_id=$1
       WHERE p.status='active' ORDER BY c.category_name, p.product_name`,
      [bId]
    );
    const branches = user.role === 'director'
      ? (await pool.query(`SELECT id, branch_name FROM branches WHERE status='active'`)).rows : [];

    res.render('reports/inventory', {
      title: 'Inventory Report',
      user,
      products: result.rows,
      branches,
      filters: { branch_id: bId },
    });
  } catch (err) {
    req.flash('error', 'Failed to load inventory report.');
    res.redirect('/dashboard');
  }
};

// ═══════════════════════════════════════════════════════════════════
// PROCUREMENT REPORT
// ═══════════════════════════════════════════════════════════════════
exports.getProcurementReport = async (req, res) => {
  const { date_from, date_to } = req.query;
  const user = req.session.user;
  const bId = user.role !== 'director' ? user.branch_id : null;
  try {
    let query = `
      SELECT pr.reference_number, pr.procurement_date, s.supplier_name,
             b.branch_name, u.full_name AS recorded_by, pr.total_cost
      FROM procurements pr
      LEFT JOIN suppliers s ON pr.supplier_id=s.id
      JOIN branches b ON pr.branch_id=b.id
      JOIN users u ON pr.recorded_by=u.id
      WHERE 1=1
    `;
    const params = [];
    if (bId) { query += ` AND pr.branch_id=$${params.length+1}`; params.push(bId); }
    if (date_from) { query += ` AND pr.procurement_date >= $${params.length+1}`; params.push(date_from); }
    if (date_to) { query += ` AND pr.procurement_date <= $${params.length+1}`; params.push(date_to); }
    query += ' ORDER BY pr.procurement_date DESC';

    const result = await pool.query(query, params);
    res.render('reports/procurement', {
      title: 'Procurement Report',
      user,
      procurements: result.rows,
      filters: { date_from, date_to },
    });
  } catch (err) {
    req.flash('error', 'Failed to load procurement report.');
    res.redirect('/dashboard');
  }
};

// ═══════════════════════════════════════════════════════════════════
// COMPANY PERFORMANCE (Director only)
// ═══════════════════════════════════════════════════════════════════
exports.getCompanyReport = async (req, res) => {
  try {
    const [branchPerf, topProducts, topCategories, totalStats] = await Promise.all([
      pool.query(`
        SELECT b.branch_name, COALESCE(SUM(s.total_amount),0) AS total_sales,
               COUNT(s.id) AS sale_count
        FROM branches b LEFT JOIN sales s ON b.id=s.branch_id AND s.status='completed'
        GROUP BY b.id, b.branch_name ORDER BY total_sales DESC`),
      pool.query(`
        SELECT p.product_name, SUM(si.quantity) AS qty_sold, SUM(si.subtotal) AS revenue
        FROM sale_items si JOIN products p ON si.product_id=p.id
        JOIN sales s ON si.sale_id=s.id WHERE s.status='completed'
        GROUP BY p.id, p.product_name ORDER BY revenue DESC LIMIT 10`),
      pool.query(`
        SELECT c.category_name, SUM(si.subtotal) AS revenue
        FROM sale_items si JOIN products p ON si.product_id=p.id
        JOIN categories c ON p.category_id=c.id
        JOIN sales s ON si.sale_id=s.id WHERE s.status='completed'
        GROUP BY c.id, c.category_name ORDER BY revenue DESC LIMIT 5`),
      pool.query(`
        SELECT COALESCE(SUM(total_amount),0) AS total_sales,
               COALESCE((SELECT SUM(total_cost) FROM procurements),0) AS total_procurement,
               COALESCE((SELECT SUM(bi.quantity_available*p.cost_price) FROM branch_inventory bi JOIN products p ON bi.product_id=p.id),0) AS inventory_value
        FROM sales WHERE status='completed'`),
    ]);
    res.render('reports/company', {
      title: 'Company Performance Report',
      user: req.session.user,
      branchPerf: branchPerf.rows,
      topProducts: topProducts.rows,
      topCategories: topCategories.rows,
      stats: totalStats.rows[0],
    });
  } catch (err) {
    req.flash('error', 'Failed to load company report.');
    res.redirect('/dashboard');
  }
};

// ═══════════════════════════════════════════════════════════════════
// EXPORT PDF - Daily Sales
// ═══════════════════════════════════════════════════════════════════
exports.exportSalesPDF = async (req, res) => {
  const { date = new Date().toISOString().split('T')[0] } = req.query;
  const user = req.session.user;
  const bId = user.branch_id;
  try {
    const [sales, summary] = await Promise.all([
      pool.query(
        `SELECT s.receipt_number, u.full_name AS agent_name, s.total_amount, s.sale_date
         FROM sales s JOIN users u ON s.sales_agent_id=u.id
         WHERE s.status='completed' AND DATE(s.sale_date)=$1 AND s.branch_id=$2 ORDER BY s.sale_date`,
        [date, bId]
      ),
      pool.query(
        `SELECT COALESCE(SUM(total_amount),0) AS total, COUNT(*) AS count
         FROM sales WHERE status='completed' AND DATE(sale_date)=$1 AND branch_id=$2`,
        [date, bId]
      ),
    ]);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="sales-report-${date}.pdf"`);
    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);
    pdfHeader(doc, `Daily Sales Report - ${date}`);

    // Table header
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Receipt #', 50, doc.y, { width: 120 });
    doc.text('Agent', 170, doc.y - doc.currentLineHeight(), { width: 180 });
    doc.text('Amount (UGX)', 350, doc.y - doc.currentLineHeight(), { width: 120 });
    doc.text('Time', 470, doc.y - doc.currentLineHeight(), { width: 80 });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9);

    for (const s of sales.rows) {
      const y = doc.y;
      doc.text(s.receipt_number, 50, y, { width: 120 });
      doc.text(s.agent_name, 170, y, { width: 180 });
      doc.text(Number(s.total_amount).toLocaleString(), 350, y, { width: 120 });
      doc.text(new Date(s.sale_date).toLocaleTimeString(), 470, y, { width: 80 });
      doc.moveDown(0.4);
    }

    doc.moveDown(1);
    doc.font('Helvetica-Bold').text(`Total Sales: UGX ${Number(summary.rows[0].total).toLocaleString()} (${summary.rows[0].count} transactions)`);
    doc.end();
  } catch (err) {
    res.status(500).send('Error generating PDF report');
  }
};

// ═══════════════════════════════════════════════════════════════════
// EXPORT EXCEL - Inventory
// ═══════════════════════════════════════════════════════════════════
exports.exportInventoryExcel = async (req, res) => {
  const user = req.session.user;
  const bId = user.branch_id;
  try {
    const result = await pool.query(
      `SELECT p.product_name, c.category_name, bi.quantity_available,
              p.reorder_level, p.cost_price, p.selling_price,
              (bi.quantity_available * p.cost_price) AS inventory_value
       FROM products p JOIN categories c ON p.category_id=c.id
       LEFT JOIN branch_inventory bi ON bi.product_id=p.id AND bi.branch_id=$1
       WHERE p.status='active' ORDER BY c.category_name, p.product_name`,
      [bId]
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CSRMS';
    const sheet = workbook.addWorksheet('Inventory Report');

    xlsxHeader(sheet, 'Inventory Report', [
      'Product Name', 'Category', 'Qty Available', 'Reorder Level',
      'Cost Price', 'Selling Price', 'Inventory Value', 'Status'
    ]);

    for (const p of result.rows) {
      const status = p.quantity_available === 0 ? 'Out of Stock'
        : p.quantity_available <= p.reorder_level ? 'Low Stock' : 'OK';
      const row = sheet.addRow([
        p.product_name, p.category_name, p.quantity_available,
        p.reorder_level, p.cost_price, p.selling_price,
        p.inventory_value || 0, status
      ]);
      if (status === 'Out of Stock') row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
      else if (status === 'Low Stock') row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
    }

    sheet.columns.forEach(col => { col.width = 18; });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="inventory-report.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).send('Error generating Excel report');
  }
};
