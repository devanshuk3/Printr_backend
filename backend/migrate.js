const db = require('./db');

const migrate = async () => {
  const queries = [
    // 1. Ensure Orders exists
    `CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      vendor_id VARCHAR(50) NOT NULL,
      file_name VARCHAR(255),
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
    
    // 2. Ensure Print Queue exists
    `CREATE TABLE IF NOT EXISTS print_queue (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      vendor_id VARCHAR(50) NOT NULL,
      status VARCHAR(50) DEFAULT 'queued',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP
    );`,
    
    // 3. Apply Column Migrations (in case tables existed previously)
    `ALTER TABLE print_queue ADD COLUMN IF NOT EXISTS object_key VARCHAR(512);`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(255) UNIQUE;`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS vendor_id VARCHAR(50);`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);`
  ];

  console.log('--- STARTING MIGRATIONS ---');
  for (const query of queries) {
    try {
      const label = query.trim().split('\n')[0].substring(0, 50);
      process.stdout.write(`Running: ${label}... `);
      await db.supabaseQuery(query);
      console.log('✅');
    } catch (err) {
      console.log('❌');
      console.error('Error detail:', err.message);
    }
  }
  console.log('--- ALL MIGRATIONS PROCESSED ---');
  process.exit(0);
};

migrate();
