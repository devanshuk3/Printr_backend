const db = require('./db');

const initDb = async () => {
  const createUserTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'user',
      is_verified BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createVendorTableQuery = `
    CREATE TABLE IF NOT EXISTS vendors (
      id SERIAL PRIMARY KEY,
      vendor_id VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255),
      full_name VARCHAR(255),
      shop_name VARCHAR(255) NOT NULL,
      phone VARCHAR(20),
      upi_id VARCHAR(255),
      address TEXT,
      bw_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
      color_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
      has_bw_printer BOOLEAN DEFAULT TRUE,
      has_color_printer BOOLEAN DEFAULT FALSE,
      bw_printer VARCHAR(255),
      color_printer VARCHAR(255),
      paper_sizes VARCHAR(255),
      pages_printed INTEGER DEFAULT 0,
      platform_fee DECIMAL(10, 2) DEFAULT 0.00,
      auto_accept_jobs BOOLEAN DEFAULT TRUE,
      enable_upi BOOLEAN DEFAULT TRUE,
      min_amount DECIMAL(10, 2) DEFAULT 1.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createUploadsTableQuery = `
    CREATE TABLE IF NOT EXISTS uploaded_files (
      id SERIAL PRIMARY KEY,
      object_key VARCHAR(512) UNIQUE NOT NULL,
      vendor_id VARCHAR(50) NOT NULL,
      user_id INTEGER NOT NULL,
      file_name VARCHAR(255),
      status VARCHAR(50) DEFAULT 'uploaded',
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      delete_after TIMESTAMP NOT NULL,
      deleted_at TIMESTAMP
    );
  `;

  const createOrdersTableQuery = `
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      vendor_id VARCHAR(50) NOT NULL,
      file_name VARCHAR(255),
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createEmailOtpsTableQuery = `
    CREATE TABLE IF NOT EXISTS email_otps (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      otp_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT false,
      attempts INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `;

  try {
    console.log('--- STARTING CONSOLIDATED DATABASE INITIALIZATION ---');
    
    // Ensure search path is consistent
    try { await db.query('SET search_path TO public, auth, "$user";'); } catch (e) {}

    // 1. Define all creation queries in an array for sequential execution
    const tables = [
      { name: 'users', query: createUserTableQuery },
      { name: 'vendors', query: createVendorTableQuery },
      { name: 'uploaded_files', query: createUploadsTableQuery },
      { name: 'orders', query: createOrdersTableQuery },
      { name: 'email_otps', query: createEmailOtpsTableQuery }
    ];

    for (const table of tables) {
      try {
        console.log(`[Init] Ensuring table exists: ${table.name}`);
        await db.query(table.query);
      } catch (err) {
        console.warn(`[Init] Warning/Check failed for ${table.name}:`, err.message);
      }
    }

    // 2. Perform ALTER TABLE migrations for existing production databases
    const migrations = [
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(255) UNIQUE',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT \'user\'',
      'ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT \'uploaded\'',
      'ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS user_id INTEGER',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS bw_price DECIMAL(10, 2) NOT NULL DEFAULT 0',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS color_price DECIMAL(10, 2) NOT NULL DEFAULT 0',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS phone VARCHAR(20)',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS upi_id VARCHAR(255)',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS pages_printed INTEGER DEFAULT 0',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS platform_fee DECIMAL(10, 2) DEFAULT 0.00',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS password VARCHAR(255)',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS address TEXT',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS paper_sizes VARCHAR(255)',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS auto_accept_jobs BOOLEAN DEFAULT TRUE',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS enable_upi BOOLEAN DEFAULT TRUE',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS min_amount DECIMAL(10, 2) DEFAULT 1.00',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS has_bw_printer BOOLEAN DEFAULT TRUE',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS has_color_printer BOOLEAN DEFAULT FALSE',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS bw_printer VARCHAR(255)',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS color_printer VARCHAR(255)',
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS page_count INTEGER DEFAULT 1',
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_color BOOLEAN DEFAULT FALSE',
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10, 2) DEFAULT 0.00',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false',
      'ALTER TABLE email_otps ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0',
      'DROP TABLE IF EXISTS print_queue CASCADE'
    ];

    for (const sql of migrations) {
      try {
        await db.query(sql);
      } catch (err) {
        // Silent ignore for IF NOT EXISTS cases
      }
    }

    // 3. Special Migrations (one-off data fixes)
    try { 
        await db.query("UPDATE vendors SET shop_name = name WHERE shop_name IS NULL OR shop_name = ''"); 
    } catch(e) {}

    // 4. Grandfather existing users as verified (prevents lockout after deploying OTP feature)
    try {
        await db.query("UPDATE users SET is_verified = true WHERE is_verified IS NULL OR is_verified = false");
        console.log('[Init] Existing users marked as verified.');
    } catch(e) {
        console.warn('[Init] Could not update existing user verification status:', e.message);
    }

    console.log('--- DATABASE INITIALIZATION COMPLETE ---');
    process.exit(0);
  } catch (err) {
    console.error('--- FATAL ERROR DURING INITIALIZATION ---');
    console.error(err.message);
    process.exit(1);
  }
};

initDb();
