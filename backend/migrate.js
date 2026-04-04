const { Client } = require('pg');

const client = new Client({ 
    connectionString: 'postgresql://postgres.jduoonbxrlmifpctncnl:Yadav%405467890@aws-1-ap-south-1.pooler.supabase.com:5432/postgres' 
});

async function run() {
    try {
        console.log('Connecting to database...');
        await client.connect();
        
        console.log('Adding columns to vendors table...');
        const query = `
            ALTER TABLE vendors 
            ADD COLUMN IF NOT EXISTS has_bw_printer BOOLEAN DEFAULT TRUE;
            
            ALTER TABLE vendors 
            ADD COLUMN IF NOT EXISTS has_color_printer BOOLEAN DEFAULT FALSE;
        `;
        
        await client.query(query);
        console.log('✅ Remote Database Updated Successfully!');
        
    } catch (err) {
        console.error('❌ Migration Failed:', err.message);
    } finally {
        await client.end();
    }
}

run();
