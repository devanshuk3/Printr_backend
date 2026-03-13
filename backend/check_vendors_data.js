const db = require('./db');

async function test() {
  try {
    const res = await db.query('SELECT * FROM vendors LIMIT 5');
    console.log(JSON.stringify(res.rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

test();
