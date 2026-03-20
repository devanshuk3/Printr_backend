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

// Start Background Tasks (Always run cleanup in all environments to ensure it works)
startCleanupTask();

// Health check for Render
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Keep payment details hidden from the URL bar via session storage
const paymentSessions = new Map();

// 1. Initialize a payment session (POST from Mobile App)
app.post('/api/pay/init', (req, res) => {
  const { pa, pn, am, tn } = req.body;
  if (!pa || !am) return res.status(400).json({ message: "Missing payment details" });
  
  const sessionId = Math.random().toString(36).substring(2, 15) + Date.now().toString(36).slice(-4);
  paymentSessions.set(sessionId, { pa, pn, am, tn, createdAt: Date.now() });
  
  // Cleanup after 15 mins to prevent memory leak
  setTimeout(() => paymentSessions.delete(sessionId), 15 * 60 * 1000);
  
  res.json({ sessionId });
});

// 2. Mediated Redirect Page (GET from Browser)
app.get('/api/pay/:sessionId', (req, res) => {
  const session = paymentSessions.get(req.params.sessionId);
  if (!session) {
    return res.status(110).send("<html><body style='font-family:sans-serif; text-align:center; padding-top:100px;'><h2>Access Denied</h2><p>Payment link is expired or invalid.</p></body></html>");
  }
  
  const { pa, pn, am, tn } = session;
  const pkg = req.query.pkg || ''; // Optional app package for targeted intent
  
  const upiParams = `pa=${pa}&pn=${encodeURIComponent(pn)}&am=${am}&tn=${encodeURIComponent(tn || '')}&cu=INR`;
  const upiLink = `upi://pay?${upiParams}`;
  
  // Targeted Intent if pkg provided, else generic
  const androidIntent = pkg 
    ? `intent://pay?${upiParams}#Intent;scheme=upi;package=${pkg};S.browser_fallback_url=https://play.google.com/store/apps/details?id=${pkg};end`
    : `intent://pay?${upiParams}#Intent;scheme=upi;end`;  

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="refresh" content="0;url=${upiLink}" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Fast UPI Checkout</title>
        <style>
            body { 
                background: #f8fbff; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                height: 100vh; 
                margin: 0; 
                font-family: -apple-system, system-ui, sans-serif; 
                color: #1a202c;
            }
            .content { text-align: center; width: 90%; max-width: 320px; }
            .loader {
                border: 4px solid #e2e8f0;
                border-top: 4px solid #1271dd;
                border-radius: 50%;
                width: 50px;
                height: 50px;
                animation: spin 1s linear infinite;
                margin: 0 auto 20px;
            }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .status-text { font-size: 18px; font-weight: 600; margin-bottom: 24px; color: #2d3748; }
            .btn {
                display: none;
                padding: 20px 40px;
                background: #1271dd;
                color: white !important;
                text-decoration: none;
                border-radius: 18px;
                font-weight: 700;
                font-size: 18px;
                margin-top: 10px;
                box-shadow: 0 10px 25px rgba(18, 113, 221, 0.4);
                animation: pulse 1.5s infinite;
            }
            @keyframes pulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.03); }
                100% { transform: scale(1); }
            }
        </style>
    </head>
    <body>
        <div class="content">
            <div id="loading-state">
                <div class="loader"></div>
                <div class="status-text">Handshaking with UPI App...</div>
                <p style="color: #718096; font-size: 14px;">Please wait, redirecting you securely.</p>
            </div>
            <a href="${upiLink}" id="pay-btn" class="btn">Click to Finish Payment</a>
        </div>

        <script>
            // Execution block
            const upiUrl = /android/i.test(navigator.userAgent) ? "${androidIntent}" : "${upiLink}";
            
            // 1. Immediate call
            window.location.href = upiUrl;

            // 2. JS Fallback calls
            setTimeout(function() { window.location.replace(upiUrl); }, 100);
            setTimeout(function() { window.location.replace(upiUrl); }, 500);

            // 3. UI Reveal for manual interaction
            setTimeout(function() {
                document.getElementById('loading-state').style.display = 'none';
                document.getElementById('pay-btn').style.display = 'inline-block';
            }, 2500);
        </script>
    </body>
    </html>
  `;
  res.send(html);
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
