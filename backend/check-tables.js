const db = require('./db');

async function check() {
  try {
    const res = await db.supabaseQuery(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('orders', 'print_queue')
    `);
    console.log('Tables found:', res.rows.map(r => r.table_name));
    process.exit(0);
  } catch (err) {
    console.error('Error checking tables:', err.message);
    process.exit(1);
  }
}

check();
