const { Pool } = require('pg');
require('dotenv').config();

// Primary DB - NOW SUPABASE - for Users, Auth, account management AND Vendor information
const pool = process.env.SUPABASE_URL
  ? new Pool({
      connectionString: process.env.SUPABASE_URL,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : 
           (process.env.DB_SSL === 'false' ? { rejectUnauthorized: false } : false)
    })
  : new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : 
           (process.env.DB_SSL === 'false' ? { rejectUnauthorized: false } : false)
    });

module.exports = {
  query: (text, params) => pool.query(text, params),
  supabaseQuery: (text, params) => pool.query(text, params),
};
