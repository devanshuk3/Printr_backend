const db = require('./db');

async function migrate() {
  console.log('Starting migration: Adding role column to users...');
  
  try {
    // 1. Add role column to users
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';
    `);
    console.log('Role column added to users table.');

    // 2. Set an initial admin (optional - based on email)
    // You can update this email to your own
    const adminEmail = 'admin@printr.com'; 
    await db.query(`
      UPDATE users SET role = 'admin' WHERE email = $1;
    `, [adminEmail]);
    console.log(`Setting ${adminEmail} as admin if they exist.`);

    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    process.exit();
  }
}

migrate();
