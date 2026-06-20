// controllers/procurementController.js
const pool = require('../config/database');
const { auditLog } = require('../middleware/audit');

exports.getProcurements = async (req, res) => {
  const branchId = req.session.user.branch_id;
  const { date_from, date_to, supplier_id } = req.query;
  let query = `
    SELECT pr.*, s.supplier_name, b.branch_name, u.full_name AS recorded_by
    FROM procurements pr
    LEFT JOIN suppliers s ON pr.supplier_id=s.id
    JOIN branches b ON pr.branch_id=b.id
    JOIN users u ON pr.recorded_by=u.id
    WHERE pr.branch_id=$1
  `;
  const params = [branchId];
  if (date_from) { query += ` AND pr.procurement_date>=$${params.length+1}`; params.push(date_from); }
  if (date_to) { query += ` AND pr.procurement_date<=$${params.length+1}`; params.push(date_to); }
  if (supplier_id) { query += ` AND pr.supplier_id=$${params.length+1}`; params.push(supplier_id); }
  query += ' ORDER BY pr.created_at DESC';

  const [procurements, suppliers] = await Promise.all([
    pool.query(query, params),
    pool.query(`SELECT id, supplier_name FROM suppliers WHERE status='active' ORDER BY supplier_name`),
  ]);
  res.render('procurement/index', {
    title: 'Procurements',
    user: req.session.user,
    procurements: procurements.rows,
    suppliers: suppliers.rows,
    filters: { date_from, date_to, supplier_id },
  });
};

exports.getCreateProcurement = async (req, res) => {
  const [suppliers, products, branches] = await Promise.all([
    pool.query(`SELECT id, supplier_name FROM suppliers WHERE status='active' ORDER BY supplier_name`),
    pool.query(`SELECT p.id, p.product_name, p.cost_price FROM products p WHERE p.status='active' ORDER BY p.product_name`),
    pool.query(`SELECT id, branch_name FROM branches WHERE status='active' ORDER BY branch_name`),
  ]);
  res.render('procurement/create', {
    title: 'Record Procurement',
    user: req.session.user,
    suppliers: suppliers.rows,
    products: products.rows,
    branches: branches.rows,
  });
};

exports.postCreateProcurement = async (req, res) => {
  const { supplier_id, reference_number, notes, procurement_date, items, branch_id } = req.body;
  // Directors choose a branch via the form; managers use their own branch
  const branchId = req.session.user.role === 'director'
    ? (branch_id || null)
    : req.session.user.branch_id;
  const userId = req.session.user.id;

  if (!branchId) {
    req.flash('error', 'Please select a branch for this procurement.');
    return res.redirect('/procurement/create');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
    const totalCost = parsedItems.reduce((sum, i) => sum + (i.quantity * i.unit_cost), 0);

    const procResult = await client.query(
      `INSERT INTO procurements (branch_id, supplier_id, recorded_by, reference_number, notes, total_cost, procurement_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [branchId, supplier_id || null, userId, reference_number, notes, totalCost, procurement_date || new Date()]
    );
    const procId = procResult.rows[0].id;

    for (const item of parsedItems) {
      await client.query(
        `INSERT INTO procurement_items (procurement_id, product_id, quantity, unit_cost) VALUES ($1,$2,$3,$4)`,
        [procId, item.product_id, item.quantity, item.unit_cost]
      );
      // Update branch inventory
      const current = await client.query(
        `SELECT quantity_available FROM branch_inventory WHERE product_id=$1 AND branch_id=$2`,
        [item.product_id, branchId]
      );
      const qtyBefore = current.rows[0]?.quantity_available || 0;
      const qtyAfter = qtyBefore + parseInt(item.quantity);

      if (current.rows.length) {
        await client.query(`UPDATE branch_inventory SET quantity_available=$1, updated_at=NOW() WHERE product_id=$2 AND branch_id=$3`, [qtyAfter, item.product_id, branchId]);
      } else {
        await client.query(`INSERT INTO branch_inventory (branch_id, product_id, quantity_available) VALUES ($1,$2,$3)`, [branchId, item.product_id, qtyAfter]);
      }
      await client.query(
        `INSERT INTO inventory_movements (branch_id, product_id, movement_type, quantity_change, quantity_before, quantity_after, reference_id, recorded_by)
         VALUES ($1,$2,'procurement',$3,$4,$5,$6,$7)`,
        [branchId, item.product_id, item.quantity, qtyBefore, qtyAfter, procId, userId]
      );
    }
    await client.query('COMMIT');
    await auditLog(userId, 'PROCUREMENT_RECORDED', 'Procurement', procId, { total: totalCost }, req.ip);
    req.flash('success', 'Procurement recorded successfully. Inventory updated.');
    res.redirect('/procurement');
  } catch (err) {
    await client.query('ROLLBACK');
    req.flash('error', err.message || 'Failed to record procurement.');
    res.redirect('/procurement/create');
  } finally {
    client.release();
  }
};

exports.getProcurementDetail = async (req, res) => {
  const { id } = req.params;
  const [proc, items] = await Promise.all([
    pool.query(`SELECT pr.*, s.supplier_name, b.branch_name, u.full_name AS recorded_by
                FROM procurements pr LEFT JOIN suppliers s ON pr.supplier_id=s.id
                JOIN branches b ON pr.branch_id=b.id JOIN users u ON pr.recorded_by=u.id
                WHERE pr.id=$1`, [id]),
    pool.query(`SELECT pi.*, p.product_name FROM procurement_items pi JOIN products p ON pi.product_id=p.id WHERE pi.procurement_id=$1`, [id]),
  ]);
  if (!proc.rows.length) { req.flash('error', 'Procurement not found.'); return res.redirect('/procurement'); }
  res.render('procurement/detail', {
    title: 'Procurement Details',
    user: req.session.user,
    procurement: proc.rows[0],
    items: items.rows,
  });
};
