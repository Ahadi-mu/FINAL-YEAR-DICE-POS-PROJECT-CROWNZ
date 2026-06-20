// controllers/authController.js
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../config/database');
const { auditLog } = require('../middleware/audit');
const { sendPasswordReset } = require('../config/mailer');

exports.getLogin = (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('auth/login', { title: 'Login - CSRMS' });
};

exports.postLogin = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    req.flash('error', 'Username and password are required.');
    return res.redirect('/auth/login');
  }
  try {
    const result = await pool.query(
      `SELECT u.*, b.branch_name FROM users u
       LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.username = $1 AND u.status = 'active'`,
      [username.trim().toLowerCase()]
    );
    const user = result.rows[0];
    if (!user) {
      req.flash('error', 'Invalid username or password.');
      return res.redirect('/auth/login');
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      req.flash('error', 'Invalid username or password.');
      await auditLog(user.id, 'FAILED_LOGIN', 'Auth', null, { username }, req.ip);
      return res.redirect('/auth/login');
    }
    // Set session
    req.session.user = {
      id: user.id,
      full_name: user.full_name,
      username: user.username,
      email: user.email,
      role: user.role,
      branch_id: user.branch_id,
      branch_name: user.branch_name,
    };
    // Update last login
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    await auditLog(user.id, 'LOGIN', 'Auth', null, null, req.ip);
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Login error:', err);
    req.flash('error', 'Server error. Please try again.');
    res.redirect('/auth/login');
  }
};

exports.getLogout = async (req, res) => {
  if (req.session.user) {
    await auditLog(req.session.user.id, 'LOGOUT', 'Auth', null, null, req.ip);
  }
  req.session.destroy(() => res.redirect('/auth/login'));
};

exports.getForgotPassword = (req, res) => {
  res.render('auth/forgot-password', { title: 'Forgot Password - CSRMS' });
};

exports.postForgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 3600000); // 1 hour
      await pool.query(
        'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [user.id, token, expires]
      );
      const resetLink = `${req.protocol}://${req.get('host')}/auth/reset-password/${token}`;
      await sendPasswordReset(email, resetLink);
    }
    req.flash('success', 'If that email exists, a reset link has been sent.');
    res.redirect('/auth/forgot-password');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Server error.');
    res.redirect('/auth/forgot-password');
  }
};

exports.getResetPassword = async (req, res) => {
  const { token } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM password_resets WHERE token = $1 AND expires_at > NOW() AND used = FALSE`,
      [token]
    );
    if (!result.rows.length) {
      req.flash('error', 'Reset link is invalid or expired.');
      return res.redirect('/auth/forgot-password');
    }
    res.render('auth/reset-password', { title: 'Reset Password', token });
  } catch (err) {
    req.flash('error', 'Server error.');
    res.redirect('/auth/login');
  }
};

exports.postResetPassword = async (req, res) => {
  const { token } = req.params;
  const { password, confirm_password } = req.body;
  if (password !== confirm_password) {
    req.flash('error', 'Passwords do not match.');
    return res.redirect(`/auth/reset-password/${token}`);
  }
  try {
    const result = await pool.query(
      `SELECT * FROM password_resets WHERE token = $1 AND expires_at > NOW() AND used = FALSE`,
      [token]
    );
    if (!result.rows.length) {
      req.flash('error', 'Reset link is invalid or expired.');
      return res.redirect('/auth/forgot-password');
    }
    const reset = result.rows[0];
    const hash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, reset.user_id]);
    await pool.query('UPDATE password_resets SET used = TRUE WHERE id = $1', [reset.id]);
    await auditLog(reset.user_id, 'PASSWORD_RESET', 'Auth', null, null, req.ip);
    req.flash('success', 'Password reset successful. Please log in.');
    res.redirect('/auth/login');
  } catch (err) {
    req.flash('error', 'Server error.');
    res.redirect('/auth/login');
  }
};
