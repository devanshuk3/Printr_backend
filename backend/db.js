const { Pool } = require('pg');
require('dotenv').config();

// Primary DB - NOW SUPABASE - for Users, Auth, account management AND Vendor information
const pool = process.env.SUPABASE_URL
  ? new Pool({
      connectionString: process.env.SUPABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : new Pool({
      // fallback just in case they revert to setting DB_USER etc
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    });

module.exports = {
  query: (text, params) => pool.query(text, params),
  supabaseQuery: (text, params) => pool.query(text, params),
};
