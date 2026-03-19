require('dotenv').config({ path: './backend/.env' });
const db = require('./backend/db');
async function test() {
  try {
    const res = await db.query('SELECT NOW()');
    console.log('Success:', res.rows[0]);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}
test();
