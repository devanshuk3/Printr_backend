require('dotenv').config();
const { Pool } = require('pg');

const run = async () => {
    let url = process.env.DATABASE_URL;
    // Strip query params
    if (url.includes('?')) url = url.split('?')[0];
    
    console.log("URL:", url.replace(/:([^@]+)@/, ':****@'));
    
    const pool = new Pool({
        connectionString: url,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log("Connecting...");
        const client = await pool.connect();
        console.log("Connected!");
        const res = await client.query('SELECT NOW()');
        console.log("Query success:", res.rows[0]);
        client.release();
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await pool.end();
    }
};

run();
