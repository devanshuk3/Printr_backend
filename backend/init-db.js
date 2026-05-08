require('dotenv').config();
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
      bw_price_single DECIMAL(10, 2) NOT NULL DEFAULT 0,
      bw_price_2_to_5 DECIMAL(10, 2) NOT NULL DEFAULT 0,
      bw_price_6_to_9 DECIMAL(10, 2) NOT NULL DEFAULT 0,
      bw_price_10_plus DECIMAL(10, 2) NOT NULL DEFAULT 0,
      color_price_single DECIMAL(10, 2) NOT NULL DEFAULT 0,
      color_price_2_to_5 DECIMAL(10, 2) NOT NULL DEFAULT 0,
      color_price_6_to_9 DECIMAL(10, 2) NOT NULL DEFAULT 0,
      color_price_10_plus DECIMAL(10, 2) NOT NULL DEFAULT 0,
      hard_binding_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
      spiral_binding_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
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

  let client;
  try {
    console.log('--- STARTING CONSOLIDATED DATABASE INITIALIZATION ---');
    
    // Attempt to get a dedicated client for initialization with retries
    let connectionRetries = 5;
    while (connectionRetries > 0) {
      try {
        client = await db.pool.connect();
        console.log('[Init] Database connection established successfully.');
        break;
      } catch (connErr) {
        connectionRetries--;
        console.warn(`[Init] Failed to connect to database (${connectionRetries} retries left):`, connErr.message);
        if (connectionRetries === 0) {
          console.error('[Init] Fatal: Could not establish initial database connection.');
          process.exit(1);
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // Ensure search path is consistent
    try { await client.query('SET search_path TO public, auth, "$user";'); } catch (e) {}

    // 1. Define all creation queries
    const tables = [
      { name: 'users', query: createUserTableQuery },
      { name: 'vendors', query: createVendorTableQuery },
      { name: 'uploaded_files', query: createUploadsTableQuery },
      { name: 'orders', query: createOrdersTableQuery },
      { name: 'email_otps', query: createEmailOtpsTableQuery }
    ];

    for (const table of tables) {
      let retries = 3;
      while (retries > 0) {
        try {
          console.log(`[Init] Ensuring table exists: ${table.name}`);
          // Set a short timeout for initialization checks
          await client.query('SET statement_timeout = 5000');
          await client.query(table.query);
          break; // success
        } catch (err) {
          retries--;
          if (err.message.includes('terminated unexpectedly') || err.message.includes('timeout')) {
            console.warn(`[Init] Connection issue for ${table.name}: ${err.message}. Reconnecting... (${retries} left)`);
            try { client.release(true); } catch (e) {} // Destroy the broken client
            await new Promise(resolve => setTimeout(resolve, 2000));
            try {
                client = await db.pool.connect();
            } catch (connErr) {
                console.error('[Init] Failed to reconnect:', connErr.message);
                break;
            }
          } else {
            console.warn(`[Init] Warning/Check failed for ${table.name}:`, err.message);
            break;
          }
        }
      }
    }

    // 2. Perform ALTER TABLE migrations
    const migrations = [
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(255) UNIQUE',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT \'user\'',
      'ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT \'uploaded\'',
      'ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS user_id INTEGER',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS bw_price DECIMAL(10, 2) NOT NULL DEFAULT 0',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS color_price DECIMAL(10, 2) NOT NULL DEFAULT 0',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS bw_price_single DECIMAL(10, 2) NOT NULL DEFAULT 0',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS bw_price_2_to_5 DECIMAL(10, 2) NOT NULL DEFAULT 0',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS bw_price_6_to_9 DECIMAL(10, 2) NOT NULL DEFAULT 0',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS bw_price_10_plus DECIMAL(10, 2) NOT NULL DEFAULT 0',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS color_price_single DECIMAL(10, 2) NOT NULL DEFAULT 0',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS color_price_2_to_5 DECIMAL(10, 2) NOT NULL DEFAULT 0',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS color_price_6_to_9 DECIMAL(10, 2) NOT NULL DEFAULT 0',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS color_price_10_plus DECIMAL(10, 2) NOT NULL DEFAULT 0',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS hard_binding_price DECIMAL(10, 2) NOT NULL DEFAULT 0',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS spiral_binding_price DECIMAL(10, 2) NOT NULL DEFAULT 0',
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
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT \'Online\'',
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT \'pending\'',
      'ALTER TABLE archived_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)',
      'ALTER TABLE archived_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50)',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false',
      'ALTER TABLE email_otps ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0',
      'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ',
      'DROP TABLE IF EXISTS print_queue CASCADE',
      'CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email))',
      'CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username))',
      'CREATE INDEX IF NOT EXISTS idx_email_otps_user_id ON email_otps(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_email_otps_created_at ON email_otps(created_at)',
      'UPDATE users SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL AND email <> LOWER(TRIM(email))',
      'UPDATE users SET username = LOWER(TRIM(username)) WHERE username IS NOT NULL AND username <> LOWER(TRIM(username))',
      'UPDATE vendors SET vendor_id = LOWER(TRIM(vendor_id)) WHERE vendor_id IS NOT NULL AND vendor_id <> LOWER(TRIM(vendor_id))',
      'UPDATE orders SET vendor_id = LOWER(TRIM(vendor_id)) WHERE vendor_id IS NOT NULL AND vendor_id <> LOWER(TRIM(vendor_id))',
      'UPDATE archived_orders SET vendor_id = LOWER(TRIM(vendor_id)) WHERE vendor_id IS NOT NULL AND vendor_id <> LOWER(TRIM(vendor_id))',
      'UPDATE uploaded_files SET vendor_id = LOWER(TRIM(vendor_id)) WHERE vendor_id IS NOT NULL AND vendor_id <> LOWER(TRIM(vendor_id))',
      'CREATE INDEX IF NOT EXISTS idx_orders_vendor_status_created ON orders(vendor_id, status, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_uploaded_files_vendor ON uploaded_files(vendor_id)',
      'CREATE INDEX IF NOT EXISTS idx_uploaded_files_delete_after ON uploaded_files(delete_after)',
      'CREATE INDEX IF NOT EXISTS idx_uploaded_files_file_name ON uploaded_files(file_name)',
      'CREATE INDEX IF NOT EXISTS idx_vendors_vendor_id ON vendors(vendor_id)',
      'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)'
    ];

    console.log('[Init] Running migrations...');
    for (const sql of migrations) {
      try {
        await client.query('SET statement_timeout = 10000');
        await client.query(sql);
      } catch (err) {
        if (err.message.includes('terminated unexpectedly')) {
           console.warn('[Init] Connection lost during migration. Attempting recovery...');
           try { client.release(true); } catch (e) {}
           try {
               client = await db.pool.connect();
               await client.query(sql); 
           } catch(e) {
               console.warn(`[Init] Migration failed after recovery: ${sql.substring(0, 50)}...`);
           }
        } else if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
           // Ignore common "already exists" errors, but log others
        }
      }
    }

    // 3. Special Migrations
    try { 
        await client.query("UPDATE vendors SET shop_name = name WHERE (shop_name IS NULL OR shop_name = '') AND name IS NOT NULL"); 
    } catch(e) {}

    // 4. Grandfather verified users
    try {
        await client.query("UPDATE users SET is_verified = true WHERE is_verified IS NULL OR is_verified = false");
        console.log('[Init] Existing users marked as verified.');
    } catch(e) {
        console.warn('[Init] Could not update existing user verification status:', e.message);
    }

    console.log('--- DATABASE INITIALIZATION COMPLETE ---');
    if (client) {
        try { client.release(); } catch(e) {}
    }
    if (db.pool) {
        console.log('[Init] Closing initialization pool...');
        await db.pool.end();
    }
    process.exit(0);
  } catch (err) {
    console.error('--- FATAL ERROR DURING INITIALIZATION ---');
    console.error(err.message);
    if (client) {
        try { client.release(true); } catch(e) {}
    }
    if (db.pool) {
        try { await db.pool.end(); } catch(e) {}
    }
    process.exit(1);
  }
};

initDb();
