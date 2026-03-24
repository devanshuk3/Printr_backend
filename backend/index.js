const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const path = require('path');
const db = require('./db');
const { startCleanupTask, cleanupOldFiles } = require('./utils/cleanup');
const auth = require('./middleware/auth');
const roleAuth = require('./middleware/roleAuth');
require('dotenv').config();

const app = express();

// ========== DATABASE & STARTUP ==========

// Initialize DB and Cleanups
const ensureTables = async () => {
  console.log('[Boot] Checking database tables...');
  const tableCheck = [
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(255) UNIQUE,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      role VARCHAR(50) DEFAULT 'user'
    )`,
    `CREATE TABLE IF NOT EXISTS vendors (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      upi_id VARCHAR(255),
      contact_number VARCHAR(20),
      shop_name VARCHAR(255),
      bw_price DECIMAL(10,2) DEFAULT 0,
      color_price DECIMAL(10,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'active',
      is_online BOOLEAN DEFAULT true,
      last_stat_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS uploaded_files (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      vendor_id INTEGER REFERENCES vendors(id),
      file_name VARCHAR(255) NOT NULL,
      object_key TEXT NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      delete_after TIMESTAMP,
      deleted_at TIMESTAMP,
      pages_count INTEGER DEFAULT 1,
      total_amount DECIMAL(10,2) DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      vendor_id INTEGER REFERENCES vendors(id),
      total_amount DECIMAL(10,2) NOT NULL,
      status VARCHAR(50) DEFAULT 'completed',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const query of tableCheck) {
    try {
      await db.query(query);
    } catch (err) {
      console.error('[Boot] Error ensuring table:', err.message);
    }
  }

  console.log('[Boot] All tables verified.');
};

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/vendors', require('./routes/vendors'));
app.use('/api/users', require('./routes/users'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// SYSTEM MAINTENANCE: Endpoint to manually trigger cleanup (vulnerability fix for Render spin-down)
app.get('/api/system/cleanup', async (req, res) => {
  console.log('[Manual Maintenance] Cleanup triggered via system endpoint.');
  try {
    // 1. Run storage cleanup
    await cleanupOldFiles();
    
    // 2. Also run the deeper DB history purge logic (imported from cleanup.js)
    // For simplicity, we just trigger the main automated task's logic
    const { cleanupDatabaseHistory, cleanupCompletedJobs } = require('./utils/cleanup');
    if (cleanupDatabaseHistory) await cleanupDatabaseHistory();
    if (cleanupCompletedJobs) await cleanupCompletedJobs();

    res.status(200).json({ success: true, message: 'Maintenance cleanup completed' });
  } catch (err) {
    console.error('[Maintenance] Error during manual cleanup:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[Error Stack]', err.stack);
  res.status(err.status || 500).json({
    message: process.env.NODE_ENV === 'production' 
      ? "An unexpected error occurred"
      : err.message
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`Server started on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  
  // 1. Ensure DB integrity
  await ensureTables();

  // 2. Start scheduled tasks
  startCleanupTask();

  // 3. Keep-alive mechanism to prevent Render from spinning down
  const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL;
  const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;

  if (KEEP_ALIVE_URL && isProduction) {
    console.log(`[Keep-Alive] Initializing health pinger to ${KEEP_ALIVE_URL}...`);
    
    const ping = () => {
      const protocol = KEEP_ALIVE_URL.startsWith('https') ? https : http;
      
      protocol.get(KEEP_ALIVE_URL, (res) => {
        res.on('data', () => {});
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log(`[Keep-Alive] Heartbeat success at ${new Date().toLocaleTimeString()}`);
          } else {
            console.warn(`[Keep-Alive] Heartbeat status: ${res.statusCode}`);
          }
        });
      }).on('error', (err) => {
        console.error('[Keep-Alive] Heartbeat failed:', err.message);
      });
    };

    // Initial and periodic pings
    ping();
    setInterval(ping, 5 * 60 * 1000); 
  } else {
    console.log('[Keep-Alive] Self-pinging disabled (Local dev or missing URL).');
  }
});
