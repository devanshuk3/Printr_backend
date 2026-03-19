const db = require('./db');
require('dotenv').config();
async function fixAdmin() {
  try {
    await db.query(`UPDATE users SET role = 'admin' WHERE username = 'admin'`);
    console.log('Fixed admin user role.');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
fixAdmin();
