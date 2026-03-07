const db = require('./db');

const initDb = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    // Try to create the table
    await db.query(createTableQuery);
    
    // Also try to add the username column if it doesn't exist (in case table was created previously without it)
    try {
      await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(255) UNIQUE');
    } catch (alterErr) {
      // Ignore errors if column already exists (though IF NOT EXISTS should handle it)
      // or if there are other issues with the alter command.
    }

    console.log('Successfully initialized database: "users" table is ready.');
    process.exit(0);
  } catch (err) {
    console.error('Error initializing database:');
    if (err.message) {
      console.error('Message:', err.message);
    }
    if (err.code) {
      console.error('Code:', err.code);
    }
    if (err.detail) {
      console.error('Detail:', err.detail);
    }
    if (!err.message && !err.code) {
      console.error(err);
    }
    process.exit(1);
  }
};

initDb();
