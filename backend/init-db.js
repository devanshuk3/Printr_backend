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

  try {
    console.log('--- STARTING CONSOLIDATED DATABASE INITIALIZATION ---');
    
    // Ensure search path is consistent
    try { await db.query('SET search_path TO public, auth, "$user";'); } catch (e) {}

    // 1. Define all creation queries in an array for sequential execution
    const tables = [
      { name: 'users', query: createUserTableQuery },
      { name: 'vendors', query: createVendorTableQuery },
      { name: 'uploaded_files', query: createUploadsTableQuery },
      { name: 'orders', query: createOrdersTableQuery }
    ];

    for (const table of tables) {
      try {
        console.log(`[Init] Ensuring table exists: ${table.name}`);
        await db.query(table.query);
        // Also run on Supabase (if primary pool is different)
        if (db.query !== db.supabaseQuery) {
            await db.supabaseQuery(table.query);
        }
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
      'DROP TABLE IF EXISTS print_queue CASCADE'
    ];

    for (const sql of migrations) {
      try {
        await db.query(sql);
        if (db.query !== db.supabaseQuery) {
            await db.supabaseQuery(sql);
        }
      } catch (err) {
        // Silent ignore for IF NOT EXISTS cases
      }
    }

    // 3. Special Migrations (one-off data fixes)
    try { 
        await db.supabaseQuery("UPDATE vendors SET shop_name = name WHERE shop_name IS NULL OR shop_name = ''"); 
        if (db.query !== db.supabaseQuery) {
            await db.query("UPDATE vendors SET shop_name = name WHERE shop_name IS NULL OR shop_name = ''"); 
        }
    } catch(e) {}

    console.log('--- DATABASE INITIALIZATION COMPLETE ---');
    process.exit(0);
  } catch (err) {
    console.error('--- FATAL ERROR DURING INITIALIZATION ---');
    console.error(err.message);
    process.exit(1);
  }
};

initDb();
