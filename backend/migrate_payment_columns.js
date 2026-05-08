require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const db = require('./db.js');

async function migrate() {
  try {
    console.log("Starting payment columns migration...");

    console.log("Checking orders table...");
    await db.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'Online',
      ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pending';
    `);
    console.log("Added payment_method and payment_status to orders.");

    console.log("Checking archived_orders table...");
    await db.query(`
      ALTER TABLE archived_orders 
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
      ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50);
    `);
    console.log("Added payment_method and payment_status to archived_orders.");

    console.log("Migration completed successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    process.exit(0);
  }
}

migrate();
