// controllers/productsController.js
const pool = require('../config/database');
const { auditLog } = require('../middleware/audit');

exports.getProducts = async (req, res) => {
  const { search, category_id, status } = req.query;
  try {
    let query = `
      SELECT p.*, c.category_name,
             COUNT(b.id) AS barcode_count,
             COALESCE(SUM(bi.quantity_available),0) AS total_stock
      FROM products p
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN barcodes b ON b.product_id = p.id
      LEFT JOIN branch_inventory bi ON bi.product_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (search) { query += ` AND LOWER(p.product_name) LIKE LOWER($${params.length+1})`; params.push(`%${search}%`); }
    if (category_id) { query += ` AND p.category_id=$${params.length+1}`; params.push(category_id); }
    if (status) { query += ` AND p.status=$${params.length+1}`; params.push(status); }
    query += ' GROUP BY p.id, c.category_name ORDER BY p.product_name';

    const [products, categories] = await Promise.all([
      pool.query(query, params),
      pool.query(`SELECT id, category_name FROM categories WHERE status='active' ORDER BY category_name`),
    ]);
    res.render('products/index', {
      title: 'Products',
      user: req.session.user,
      products: products.rows,
      categories: categories.rows,
      filters: { search, category_id, status },
    });
  } catch (err) {
    req.flash('error', 'Failed to load products.');
    res.redirect('/dashboard');
  }
};

exports.getCreateProduct = async (req, res) => {
  const categories = await pool.query(`SELECT id, category_name FROM categories WHERE status='active' ORDER BY category_name`);
  res.render('products/create', { title: 'Create Product', user: req.session.user, categories: categories.rows });
};

exports.postCreateProduct = async (req, res) => {
  const { category_id, product_name, description, cost_price, selling_price, reorder_level, unit } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO products (category_id, product_name, description, cost_price, selling_price, reorder_level, unit, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [category_id, product_name, description, cost_price, selling_price, reorder_level || 10, unit || 'piece', req.session.user.id]
    );
    await auditLog(req.session.user.id, 'PRODUCT_CREATED', 'Products', result.rows[0].id, { product_name }, req.ip);
    req.flash('success', `Product "${product_name}" created successfully.`);
    res.redirect('/products');
  } catch (err) {
    req.flash('error', err.message || 'Failed to create product.');
    res.redirect('/products/create');
  }
};

exports.getEditProduct = async (req, res) => {
  const { id } = req.params;
  try {
    const [product, categories] = await Promise.all([
      pool.query(`SELECT * FROM products WHERE id=$1`, [id]),
      pool.query(`SELECT id, category_name FROM categories WHERE status='active' ORDER BY category_name`),
    ]);
    if (!product.rows.length) { req.flash('error', 'Product not found.'); return res.redirect('/products'); }
    res.render('products/edit', { title: 'Edit Product', user: req.session.user, product: product.rows[0], categories: categories.rows });
  } catch (err) {
    req.flash('error', 'Failed to load product.');
    res.redirect('/products');
  }
};

exports.postEditProduct = async (req, res) => {
  const { id } = req.params;
  const { category_id, product_name, description, cost_price, selling_price, reorder_level, unit, status } = req.body;
  try {
    await pool.query(
      `UPDATE products SET category_id=$1, product_name=$2, description=$3, cost_price=$4,
       selling_price=$5, reorder_level=$6, unit=$7, status=$8, updated_at=NOW() WHERE id=$9`,
      [category_id, product_name, description, cost_price, selling_price, reorder_level, unit, status, id]
    );
    await auditLog(req.session.user.id, 'PRODUCT_UPDATED', 'Products', id, { product_name }, req.ip);
    req.flash('success', 'Product updated successfully.');
    res.redirect('/products');
  } catch (err) {
    req.flash('error', err.message || 'Failed to update product.');
    res.redirect(`/products/edit/${id}`);
  }
};

// Barcodes
exports.getBarcodes = async (req, res) => {
  const { product_id } = req.params;
  const product = await pool.query(`SELECT * FROM products WHERE id=$1`, [product_id]);
  const barcodes = await pool.query(`SELECT * FROM barcodes WHERE product_id=$1 ORDER BY created_at`, [product_id]);
  res.render('barcodes/index', { title: 'Barcodes', user: req.session.user, product: product.rows[0], barcodes: barcodes.rows });
};

exports.postAddBarcode = async (req, res) => {
  const { product_id } = req.params;
  const { barcode_value } = req.body;
  try {
    await pool.query(`INSERT INTO barcodes (product_id, barcode_value) VALUES ($1,$2)`, [product_id, barcode_value.trim()]);
    req.flash('success', 'Barcode added successfully.');
  } catch (err) {
    req.flash('error', 'Barcode value must be unique.');
  }
  res.redirect(`/products/${product_id}/barcodes`);
};

exports.deleteBarcode = async (req, res) => {
  const { id } = req.params;
  const barcode = await pool.query(`DELETE FROM barcodes WHERE id=$1 RETURNING product_id`, [id]);
  req.flash('success', 'Barcode removed.');
  res.redirect(`/products/${barcode.rows[0]?.product_id}/barcodes`);
};
