/**
 * One-time migration: Apply performance indexes to the database.
 * Run with: node migrate_indexes.js
 * Safe to re-run — uses IF NOT EXISTS on all indexes.
 */
require('dotenv').config();
const db = require('./db');

const indexes = [
  `CREATE INDEX IF NOT EXISTS idx_orders_vendor_status_created ON orders(vendor_id, status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_uploaded_files_vendor ON uploaded_files(vendor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_uploaded_files_delete_after ON uploaded_files(delete_after)`,
  `CREATE INDEX IF NOT EXISTS idx_uploaded_files_file_name ON uploaded_files(file_name)`,
  `CREATE INDEX IF NOT EXISTS idx_vendors_vendor_id ON vendors(vendor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`,
  `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
];

(async () => {
  console.log('[Migration] Applying performance indexes...\n');
  let success = 0;
  let skipped = 0;

  for (const sql of indexes) {
    try {
      await db.query(sql);
      const name = sql.match(/idx_\w+/)[0];
      console.log(`  ✓ ${name}`);
      success++;
    } catch (err) {
      const name = sql.match(/idx_\w+/)?.[0] || 'unknown';
      console.error(`  ✗ ${name}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\n[Migration] Done. ${success} created, ${skipped} failed.`);
  process.exit(0);
})();
