const { Pool } = require('pg');

const normalizePgConnectionString = (value) => {
  if (!value) return null;

  const v = String(value).trim();

  if (
    v.startsWith('postgres://') ||
    v.startsWith('postgresql://')
  ) {
    return v;
  }

  return null;
};

const connectionString =
  normalizePgConnectionString(process.env.DATABASE_URL) ||
  normalizePgConnectionString(process.env.SUPABASE_URL);

if (!connectionString) {
  throw new Error('No PostgreSQL connection string found');
}

const masked = connectionString.replace(/:([^@]+)@/, ':****@');

console.log('[DB] Using Connection:', masked);

const pool = new Pool({
  connectionString,

  ssl: {
    rejectUnauthorized: false,
  },

  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  statement_timeout: 60000,
});

pool.on('error', (err) => {
  console.error('[DB] Pool Error:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Re-export with withTransaction added
module.exports.withTransaction = withTransaction;