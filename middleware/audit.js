// middleware/audit.js
const pool = require('../config/database');

const auditLog = async (userId, action, module, recordId = null, details = null, ipAddress = null) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, module, record_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, action, module, recordId, details ? JSON.stringify(details) : null, ipAddress]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
};

// Middleware that auto-logs page visits
const auditMiddleware = (action, module) => async (req, res, next) => {
  if (req.session && req.session.user) {
    await auditLog(
      req.session.user.id,
      action,
      module,
      null,
      null,
      req.ip
    );
  }
  next();
};

module.exports = { auditLog, auditMiddleware };
