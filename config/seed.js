// run: node config/seed.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./database');

async function seed() {
  try {
    const hash = await bcrypt.hash('Admin@1234', 12);
    await pool.query(
      `INSERT INTO users (branch_id, full_name, username, email, password_hash, role)
       VALUES (NULL, 'System Director', 'director', 'director@crownstores.com', $1, 'director')
       ON CONFLICT (username) DO NOTHING`,
      [hash]
    );
    console.log('✅ Director account created: username=director password=Admin@1234');
    console.log('⚠️  Please change this password immediately after first login!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed error:', err.message);
    process.exit(1);
  }
}

seed();
