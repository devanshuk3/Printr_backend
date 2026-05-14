//environment setup
//in production (Render), system env vars are already set.
//in development, load from .env file before any module reads process.env.
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
  console.log('[Init] Development mode: Loaded local .env file.');
} else {
  console.log('[Init] Production mode: Using system environment variables.');
}
//environment validation — fail fast if critical vars are missing
const requiredEnv = [
  'SUPABASE_URL',
  'JWT_SECRET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_ENDPOINT',
  'R2_BUCKET_NAME'
];

//set of required variables from env

const missing = requiredEnv.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error('[Fatal] Missing required environment variables:', missing.join(', '));
  console.error('Please ensure these are set in your Render dashboard or .env file.');
  if (process.env.NODE_ENV === 'production') process.exit(1);
}
//exit with a warnign if the env varibales are missing




//module imports
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
const { globalLimiter, healthLimiter, destructiveLimiter, apiSpeedLimiter } = require('./middleware/rateLimiter');





const app = express();
app.set('trust proxy', 1);
//cors policy
const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow mobile apps, Postman, server requests, and Electron standalone apps
    if (!origin || origin === 'null' || origin.startsWith('file://')) {
      return callback(null, true);
    }

    // Exact origin match only
    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },

  credentials: true,

  methods: [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
  ],

  allowedHeaders: [
    'Content-Type',
    'Authorization',
  ],

  optionsSuccessStatus: 200,
};
// Middlewares
app.use(helmet());
app.use(cors(corsOptions));

// Log aborted requests to trace network issues or client timeouts
app.use((req, res, next) => {
  req.on('aborted', () => {
    console.warn(`[Aborted] Request to ${req.method} ${req.originalUrl} was aborted by the client.`);
  });
  next();
});
app.use(express.json({ limit: '10mb' }));//rejects json oversized payloads
app.use(express.urlencoded({ limit: '10mb', extended: true })); //limit url-encoded bodies

//Health check endpoint
app.get('/api/health', healthLimiter, (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Global rate limiter
app.set('trust proxy', 1);
app.use(globalLimiter);
app.use(apiSpeedLimiter);

//Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/vendors', require('./routes/vendors'));
app.use('/api/payment', require('./routes/payment'));



//to manually trigger cleanup (protected Admin only)
app.post('/api/system/cleanup', destructiveLimiter, auth, roleAuth(['admin']), async (req, res) => {
  console.log('[Manual Maintenance] Cleanup triggered via endpoint.');
  try {
    //Run storage cleanup and db cleanup logic
    await cleanupOldFiles();
    if (cleanupDatabaseHistory) await cleanupDatabaseHistory();
    if (cleanupCompletedJobs) await cleanupCompletedJobs();

    res.status(200).json({ success: true, message: 'Maintenance cleanup completed' });
  } catch (err) {
    console.error('[Maintenance] Error during manual cleanup:', err.message);
    res.status(500).json({ error: err.message });
  }
});

//error handling middleware
app.use((err, req, res, next) => {
  const status = err.status || 500;

  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  } else {
    console.error(`[${req.method}] ${req.originalUrl} - ${err.message}`);
  }

  res.status(status).json({
    message:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message
  });
});

const PORT = process.env.PORT;

if (!PORT) {
  throw new Error("PORT is not defined. This should never happen in production.");
}
console.log("ENV PORT:", process.env.PORT);
//start the server if this file is run directly
const server = app.listen(PORT, async () => {
  console.log(`Server started on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);

  // Verify database connectivity
  try {
    const client = await db.pool.connect();
    console.log('[DB] Database connectivity verified.');
    client.release();
  } catch (dbErr) {
    console.error('[DB] CRITICAL: Failed to connect to database on startup:', dbErr.message);
    // In production, we might want to keep running and hope for recovery,
    // or exit to let Render restart the instance.
  }

  startCleanupTask();
  //cron job to prevent Render from going to sleep
});

// Set a more aggressive timeout (30s) to handle slow clients or aborts gracefully
server.setTimeout(120000, (socket) => {
  console.warn('[Server] Connection timed out due to slow client or network issue.');
  socket.destroy();
});


//shutdown maintainer
process.on('SIGTERM', async () => {
  console.log('SIGTERM received');

  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;
