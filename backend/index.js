const express = require('express');
const cors = require('cors');
const https = require('https');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files from 'public' folder

// Request logger
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Health check for Render
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Routes
app.use('/api/auth', require('./routes/auth'));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
  
  // Keep-alive mechanism to prevent Render sleep (5 min interval)
  const KEEP_ALIVE_URL = 'https://printr-backend.onrender.com/api/health';
  if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    setInterval(() => {
      https.get(KEEP_ALIVE_URL, (res) => {
        console.log(`Keep-alive ping sent (Status: ${res.statusCode})`);
      }).on('error', (err) => {
        console.error('Keep-alive ping failed:', err.message);
      });
    }, 5 * 60 * 1000); // 5 Minutes
  }
});
