const { Pool } = require('pg');
require('dotenv').config({ path: './.env' });

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function check() {
  try {
    const res = await pool.query('SELECT * FROM users');
    console.log('--- USERS IN DATABASE ---');
    console.table(res.rows.map(r => ({ id: r.id, full_name: r.full_name, email: r.email })));
    console.log('-------------------------');
  } catch (err) {
    console.error('Database Error:', err.message);
  } finally {
    await pool.end();
  }
}

check();
