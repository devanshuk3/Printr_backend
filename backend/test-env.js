require('dotenv').config();
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'PRESENT' : 'MISSING');
console.log('DB_USER:', process.env.DB_USER);
