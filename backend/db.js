const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = {
  connectionString: process.env.SUPABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : 
       (process.env.DB_SSL === 'false' ? { rejectUnauthorized: false } : false),
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
};

const pool = new Pool(poolConfig);

// Handle pool errors to prevent server crash and log for stability
pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  supabaseQuery: (text, params) => pool.query(text, params),
};
