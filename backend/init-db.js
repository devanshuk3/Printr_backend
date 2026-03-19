const db = require('./db');

const initDb = async () => {
  const createUserTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createVendorTableQuery = `
    CREATE TABLE IF NOT EXISTS vendors (
      id SERIAL PRIMARY KEY,
      vendor_id VARCHAR(50) UNIQUE NOT NULL,
      shop_name VARCHAR(255) NOT NULL,
      bw_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
      color_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
      phone VARCHAR(20),
      upi_id VARCHAR(255),
      pages_printed INTEGER DEFAULT 0,
      platform_fee DECIMAL(10, 2) DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createUploadsTableQuery = `
    CREATE TABLE IF NOT EXISTS uploaded_files (
      id SERIAL PRIMARY KEY,
      object_key VARCHAR(512) UNIQUE NOT NULL,
      vendor_id VARCHAR(50) NOT NULL,
      file_name VARCHAR(255),
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      delete_after TIMESTAMP NOT NULL,
      deleted_at TIMESTAMP
    );
  `;

  try {
    console.log('--- Initializing Primary DB (Render Auth/Users) ---');
    await db.query(createUserTableQuery);
    await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(255) UNIQUE');
    await db.query(createUploadsTableQuery);
    console.log('Primary DB ready.');

    console.log('--- Initializing Supabase DB (Vendors) ---');
    try {
      await db.supabaseQuery(createVendorTableQuery);
      await db.supabaseQuery(createUploadsTableQuery);
      
      // Ensure vendors table has all required columns
      await db.supabaseQuery('ALTER TABLE vendors ADD COLUMN IF NOT EXISTS bw_price DECIMAL(10, 2) NOT NULL DEFAULT 0');
      await db.supabaseQuery('ALTER TABLE vendors ADD COLUMN IF NOT EXISTS color_price DECIMAL(10, 2) NOT NULL DEFAULT 0');
      await db.supabaseQuery('ALTER TABLE vendors ADD COLUMN IF NOT EXISTS shop_name VARCHAR(255)');
      await db.supabaseQuery('ALTER TABLE vendors ADD COLUMN IF NOT EXISTS phone VARCHAR(20)');
      await db.supabaseQuery('ALTER TABLE vendors ADD COLUMN IF NOT EXISTS upi_id VARCHAR(255)');
      await db.supabaseQuery('ALTER TABLE vendors ADD COLUMN IF NOT EXISTS pages_printed INTEGER DEFAULT 0');
      await db.supabaseQuery('ALTER TABLE vendors ADD COLUMN IF NOT EXISTS platform_fee DECIMAL(10, 2) DEFAULT 0.00');
      
      // Migration: Copy from 'name' to 'shop_name' if necessary
      try {
        await db.supabaseQuery("UPDATE vendors SET shop_name = name WHERE shop_name IS NULL");
      } catch (e) { /* ignore if name doesn't exist */ }
      
      console.log('Supabase DB ready.');
    } catch (supaErr) {
      console.error('Note: Supabase init had issues (might be permission related or table structure), skipping:', supaErr.message);
    }

    console.log('Database initialization complete.');
    process.exit(0);
  } catch (err) {
    console.error('Fatal Error during initialization:');
    console.error(err.message);
    process.exit(1);
  }
};

initDb();
