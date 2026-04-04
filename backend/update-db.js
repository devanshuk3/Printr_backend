const db = require('./db');

async function updateDatabase() {
  try {
    console.log('Updating vendors table to add has_bw_printer and has_color_printer columns...');
    
    // Check if columns exist first or just use ALTER TABLE IF NOT EXISTS
    // Postgres doesn't have IF NOT EXISTS for ADD COLUMN directly but we can join with information_schema
    
    await db.query(`
      ALTER TABLE vendors 
      ADD COLUMN IF NOT EXISTS has_bw_printer BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS has_color_printer BOOLEAN DEFAULT FALSE;
    `);
    
    console.log('Database updated successfully.');
  } catch (err) {
    console.error('Error updating database:', err.message);
  } finally {
    process.exit();
  }
}

updateDatabase();
