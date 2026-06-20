// controllers/usersController.js
const bcrypt = require('bcrypt');
const pool = require('../config/database');
const { auditLog } = require('../middleware/audit');

exports.getUsers = async (req, res) => {
  const { role, branch_id, status } = req.query;
  let query = `SELECT u.*, b.branch_name FROM users u LEFT JOIN branches b ON u.branch_id=b.id WHERE 1=1`;
  const params = [];
  if (role) { query += ` AND u.role=$${params.length+1}`; params.push(role); }
  if (branch_id) { query += ` AND u.branch_id=$${params.length+1}`; params.push(branch_id); }
  if (status) { query += ` AND u.status=$${params.length+1}`; params.push(status); }
  query += ' ORDER BY u.full_name';
  const [users, branches] = await Promise.all([
    pool.query(query, params),
    pool.query(`SELECT id, branch_name FROM branches WHERE status='active' ORDER BY branch_name`),
  ]);
  res.render('users/index', { title: 'User Management', user: req.session.user, users: users.rows, branches: branches.rows, filters: { role, branch_id, status } });
};

exports.getCreateUser = async (req, res) => {
  const branches = await pool.query(`SELECT id, branch_name FROM branches WHERE status='active' ORDER BY branch_name`);
  res.render('users/create', { title: 'Create User', user: req.session.user, branches: branches.rows });
};

exports.postCreateUser = async (req, res) => {
  const { full_name, username, email, password, role, branch_id } = req.body;
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (branch_id, full_name, username, email, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [branch_id || null, full_name, username.toLowerCase().trim(), email, hash, role]
    );
    await auditLog(req.session.user.id, 'USER_CREATED', 'Users', result.rows[0].id, { username, role }, req.ip);
    req.flash('success', `User "${full_name}" created successfully.`);
    res.redirect('/users');
  } catch (err) {
    req.flash('error', err.message.includes('unique') ? 'Username or email already exists.' : 'Failed to create user.');
    res.redirect('/users/create');
  }
};

exports.getEditUser = async (req, res) => {
  const { id } = req.params;
  const [user, branches] = await Promise.all([
    pool.query(`SELECT * FROM users WHERE id=$1`, [id]),
    pool.query(`SELECT id, branch_name FROM branches WHERE status='active' ORDER BY branch_name`),
  ]);
  if (!user.rows.length) { req.flash('error', 'User not found.'); return res.redirect('/users'); }
  res.render('users/edit', { title: 'Edit User', user: req.session.user, editUser: user.rows[0], branches: branches.rows });
};

exports.postEditUser = async (req, res) => {
  const { id } = req.params;
  const { full_name, email, role, branch_id, status, password } = req.body;
  try {
    if (password && password.length > 0) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query(`UPDATE users SET full_name=$1,email=$2,role=$3,branch_id=$4,status=$5,password_hash=$6,updated_at=NOW() WHERE id=$7`,
        [full_name, email, role, branch_id || null, status, hash, id]);
    } else {
      await pool.query(`UPDATE users SET full_name=$1,email=$2,role=$3,branch_id=$4,status=$5,updated_at=NOW() WHERE id=$6`,
        [full_name, email, role, branch_id || null, status, id]);
    }
    await auditLog(req.session.user.id, 'USER_UPDATED', 'Users', id, { full_name }, req.ip);
    req.flash('success', 'User updated successfully.');
    res.redirect('/users');
  } catch (err) {
    req.flash('error', 'Failed to update user.');
    res.redirect(`/users/edit/${id}`);
  }
};

module.exports.usersController = exports;
