const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
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
        shop_name VARCHAR(255) NOT NULL,
        bw_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
        color_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
        phone VARCHAR(20),
        upi_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Vendors table ready.');

    // Insert dummy vendors if none exist
    const vendorCheck = await pool.query('SELECT COUNT(*) FROM vendors');
    if (parseInt(vendorCheck.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO vendors (vendor_id, shop_name, bw_price, color_price, phone, upi_id) VALUES 
        ('V001', 'Metro Print Station', 5.00, 10.00, '9876543210', 'upi1@okaxis'),
        ('V002', 'Campus Copy Center', 3.00, 8.00, '9876543211', 'upi2@okaxis'),
        ('V003', 'Quick Print Hub', 5.00, 12.00, '9876543212', 'upi3@okaxis'),
        ('V004', 'The Digital Press', 2.00, 5.00, '9876543213', 'upi4@okaxis'),
        ('V005', 'Modern Xerographics', 4.00, 15.00, '9876543214', 'upi5@okaxis')
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
