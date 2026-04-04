const { Client } = require('pg');

const client = new Client({ 
    connectionString: 'postgresql://postgres.jduoonbxrlmifpctncnl:Yadav%405467890@aws-1-ap-south-1.pooler.supabase.com:5432/postgres' 
});

async function run() {
    try {
        await client.connect();
        const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'vendors'");
        console.log('Columns in vendors table:', res.rows.map(r => r.column_name).join(', '));
    } catch (err) {
        console.log('Error checking columns:', err.message);
    } finally {
        await client.end();
    }
}

run();
