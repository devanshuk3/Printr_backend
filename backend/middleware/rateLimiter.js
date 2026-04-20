const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

/**
 * Key generator that prioritizes User ID for authenticated sessions,
 * falls back to normalized IP via ipKeyGenerator for IPv6 safety
 */
const userKeyGenerator = (req) => {
  if (req.user) return `user_${req.user.id}`;
  return ipKeyGenerator(req);
};

/**
 * Strict limiter for authentication endpoints (login, register, OTP, Google auth)
 * Keyed by IP only — these endpoints are hit before authentication
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 attempts per window
  keyGenerator: ipKeyGenerator,
  message: { message: "Too many authentication attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * General rate limiter for standard API endpoints
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, 
  keyGenerator: userKeyGenerator,
  message: { message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict limiter for file upload related endpoints (Prevents R2/DB spam)
 */
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 50, 
  keyGenerator: userKeyGenerator,
  message: { message: "Slow down! You've initiated too many uploads. Please wait 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Limiter for dashboard queue polling
 */
const queueLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, 
  max: 40, 
  keyGenerator: userKeyGenerator,
  message: { message: "Queue refresh limit exceeded. Please wait a minute." },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  authLimiter,
  generalLimiter,
  uploadLimiter,
  queueLimiter
};
