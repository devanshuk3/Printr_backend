const db = require('./db');

const migrate = async () => {
    try {
        console.log('--- STARTING DATABASE MIGRATION ---');
        
        // Add missing columns to vendors table
        const migrationQueries = [
            'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS auto_accept_jobs BOOLEAN DEFAULT TRUE',
            'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS enable_upi BOOLEAN DEFAULT TRUE',
            'ALTER TABLE vendors ADD COLUMN IF NOT EXISTS min_amount DECIMAL(10, 2) DEFAULT 1.00'
        ];

        for (const query of migrationQueries) {
            console.log(`[Migration] Running: ${query}`);
            await db.supabaseQuery(query);
            if (db.query !== db.supabaseQuery) {
                await db.query(query);
            }
        }

        console.log('--- DATABASE MIGRATION COMPLETE ---');
        process.exit(0);
    } catch (err) {
        console.error('--- FATAL ERROR DURING MIGRATION ---');
        console.error(err.message);
        process.exit(1);
    }
};

migrate();
