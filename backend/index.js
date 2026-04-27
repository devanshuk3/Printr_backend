// ========== ENVIRONMENT SETUP (must be first!) ==========
// In production (Render), system env vars are already set.
// In development, load from .env file before any module reads process.env.
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
  console.log('[Init] Development mode: Loaded local .env file.');
} else {
  console.log('[Init] Production mode: Using system environment variables.');
}

// Environment Validation — fail fast if critical vars are missing
const requiredEnv = [
  'SUPABASE_URL',
  'JWT_SECRET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_ENDPOINT',
  'R2_BUCKET_NAME'
];

const missing = requiredEnv.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error('[Fatal] Missing required environment variables:', missing.join(', '));
  console.error('Please ensure these are set in your Render dashboard or .env file.');
  if (process.env.NODE_ENV === 'production') process.exit(1);
}

// ========== MODULE IMPORTS (safe to use process.env now) ==========
const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const path = require('path');
const db = require('./db');
const { startCleanupTask, cleanupOldFiles, cleanupDatabaseHistory, cleanupCompletedJobs } = require('./utils/cleanup');
const auth = require('./middleware/auth');
const roleAuth = require('./middleware/roleAuth');
const helmet = require('helmet');

const app = express();

// ========== DATABASE & STARTUP ==========



// ========== CORS POLICY ==========
// Allowed origins:
// - React Native mobile app: does NOT send an Origin header (native HTTP, not a browser) → origin is undefined
// - Electron production build: loads from file:// with webSecurity:false → origin is "null" or undefined
// - Electron dev server: Vite on localhost:3000 → origin is "http://localhost:3000"
// - Backend dev testing: localhost:5000
const allowedOrigins = [
  'https://printr-backend.onrender.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'null'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no Origin header (Electron production, mobile apps, etc.)
    if (!origin || origin === 'null') {
      return callback(null, true);
    }
    
    // In development, allow any localhost/127.0.0.1 origin
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
    if (isLocalhost || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

// Middlewares
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/vendors', require('./routes/vendors'));
app.use('/api/payment', require('./routes/payment'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// SYSTEM MAINTENANCE: Endpoint to manually trigger cleanup (PROTECTED - Admin only)
app.get('/api/system/cleanup', auth, roleAuth(['admin']), async (req, res) => {
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
        res.on('data', () => { });
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
