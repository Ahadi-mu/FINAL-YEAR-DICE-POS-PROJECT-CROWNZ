const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject,
      html,
      text,
    });
    console.log('📧 Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email error:', error.message);
    return { success: false, error: error.message };
  }
};

const sendLowStockAlert = async (managerEmail, products) => {
  const rows = products.map(p =>
    `<tr><td>${p.product_name}</td><td>${p.quantity_available}</td><td>${p.reorder_level}</td></tr>`
  ).join('');

  return sendEmail({
    to: managerEmail,
    subject: '⚠️ Low Stock Alert - Crown Stores',
    html: `
      <h2>Low Stock Alert</h2>
      <p>The following products are running low on stock:</p>
      <table border="1" cellpadding="8" style="border-collapse:collapse;width:100%">
        <thead><tr><th>Product</th><th>Current Stock</th><th>Reorder Level</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p>Please arrange for procurement immediately.</p>
      <p>— Crown Stores Retail Management System</p>
    `,
  });
};

const sendBugReport = async ({ reportedBy, userEmail, description, module: mod, severity }) => {
  return sendEmail({
    to: process.env.ADMIN_EMAIL,
    subject: `🐛 Bug Report [${severity}] - ${mod}`,
    html: `
      <h2>Bug Report Submitted</h2>
      <table border="1" cellpadding="8" style="border-collapse:collapse">
        <tr><td><strong>Reported By</strong></td><td>${reportedBy}</td></tr>
        <tr><td><strong>Email</strong></td><td>${userEmail}</td></tr>
        <tr><td><strong>Module</strong></td><td>${mod}</td></tr>
        <tr><td><strong>Severity</strong></td><td>${severity}</td></tr>
        <tr><td><strong>Description</strong></td><td>${description}</td></tr>
        <tr><td><strong>Timestamp</strong></td><td>${new Date().toLocaleString()}</td></tr>
      </table>
    `,
  });
};

const sendPasswordReset = async (email, resetLink) => {
  return sendEmail({
    to: email,
    subject: 'Password Reset - Crown Stores CSRMS',
    html: `
      <h2>Password Reset Request</h2>
      <p>You requested a password reset. Click the link below to reset your password:</p>
      <a href="${resetLink}" style="background:#1a56db;color:white;padding:10px 20px;text-decoration:none;border-radius:4px">Reset Password</a>
      <p>This link expires in 1 hour.</p>
      <p>If you did not request this, please ignore this email.</p>
    `,
  });
};

module.exports = { sendEmail, sendLowStockAlert, sendBugReport, sendPasswordReset };
