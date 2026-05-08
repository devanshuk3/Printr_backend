const { Pool } = require('pg');

const normalizePgConnectionString = (value) => {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;
  if (v.startsWith('postgres://') || v.startsWith('postgresql://')) return v;
  return null;
};

const getSafeConnectionString = () => {
  // Prioritize Internal URL if on Render
  let url = normalizePgConnectionString(process.env.INTERNAL_DATABASE_URL) ||
            normalizePgConnectionString(process.env.DATABASE_URL) ||
            normalizePgConnectionString(process.env.SUPABASE_DB_URL) ||
            normalizePgConnectionString(process.env.SUPABASE_URL) ||
            `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
  
  if (url && url.includes('?')) {
    const [base, query] = url.split('?');
    const params = new URLSearchParams(query);
    params.delete('ssl');
    params.delete('sslmode');
    // For Render/Supabase, adding these can sometimes help with poolers
    // but we'll stick to a clean URL and rely on the config object
    const newQuery = params.toString();
    url = newQuery ? `${base}?${newQuery}` : base;
  }
  return url;
};

const poolConfig = {
  connectionString: getSafeConnectionString(),
  ssl: { 
    rejectUnauthorized: false
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000, // Increased timeout
  statement_timeout: 60000, // 60s statement timeout
};

// If the URL looks internal (no -a. and no singapore-... suffix), we might not need SSL
// but Render Internal DBs usually handle SSL fine too.

if (process.env.NODE_ENV === 'production') {
    const connStr = getSafeConnectionString();
    const masked = connStr.replace(/:([^@]+)@/, ':****@');
    console.log('[DB] Final Connection String:', masked);
    if (connStr.includes('-a.')) {
        console.log('[DB] Warning: Using External Database URL from within Render. Internal URL is recommended.');
    }
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[DB] Pool Error:', err.message);
  if (err.message.includes('terminated unexpectedly')) {
    console.error('[DB] Connection dropped. This may be due to Render DB sleeping or connection limits.');
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};