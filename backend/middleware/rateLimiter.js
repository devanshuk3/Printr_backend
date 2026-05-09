const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

/**
 * IMPORTANT:
 * In your main server file add:
 *
 * app.set('trust proxy', 1);
 *
 * BEFORE applying rate limiters.
 *
 * Otherwise req.ip may fail correctly on Render/Reverse proxies.
 */

// ─────────────────────────────────────────────────────────────
// SAFE IP EXTRACTION
// ─────────────────────────────────────────────────────────────

const getClientIdentifier = (req) => {
  // Prefer authenticated user
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }

  // Safe IP from Express trust proxy
  return `ip:${req.ip}`;
};

// Hybrid key for sensitive routes
const hybridKeyGenerator = (req) => {
  const ip = req.ip || 'unknown';

  if (req.user?.id) {
    return `user:${req.user.id}:ip:${ip}`;
  }

  return `ip:${ip}`;
};

// ─────────────────────────────────────────────────────────────
// COMMON CONFIG
// ─────────────────────────────────────────────────────────────

const commonConfig = {
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    trustProxy: false,
  },
};

// ─────────────────────────────────────────────────────────────
// GLOBAL SAFETY NET
// Applies everywhere
// ─────────────────────────────────────────────────────────────

const globalLimiter = rateLimit({
  ...commonConfig,
  windowMs: 15 * 60 * 1000,
  max: 350,
  keyGenerator: getClientIdentifier,

  message: {
    message: 'Too many requests. Please slow down.',
  },

  skip: (req) => {
    // Skip health checks globally
    return req.path === '/health';
  },
});

// ─────────────────────────────────────────────────────────────
// AUTH LIMITER
// STRICT because internet is hostile
// ─────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
  ...commonConfig,
  windowMs: 15 * 60 * 1000,
  max: 10,

  keyGenerator: (req) => `ip:${req.ip}`,

  message: {
    message:
      'Too many authentication attempts. Please try again later.',
  },

  skipSuccessfulRequests: false,
});

// ─────────────────────────────────────────────────────────────
// OTP SEND LIMITER
// VERY IMPORTANT
// ─────────────────────────────────────────────────────────────

const otpLimiter = rateLimit({
  ...commonConfig,
  windowMs: 15 * 60 * 1000,
  max: 5,

  keyGenerator: (req) => {
    const email = req.body?.email || 'unknown';
    return `otp:${email}:${req.ip}`;
  },

  message: {
    message:
      'Too many OTP requests. Please wait before requesting again.',
  },
});

// ─────────────────────────────────────────────────────────────
// GENERAL API LIMITER
// Read-heavy routes
// ─────────────────────────────────────────────────────────────

const generalLimiter = rateLimit({
  ...commonConfig,
  windowMs: 15 * 60 * 1000,
  max: 600,

  keyGenerator: getClientIdentifier,

  message: {
    message: 'API rate limit exceeded.',
  },
});

// ─────────────────────────────────────────────────────────────
// VENDOR DASHBOARD LIMITER
// Separate because dashboards poll frequently
// This likely fixes your vendor dashboard issue
// ─────────────────────────────────────────────────────────────

const vendorDashboardLimiter = rateLimit({
  ...commonConfig,
  windowMs: 1 * 60 * 1000,

  // generous enough for polling
  max: 180,

  keyGenerator: hybridKeyGenerator,

  message: {
    message:
      'Dashboard refresh rate too high. Please slow down.',
  },

  // successful GETs should not punish vendors too aggressively
  skipFailedRequests: false,
});

// ─────────────────────────────────────────────────────────────
// UPLOAD LIMITER
// R2 protection
// ─────────────────────────────────────────────────────────────

const uploadLimiter = rateLimit({
  ...commonConfig,
  windowMs: 10 * 60 * 1000,

  // realistic production-safe limit
  max: 35,

  keyGenerator: hybridKeyGenerator,

  message: {
    message:
      'Too many uploads initiated. Please wait a few minutes.',
  },
});

// ─────────────────────────────────────────────────────────────
// DOWNLOAD/SIGNED URL LIMITER
// Prevent scraping
// ─────────────────────────────────────────────────────────────

const downloadLimiter = rateLimit({
  ...commonConfig,
  windowMs: 15 * 60 * 1000,
  max: 120,

  keyGenerator: hybridKeyGenerator,

  message: {
    message:
      'Too many download requests. Please slow down.',
  },
});

// ─────────────────────────────────────────────────────────────
// SENSITIVE MUTATIONS
// Settings/profile/order changes
// ─────────────────────────────────────────────────────────────

const sensitiveLimiter = rateLimit({
  ...commonConfig,
  windowMs: 15 * 60 * 1000,
  max: 25,

  keyGenerator: hybridKeyGenerator,

  message: {
    message:
      'Too many update operations. Please slow down.',
  },
});

// ─────────────────────────────────────────────────────────────
// DESTRUCTIVE ACTIONS
// Delete/cancel/remove
// ─────────────────────────────────────────────────────────────

const destructiveLimiter = rateLimit({
  ...commonConfig,
  windowMs: 15 * 60 * 1000,
  max: 8,

  keyGenerator: hybridKeyGenerator,

  message: {
    message:
      'Too many destructive operations. Please wait.',
  },
});

// ─────────────────────────────────────────────────────────────
// HEALTH CHECK LIMITER
// ─────────────────────────────────────────────────────────────

const healthLimiter = rateLimit({
  ...commonConfig,
  windowMs: 1 * 60 * 1000,
  max: 60,

  keyGenerator: (req) => `ip:${req.ip}`,

  message: {
    message: 'Health endpoint rate limit exceeded.',
  },
});

// ─────────────────────────────────────────────────────────────
// SLOWDOWN MIDDLEWARE
// Better UX than immediate blocking
// ─────────────────────────────────────────────────────────────

const apiSpeedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,

  // allow burst traffic first
  delayAfter: 150,

  // gradual slowdown
  delayMs: (hits) => hits * 75,

  maxDelayMs: 3000,

  keyGenerator: getClientIdentifier,
});

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  globalLimiter,
  authLimiter,
  otpLimiter,
  generalLimiter,
  vendorDashboardLimiter,
  uploadLimiter,
  downloadLimiter,
  sensitiveLimiter,
  destructiveLimiter,
  healthLimiter,
  apiSpeedLimiter,
};