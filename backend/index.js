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
  const upiLink = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&tn=${tn || ''}&cu=INR`;
  
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Processing Payment...</title>
        <script>
            function triggerRedirect() {
                // Method 1: Location refresh
                window.location.href = "${upiLink}";
                
                // Method 2: Click simulation (Robust fallback for Safari/Chrome focus)
                setTimeout(() => {
                    const link = document.createElement('a');
                    link.href = "${upiLink}";
                    link.style.display = 'none';
                    document.body.appendChild(link);
                    link.click();
                }, 100);

                // Method 3: Final fallback message
                setTimeout(() => {
                    document.getElementById('status').innerText = "Redirecting...";
                    document.getElementById('manual-btn').style.display = 'inline-block';
                }, 1500);
            }
        </script>
        <style>
            body { 
                background: #f8fbff; 
                display: flex; 
                flex-direction: column; 
                align-items: center; 
                justify-content: center; 
                height: 100vh; 
                margin: 0; 
                font-family: -apple-system, system-ui, sans-serif; 
                color: #2e3563;
            }
            .loader {
                border: 4px solid #f3f3f3;
                border-top: 4px solid #1271dd;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                animation: spin 1s linear infinite;
                margin-bottom: 20px;
            }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            #manual-btn {
                display: none;
                padding: 16px 32px;
                background: #1271dd;
                color: white;
                text-decoration: none;
                border-radius: 12px;
                font-weight: 600;
                margin-top: 20px;
                box-shadow: 0 4px 15px rgba(18, 113, 221, 0.3);
            }
        </style>
    </head>
    <body onload="triggerRedirect()">
        <div class="loader"></div>
        <p id="status" style="font-weight: 500;">Securely handshaking with UPI app...</p>
        <a id="manual-btn" href="${upiLink}">Continue to Payment App</a>
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
