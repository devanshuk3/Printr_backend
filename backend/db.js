const { Pool } = require('pg');

const normalizePgConnectionString = (value) => {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;
  if (v.startsWith('postgres://') || v.startsWith('postgresql://')) return v;
  return null;
};

const getSafeConnectionString = () => {
  const url = normalizePgConnectionString(process.env.DATABASE_URL) ||
              normalizePgConnectionString(process.env.SUPABASE_DB_URL) ||
              normalizePgConnectionString(process.env.SUPABASE_URL) ||
              `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
  
  // Strip any existing ssl query params to avoid conflicts with our config object
  if (url && url.includes('?')) {
    const [base, query] = url.split('?');
    const params = new URLSearchParams(query);
    params.delete('ssl');
    params.delete('sslmode');
    const newQuery = params.toString();
    return newQuery ? `${base}?${newQuery}` : base;
  }
  return url;
};

const poolConfig = {
  connectionString: getSafeConnectionString(),
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  withTransaction: async (fn) => {
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
  },
  pool,
};