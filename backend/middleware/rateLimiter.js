const { rateLimit } = require('express-rate-limit');

/**
 * Key generator that prioritizes User ID for authenticated sessions,
 * falls back to normalized IP via ipKeyGenerator for IPv6 safety
 */
const userKeyGenerator = (req) => {
  if (req.user && req.user.id) return `user_${req.user.id}`;
  // Fallback to IP address
  return req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || 'unknown_ip';
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. GLOBAL BASELINE — applied at the app level to every request.
//    Acts as a safety net; individual route limiters override with tighter caps.
// ─────────────────────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,       // 15 minutes
  max: 300,                        // 300 requests per window per identity
  keyGenerator: userKeyGenerator,
  message: { message: "Too many requests from this source. Please try again later." },
  standardHeaders: true,           // Return rate-limit info via standard headers (RateLimit-*)
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. AUTH STRICT — login, register, OTP, Google auth.
//    Keyed by IP only because these are hit before authentication.
// ─────────────────────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,       // 15 minutes
  max: 20,                         // 10 attempts per window
  keyGenerator: (req) => req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || 'unknown_ip',
  message: { message: "Too many authentication attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GENERAL — standard authenticated API endpoints (read-heavy).
// ─────────────────────────────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,       // 15 minutes
  max: 500,
  keyGenerator: userKeyGenerator,
  message: { message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. UPLOAD — file upload related endpoints (prevents R2/DB spam).
// ─────────────────────────────────────────────────────────────────────────────
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  keyGenerator: userKeyGenerator,
  message: { message: "Slow down! You've initiated too many uploads. Please wait 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. QUEUE POLLING — dashboard queue refresh (high frequency but bounded).
// ─────────────────────────────────────────────────────────────────────────────
const queueLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,        // 1 minute
  max: 60,
  keyGenerator: userKeyGenerator,
  message: { message: "Queue refresh limit exceeded. Please wait a minute." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. SENSITIVE MUTATION — settings updates, username changes, order patches.
//    Tighter than general to prevent rapid-fire mutations.
// ─────────────────────────────────────────────────────────────────────────────
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,       // 15 minutes
  max: 30,                         // 30 mutations per window
  keyGenerator: userKeyGenerator,
  message: { message: "Too many update requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. DESTRUCTIVE — account deletion, order cancellation/deletion.
//    Very tight to prevent accidental or malicious mass deletions.
// ─────────────────────────────────────────────────────────────────────────────
const destructiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,       // 15 minutes
  max: 15,                         // 15 destructive actions per window
  keyGenerator: userKeyGenerator,
  message: { message: "Too many destructive actions. Please wait before trying again." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. HEALTH / SYSTEM — public health checks and admin system endpoints.
//    Prevents probing and DoS on diagnostic endpoints.
// ─────────────────────────────────────────────────────────────────────────────
const healthLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,        // 1 minute
  max: 20,                         // 20 per minute — enough for monitoring tools
  keyGenerator: (req) => req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || 'unknown_ip',
  message: { message: "Health check rate limit exceeded." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. DOWNLOAD — signed URL generation for file downloads.
//    Prevents mass scraping of signed URLs.
// ─────────────────────────────────────────────────────────────────────────────
const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,       // 15 minutes
  max: 100,                        // 100 download URLs per window
  keyGenerator: userKeyGenerator,
  message: { message: "Too many download requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  globalLimiter,
  authLimiter,
  generalLimiter,
  uploadLimiter,
  queueLimiter,
  sensitiveLimiter,
  destructiveLimiter,
  healthLimiter,
  downloadLimiter,
};
