const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function setup() {
  try {
    console.log('Connecting to database...');
    
    // Create users table if not exists (migrating existing schema)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Users table ready.');

    // Create vendors table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vendors (
        id SERIAL PRIMARY KEY,
        vendor_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        price_per_page DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Vendors table ready.');

    // Insert dummy vendors if none exist
    const vendorCheck = await pool.query('SELECT COUNT(*) FROM vendors');
    if (parseInt(vendorCheck.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO vendors (vendor_id, name, price_per_page) VALUES 
        ('V001', 'Metro Print Station', 5.00),
        ('V002', 'Campus Copy Center', 3.00),
        ('V003', 'Quick Print Hub', 5.00),
        ('V004', 'The Digital Press', 2.00),
        ('V005', 'Modern Xerographics', 4.00)
      `);
      console.log('Seed vendors inserted.');
    }

    console.log('Database setup complete.');
    process.exit(0);
  } catch (err) {
    console.error('Error setting up database:', err);
    process.exit(1);
  }
}

setup();
