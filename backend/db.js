const { Pool } = require('pg');

const normalizePgConnectionString = (value) => {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;
  // Accept common Postgres URL schemes only.
  if (v.startsWith('postgres://') || v.startsWith('postgresql://')) return v;
  return null;
};

const poolConfig = {
  connectionString:
    normalizePgConnectionString(process.env.DATABASE_URL) ||
    normalizePgConnectionString(process.env.SUPABASE_DB_URL) ||
    normalizePgConnectionString(process.env.SUPABASE_URL) ||
    `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }, //default to SSL for Supabase, only disable if strictly 'false'
  max: 40,//max pool size -- current pooled connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
};

const pool = new Pool(poolConfig);

//handle pool errors to prevent server crash and log for stability
pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
});

/**
 * Run a set of queries in a single DB transaction.
 * Usage:
 *   await db.withTransaction(async (client) => { await client.query(...); });
 */
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  query: (text, params) => pool.query(text, params),
  withTransaction,
  pool, // Export the pool to allow closing it in initialization scripts
};