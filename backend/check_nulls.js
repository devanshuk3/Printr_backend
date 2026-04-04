const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres.jduoonbxrlmifpctncnl:Yadav%405467890@aws-1-ap-south-1.pooler.supabase.com:5432/postgres' });
async function run() {
    await client.connect();
    const res = await client.query("SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'vendors'");
    console.log(res.rows);
    await client.end();
}
run();
