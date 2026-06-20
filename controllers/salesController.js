// controllers/salesController.js
const pool = require('../config/database');
const { auditLog } = require('../middleware/audit');
const { generateReceiptPDF } = require('../utils/pdfGenerator');

exports.getPOS = async (req, res) => {
  res.render('sales/pos', {
    title: 'Point of Sale',
    user: req.session.user,
  });
};

// Search product by name or barcode (AJAX)
exports.searchProduct = async (req, res) => {
  const { q } = req.query;
  const branchId = req.session.user.branch_id;
  try {
    const result = await pool.query(
      `SELECT p.id, p.product_name, p.selling_price, p.description,
              bi.quantity_available, c.category_name,
              ARRAY_AGG(b.barcode_value) AS barcodes
       FROM products p
       JOIN categories c ON p.category_id = c.id
       LEFT JOIN branch_inventory bi ON bi.product_id = p.id AND bi.branch_id = $1
       LEFT JOIN barcodes b ON b.product_id = p.id
       WHERE p.status = 'active'
         AND bi.quantity_available > 0
         AND (LOWER(p.product_name) LIKE LOWER($2) OR b.barcode_value = $3)
       GROUP BY p.id, p.product_name, p.selling_price, p.description, bi.quantity_available, c.category_name
       LIMIT 10`,
      [branchId, `%${q}%`, q]
    );
    res.json({ success: true, products: result.rows });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

// Process sale
exports.processSale = async (req, res) => {
  const { items, amount_paid } = req.body;
  const agentId = req.session.user.id;
  const branchId = req.session.user.branch_id;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    let parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
    let totalAmount = 0;

    // Validate stock and calculate total
    for (const item of parsedItems) {
      const stock = await client.query(
        `SELECT bi.quantity_available, p.selling_price, p.product_name
         FROM branch_inventory bi JOIN products p ON p.id = bi.product_id
         WHERE bi.product_id = $1 AND bi.branch_id = $2`,
        [item.product_id, branchId]
      );
      if (!stock.rows.length || stock.rows[0].quantity_available < item.quantity) {
        throw new Error(`Insufficient stock for ${stock.rows[0]?.product_name || 'product'}`);
      }
      totalAmount += stock.rows[0].selling_price * item.quantity;
    }

    if (parseFloat(amount_paid) < totalAmount) {
      throw new Error('Amount paid is less than total amount.');
    }

    // Generate receipt number
    const receiptNum = `RCP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Insert sale
    const saleResult = await client.query(
      `INSERT INTO sales (branch_id, sales_agent_id, receipt_number, total_amount, amount_paid)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [branchId, agentId, receiptNum, totalAmount, amount_paid]
    );
    const saleId = saleResult.rows[0].id;

    // Insert sale items, reduce stock, record movement
    for (const item of parsedItems) {
      const productData = await client.query(
        `SELECT selling_price FROM products WHERE id = $1`, [item.product_id]
      );
      const unitPrice = productData.rows[0].selling_price;

      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [saleId, item.product_id, item.quantity, unitPrice]
      );

      // Get current stock
      const currentStock = await client.query(
        `SELECT quantity_available FROM branch_inventory WHERE product_id=$1 AND branch_id=$2`,
        [item.product_id, branchId]
      );
      const qtyBefore = currentStock.rows[0].quantity_available;
      const qtyAfter = qtyBefore - item.quantity;

      // Reduce stock
      await client.query(
        `UPDATE branch_inventory SET quantity_available = quantity_available - $1, updated_at = NOW()
         WHERE product_id = $2 AND branch_id = $3`,
        [item.quantity, item.product_id, branchId]
      );

      // Inventory movement
      await client.query(
        `INSERT INTO inventory_movements (branch_id, product_id, movement_type, quantity_change, quantity_before, quantity_after, reference_id, recorded_by)
         VALUES ($1, $2, 'sale', $3, $4, $5, $6, $7)`,
        [branchId, item.product_id, -item.quantity, qtyBefore, qtyAfter, saleId, agentId]
      );
    }

    await client.query('COMMIT');
    await auditLog(agentId, 'SALE_PROCESSED', 'Sales', saleId, { receipt: receiptNum, total: totalAmount }, req.ip);

    res.json({ success: true, saleId, receiptNumber: receiptNum, totalAmount });
  } catch (err) {
    await client.query('ROLLBACK');
    res.json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};

exports.getSaleHistory = async (req, res) => {
  const user = req.session.user;
  const { date_from, date_to, agent_id } = req.query;
  try {
    let query = `
      SELECT s.*, u.full_name AS agent_name, b.branch_name,
             COUNT(si.id) AS item_count
      FROM sales s
      JOIN users u ON s.sales_agent_id = u.id
      JOIN branches b ON s.branch_id = b.id
      LEFT JOIN sale_items si ON s.id = si.sale_id
    `;
    const params = [];
    const conditions = [];

    if (user.role === 'manager') {
      conditions.push(`s.branch_id = $${params.length + 1}`);
      params.push(user.branch_id);
    } else if (user.role === 'sales_agent') {
      conditions.push(`s.sales_agent_id = $${params.length + 1}`);
      params.push(user.id);
    }
    if (date_from) { conditions.push(`DATE(s.sale_date) >= $${params.length + 1}`); params.push(date_from); }
    if (date_to) { conditions.push(`DATE(s.sale_date) <= $${params.length + 1}`); params.push(date_to); }
    if (agent_id && user.role === 'manager') { conditions.push(`s.sales_agent_id = $${params.length + 1}`); params.push(agent_id); }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' GROUP BY s.id, u.full_name, b.branch_name ORDER BY s.sale_date DESC LIMIT 100';

    const result = await pool.query(query, params);
    res.render('sales/history', {
      title: 'Sales History',
      user,
      sales: result.rows,
      filters: { date_from, date_to, agent_id },
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load sales history.');
    res.redirect('/dashboard');
  }
};

exports.getReceipt = async (req, res) => {
  const { id } = req.params;
  try {
    const sale = await pool.query(
      `SELECT s.*, u.full_name AS agent_name, b.branch_name
       FROM sales s JOIN users u ON s.sales_agent_id=u.id JOIN branches b ON s.branch_id=b.id
       WHERE s.id=$1`, [id]
    );
    const items = await pool.query(
      `SELECT si.*, p.product_name FROM sale_items si JOIN products p ON si.product_id=p.id
       WHERE si.sale_id=$1`, [id]
    );
    if (!sale.rows.length) {
      req.flash('error', 'Receipt not found.');
      return res.redirect('/sales/history');
    }
    res.render('receipts/view', {
      title: `Receipt ${sale.rows[0].receipt_number}`,
      user: req.session.user,
      sale: sale.rows[0],
      items: items.rows,
    });
  } catch (err) {
    req.flash('error', 'Failed to load receipt.');
    res.redirect('/sales/history');
  }
};

exports.downloadReceiptPDF = async (req, res) => {
  const { id } = req.params;
  try {
    const sale = await pool.query(
      `SELECT s.*, u.full_name AS agent_name, b.branch_name
       FROM sales s JOIN users u ON s.sales_agent_id=u.id JOIN branches b ON s.branch_id=b.id
       WHERE s.id=$1`, [id]
    );
    const items = await pool.query(
      `SELECT si.*, p.product_name FROM sale_items si JOIN products p ON si.product_id=p.id
       WHERE si.sale_id=$1`, [id]
    );
    if (!sale.rows.length) return res.status(404).send('Receipt not found');
    await generateReceiptPDF(res, sale.rows[0], items.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error generating PDF');
  }
};
