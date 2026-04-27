const { Pool } = require('pg');
// No longer calling dotenv.config() here; it is handled globally in index.js

const poolConfig = {
  connectionString: process.env.SUPABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }, // Default to SSL for Supabase, only disable if strictly 'false'
  max: 30, // Maximum pool size optimized to 30
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
};