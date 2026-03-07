const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: './.env' });

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function seed() {
  try {
    const email = 'admin';
    const password = 'password123';
    const fullName = 'Administrator';

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await pool.query(
      'INSERT INTO users (full_name, email, password) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING',
      [fullName, email, hashedPassword]
    );

    console.log('User created:');
    console.log('Email:', email);
    console.log('Password:', password);
  } catch (err) {
    console.error('Error seeding:', err.message);
  } finally {
    await pool.end();
  }
}

seed();
