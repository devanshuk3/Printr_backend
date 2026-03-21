const db = require('./db');

const migrate = async () => {
  const queries = [
    `CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      vendor_id VARCHAR(50) NOT NULL,
      file_name VARCHAR(255),
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS print_queue (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      vendor_id VARCHAR(50) NOT NULL,
      object_key VARCHAR(512) NOT NULL,
      status VARCHAR(50) DEFAULT 'queued',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP
    );`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(255) UNIQUE;`
  ];

  for (const query of queries) {
    try {
      console.log('Running:', query.substring(0, 30));
      await db.supabaseQuery(query);
      console.log('Done.');
    } catch (err) {
      console.error('Error:', err.message);
    }
  }
  process.exit(0);
};

migrate();
