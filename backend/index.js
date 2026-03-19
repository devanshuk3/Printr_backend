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
  const upiParams = `pa=${pa}&pn=${encodeURIComponent(pn)}&am=${am}&tn=${encodeURIComponent(tn || '')}&cu=INR`;
  const upiLink = `upi://pay?${upiParams}`;
  const androidIntent = `intent://pay?${upiParams}#Intent;scheme=upi;package=in.org.npci.upiapp;end`; // Generic NPICI package to trigger chooser or app
  
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pay via UPI</title>
        <script>
            function startPayment() {
                const isAndroid = /android/i.test(navigator.userAgent);
                const upiUrl = isAndroid ? "${androidIntent}" : "${upiLink}";
                
                // Strategy 1: Immediate Direct Location Change
                window.location.href = upiUrl;

                // Strategy 2: Delay-based Retry
                setTimeout(function() {
                    window.location.replace(upiUrl);
                }, 250);

                // Strategy 3: Reveal Manual Button after handshake wait
                setTimeout(function() {
                    document.getElementById('loading').style.display = 'none';
                    document.getElementById('action-card').style.display = 'block';
                }, 3000);
            }
        </script>
        <style>
            body { 
                background: #f0f7ff; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                height: 100vh; 
                margin: 0; 
                font-family: -apple-system, system-ui, sans-serif; 
                color: #2e3563;
                text-align: center;
            }
            #action-card {
                display: none;
                background: white;
                padding: 40px;
                border-radius: 30px;
                box-shadow: 0 10px 40px rgba(46, 53, 99, 0.1);
                width: 85%;
                max-width: 320px;
            }
            .pay-btn {
                display: inline-block;
                padding: 18px 40px;
                background: #1271dd;
                color: white !important;
                text-decoration: none;
                border-radius: 16px;
                font-weight: bold;
                font-size: 18px;
                box-shadow: 0 8px 20px rgba(18, 113, 221, 0.3);
            }
            .loader {
                border: 4px solid #f3f3f3;
                border-top: 4px solid #1271dd;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                animation: spin 1s linear infinite;
            }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
    </head>
    <body onload="startPayment()">
        <div id="loading">
            <div class="loader" style="margin: 0 auto 20px;"></div>
            <p>Authenticating with UPI app...</p>
        </div>

        <div id="action-card">
            <h2 style="margin-top: 0;">UPI App Not Opening?</h2>
            <p style="color: #64748b; margin-bottom: 30px;">Tap the button below to finish your payment of ₹${am}</p>
            <a href="${upiLink}" class="pay-btn">Open UPI App</a>
        </div>
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
