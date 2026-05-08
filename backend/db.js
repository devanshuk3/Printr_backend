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
  
  if (url) {
    // Render specific transformation: Convert external URL to internal if we're on Render
    // External: dpg-xxx-a.singapore-postgres.render.com
    // Internal: dpg-xxx (reachable on port 5432)
    if (process.env.RENDER && url.includes('.render.com') && url.includes('-a.')) {
        console.log('[DB] Render environment detected. Attempting to transform External URL to Internal...');
        url = url.replace('-a.singapore-postgres.render.com', '');
        url = url.replace('-a.oregon-postgres.render.com', '');
        url = url.replace('-a.frankfurt-postgres.render.com', '');
        url = url.replace('-a.ohio-postgres.render.com', '');
        // Strip query params as well for internal
        if (url.includes('?')) url = url.split('?')[0];
    }

    if (url.includes('?')) {
      const [base, query] = url.split('?');
      const params = new URLSearchParams(query);
      params.delete('ssl');
      params.delete('sslmode');
      const newQuery = params.toString();
      url = newQuery ? `${base}?${newQuery}` : base;
    }
  }
  return url;
};

const isInternal = (url) => {
    return url && !url.includes('.render.com') && !url.includes('.supabase.co');
};

const poolConfig = {
  connectionString: getSafeConnectionString(),
  ssl: isInternal(getSafeConnectionString()) ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  statement_timeout: 60000,
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