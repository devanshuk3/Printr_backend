const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const https = require('https');
const rateLimit = require('express-rate-limit');
const enforce = require('express-sslify');
const { startCleanupTask } = require('./utils/cleanup');
require('dotenv').config();

const app = express();

// 1. Security Headers
app.use(helmet());

// 2. HTTPS Enforcement in Production
if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
  app.use(enforce.HTTPS({ trustProtoHeader: true }));
}

// 3. Secure CORS Configuration
const allowedOrigins = [
  'http://localhost:8081', // Expo local dev
  'http://localhost:19000', // Expo Go
  'https://printr-backend.onrender.com', // Own production URL
  // Add other origins like your web dashboard if applicable
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
  credentials: true
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.static('public'));

// 4. Rate Limiting for Auth and Sensitive Routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs for auth
  message: { message: "Too many login attempts, please try again after 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // General limit
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, 
  max: 50, // 50 upload requests per hour
  message: { message: "Upload limit reached. Please try again later." },
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/google', authLimiter);
app.use('/api/vendors/files/upload-url', uploadLimiter);

// Request logger (Sanitizing logs in production)
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
  }
  next();
});

// Start Background Tasks
if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
  startCleanupTask();
}

// Health check for Render
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/vendors', require('./routes/vendors'));

// 5. Global Error Handler (to prevent leaking technical details)
app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err.stack);
  res.status(err.status || 500).json({
    message: process.env.NODE_ENV === 'production' 
      ? "An unexpected error occurred" 
      : err.message
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  
  // Keep-alive mechanism from ENV
  const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL;
  if (KEEP_ALIVE_URL && (process.env.NODE_ENV === 'production' || process.env.RENDER)) {
    setInterval(() => {
      https.get(KEEP_ALIVE_URL, (res) => {
        // Silent success logger
      }).on('error', (err) => {
        console.error('Keep-alive ping failed');
      });
    }, 5 * 60 * 1000); // 5 Minutes
  }
});
