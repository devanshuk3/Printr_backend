const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const path = require('path');
const db = require('./db');
const { startCleanupTask, cleanupOldFiles, cleanupDatabaseHistory, cleanupCompletedJobs } = require('./utils/cleanup');
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
      username VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS vendors (
      id SERIAL PRIMARY KEY,
      vendor_id VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255),
      full_name VARCHAR(255),
      shop_name VARCHAR(255) NOT NULL,
      phone VARCHAR(20),
      upi_id VARCHAR(255),
      address TEXT,
      bw_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      color_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      has_bw_printer BOOLEAN DEFAULT TRUE,
      has_color_printer BOOLEAN DEFAULT FALSE,
      paper_sizes VARCHAR(255),
      pages_printed INTEGER DEFAULT 0,
      platform_fee DECIMAL(10, 2) DEFAULT 0.00,
      auto_accept_jobs BOOLEAN DEFAULT TRUE,
      enable_upi BOOLEAN DEFAULT TRUE,
      min_amount DECIMAL(10, 2) DEFAULT 1.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS uploaded_files (
      id SERIAL PRIMARY KEY,
      object_key VARCHAR(512) UNIQUE NOT NULL,
      vendor_id VARCHAR(50) NOT NULL,
      user_id INTEGER NOT NULL,
      file_name VARCHAR(255),
      status VARCHAR(50) DEFAULT 'uploaded',
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      delete_after TIMESTAMP NOT NULL,
      deleted_at TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      vendor_id VARCHAR(50) NOT NULL,
      file_name VARCHAR(255),
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_orders_vendor_id_status ON orders (LOWER(vendor_id), status)`,
    `CREATE INDEX IF NOT EXISTS idx_uploaded_files_file_name ON uploaded_files (file_name)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_file_name ON orders (file_name)`
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

const PORT = process.env.PORT;

if (!PORT) {
  throw new Error("PORT is not defined. This should never happen in production.");
}
console.log("ENV PORT:", process.env.PORT);
// Only start the server if this file is run directly, not when required as a module
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

module.exports = app;
