// controllers/inventoryController.js
const pool = require('../config/database');
const { auditLog } = require('../middleware/audit');
const { sendLowStockAlert } = require('../config/mailer');

exports.getInventory = async (req, res) => {
  const branchId = req.session.user.branch_id;
  const { search, category_id, stock_status } = req.query;
  try {
    let query = `
      SELECT p.id, p.product_name, p.selling_price, p.cost_price, p.reorder_level,
             p.unit, c.category_name, bi.quantity_available,
             CASE WHEN bi.quantity_available = 0 THEN 'out_of_stock'
                  WHEN bi.quantity_available <= p.reorder_level THEN 'low_stock'
                  ELSE 'in_stock' END AS stock_status
      FROM products p
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN branch_inventory bi ON bi.product_id = p.id AND bi.branch_id = $1
      WHERE p.status = 'active'
    `;
    const params = [branchId];
    if (search) { query += ` AND LOWER(p.product_name) LIKE LOWER($${params.length + 1})`; params.push(`%${search}%`); }
    if (category_id) { query += ` AND p.category_id = $${params.length + 1}`; params.push(category_id); }
    if (stock_status === 'low') query += ` AND bi.quantity_available <= p.reorder_level AND bi.quantity_available > 0`;
    if (stock_status === 'out') query += ` AND (bi.quantity_available = 0 OR bi.quantity_available IS NULL)`;
    query += ' ORDER BY p.product_name';

    const [inventory, categories] = await Promise.all([
      pool.query(query, params),
      pool.query(`SELECT id, category_name FROM categories WHERE status='active' ORDER BY category_name`),
    ]);

    res.render('inventory/index', {
      title: 'Inventory',
      user: req.session.user,
      inventory: inventory.rows,
      categories: categories.rows,
      filters: { search, category_id, stock_status },
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load inventory.');
    res.redirect('/dashboard');
  }
};

exports.getAdjustStock = async (req, res) => {
  const { product_id } = req.params;
  const branchId = req.session.user.branch_id;
  try {
    const product = await pool.query(
      `SELECT p.*, bi.quantity_available FROM products p
       LEFT JOIN branch_inventory bi ON bi.product_id=p.id AND bi.branch_id=$1
       WHERE p.id=$2`,
      [branchId, product_id]
    );
    if (!product.rows.length) {
      req.flash('error', 'Product not found.');
      return res.redirect('/inventory');
    }
    res.render('inventory/adjust', {
      title: 'Stock Adjustment',
      user: req.session.user,
      product: product.rows[0],
    });
  } catch (err) {
    req.flash('error', 'Failed to load adjustment form.');
    res.redirect('/inventory');
  }
};

exports.postAdjustStock = async (req, res) => {
  const { product_id } = req.params;
  const { adjustment_quantity, reason } = req.body;
  const branchId = req.session.user.branch_id;
  const userId = req.session.user.id;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT quantity_available FROM branch_inventory WHERE product_id=$1 AND branch_id=$2`,
      [product_id, branchId]
    );
    const qtyBefore = current.rows[0]?.quantity_available || 0;
    const qtyAfter = qtyBefore + parseInt(adjustment_quantity);

    if (qtyAfter < 0) throw new Error('Stock cannot go below zero.');

    if (current.rows.length) {
      await client.query(
        `UPDATE branch_inventory SET quantity_available=$1, updated_at=NOW() WHERE product_id=$2 AND branch_id=$3`,
        [qtyAfter, product_id, branchId]
      );
    } else {
      await client.query(
        `INSERT INTO branch_inventory (branch_id, product_id, quantity_available) VALUES ($1,$2,$3)`,
        [branchId, product_id, qtyAfter]
      );
    }

    const adj = await client.query(
      `INSERT INTO stock_adjustments (branch_id, product_id, adjusted_by, adjustment_quantity, reason)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [branchId, product_id, userId, adjustment_quantity, reason]
    );

    await client.query(
      `INSERT INTO inventory_movements (branch_id, product_id, movement_type, quantity_change, quantity_before, quantity_after, reference_id, notes, recorded_by)
       VALUES ($1,$2,'adjustment',$3,$4,$5,$6,$7,$8)`,
      [branchId, product_id, parseInt(adjustment_quantity), qtyBefore, qtyAfter, adj.rows[0].id, reason, userId]
    );

    await client.query('COMMIT');
    await auditLog(userId, 'STOCK_ADJUSTED', 'Inventory', product_id, { adjustment_quantity, reason, qtyBefore, qtyAfter }, req.ip);
    req.flash('success', 'Stock adjusted successfully.');
    res.redirect('/inventory');
  } catch (err) {
    await client.query('ROLLBACK');
    req.flash('error', err.message || 'Adjustment failed.');
    res.redirect(`/inventory/adjust/${product_id}`);
  } finally {
    client.release();
  }
};

exports.getMovementHistory = async (req, res) => {
  const branchId = req.session.user.branch_id;
  const { product_id, movement_type, date_from, date_to } = req.query;
  try {
    let query = `
      SELECT im.*, p.product_name, u.full_name AS recorded_by_name
      FROM inventory_movements im
      JOIN products p ON im.product_id = p.id
      LEFT JOIN users u ON im.recorded_by = u.id
      WHERE im.branch_id = $1
    `;
    const params = [branchId];
    if (product_id) { query += ` AND im.product_id = $${params.length+1}`; params.push(product_id); }
    if (movement_type) { query += ` AND im.movement_type = $${params.length+1}`; params.push(movement_type); }
    if (date_from) { query += ` AND DATE(im.created_at) >= $${params.length+1}`; params.push(date_from); }
    if (date_to) { query += ` AND DATE(im.created_at) <= $${params.length+1}`; params.push(date_to); }
    query += ' ORDER BY im.created_at DESC LIMIT 200';

    const result = await pool.query(query, params);
    const products = await pool.query(`SELECT id, product_name FROM products WHERE status='active' ORDER BY product_name`);

    res.render('inventory/movements', {
      title: 'Inventory Movement History',
      user: req.session.user,
      movements: result.rows,
      products: products.rows,
      filters: { product_id, movement_type, date_from, date_to },
    });
  } catch (err) {
    req.flash('error', 'Failed to load movement history.');
    res.redirect('/inventory');
  }
};
