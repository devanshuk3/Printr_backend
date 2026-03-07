const db = require('./db');

const initDb = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await db.query(createTableQuery);
    console.log('Successfully initialized database: "users" table is ready.');
    process.exit(0);
  } catch (err) {
    console.error('Error initializing database:', err.message);
    process.exit(1);
  }
};

initDb();
