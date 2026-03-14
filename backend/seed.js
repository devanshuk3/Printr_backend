const pool = require('./db');

async function seed() {
  try {
    console.log('Seeding process started...');
    
    console.log('Seeding process completed.');
  } catch (err) {
    console.error('Error seeding:', err.message);
  } finally {
    process.exit(0);
  }
}

if (require.main === module) {
  seed();
}

module.exports = seed;
