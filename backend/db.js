const { Pool } = require('pg');
require('dotenv').config();

// Primary DB (Render Postgres) - for Users, Auth, account management
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    });

// Supabase DB - EXCLUSIVELY for Vendor information
// Ensure SUPABASE_URL is set in Render/Local environment
const supabasePool = process.env.SUPABASE_URL
  ? new Pool({
      connectionString: process.env.SUPABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : pool; // Fallback to main pool if not set

module.exports = {
  query: (text, params) => pool.query(text, params),
  supabaseQuery: (text, params) => supabasePool.query(text, params),
};
