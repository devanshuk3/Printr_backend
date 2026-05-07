const db = require('../db');

const normalizeIdentifier = (value) => (value == null ? '' : String(value)).trim().toLowerCase();

/**
 * Account lockout configuration
 */
const LOCKOUT_CONFIG = {
  MAX_FAILED_ATTEMPTS: 8,            // Lock after 5 consecutive failures
  LOCKOUT_DURATION_MS: 15 * 60 * 1000, // 15-minute lockout window
};

/**
 * Check if a user account is currently locked out.
 * Returns { locked: boolean, remainingMs?: number }
 */
const checkLockout = async (table, identifierColumn, identifierValue) => {
  const normalized = normalizeIdentifier(identifierValue);
  const result = await db.query(
    `SELECT failed_login_attempts, locked_until FROM ${table} WHERE ${identifierColumn} = $1`,
    [normalized]
  );

  if (result.rows.length === 0) {
    return { locked: false, userExists: false };
  }

  const row = result.rows[0];

  // Check if actively locked
  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    const remainingMs = new Date(row.locked_until).getTime() - Date.now();
    const remainingMins = Math.ceil(remainingMs / 60000);
    return {
      locked: true,
      userExists: true,
      remainingMs,
      message: `Account temporarily locked. Try again in ${remainingMins} minute${remainingMins !== 1 ? 's' : ''}.`,
    };
  }

  return { locked: false, userExists: true };
};

/**
 * Record a failed login attempt. If threshold is exceeded, lock the account.
 */
const recordFailedAttempt = async (table, identifierColumn, identifierValue) => {
  const normalized = normalizeIdentifier(identifierValue);
  // Increment failed attempts counter
  const result = await db.query(
    `UPDATE ${table}
     SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1
     WHERE ${identifierColumn} = $1
     RETURNING failed_login_attempts`,
    [normalized]
  );

  if (result.rows.length === 0) return;

  const attempts = result.rows[0].failed_login_attempts;

  // Lock if threshold exceeded
  if (attempts >= LOCKOUT_CONFIG.MAX_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_CONFIG.LOCKOUT_DURATION_MS);
    await db.query(
      `UPDATE ${table}
       SET locked_until = $1
       WHERE ${identifierColumn} = $2`,
      [lockedUntil, normalized]
    );
    console.log(`[Security] Account locked: ${identifierValue} (${table}) until ${lockedUntil.toISOString()}`);
  }

  return attempts;
};

/**
 * Reset failed attempts after a successful login.
 */
const resetFailedAttempts = async (table, identifierColumn, identifierValue) => {
  const normalized = normalizeIdentifier(identifierValue);
  await db.query(
    `UPDATE ${table}
     SET failed_login_attempts = 0, locked_until = NULL
     WHERE ${identifierColumn} = $1`,
    [normalized]
  );
};

// ─── Convenience wrappers for Users table ─────────────────────────────────────

/**
 * Check lockout for a user by email or username.
 * Since login accepts either, we query by both.
 */
const checkUserLockout = async (identifier) => {
  const normalized = normalizeIdentifier(identifier);
  const result = await db.query(
    `SELECT failed_login_attempts, locked_until FROM users
     WHERE email = $1 OR username = $1`,
    [normalized]
  );

  if (result.rows.length === 0) {
    return { locked: false, userExists: false };
  }

  const row = result.rows[0];
  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    const remainingMs = new Date(row.locked_until).getTime() - Date.now();
    const remainingMins = Math.ceil(remainingMs / 60000);
    return {
      locked: true,
      userExists: true,
      remainingMs,
      message: `Account temporarily locked due to too many failed attempts. Try again in ${remainingMins} minute${remainingMins !== 1 ? 's' : ''}.`,
    };
  }

  return { locked: false, userExists: true };
};

const recordUserFailedAttempt = async (identifier) => {
  const normalized = normalizeIdentifier(identifier);
  // We need to update by the same flexible identifier
  const result = await db.query(
    `UPDATE users
     SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1
     WHERE email = $1 OR username = $1
     RETURNING failed_login_attempts`,
    [normalized]
  );

  if (result.rows.length === 0) return;

  const attempts = result.rows[0].failed_login_attempts;

  if (attempts >= LOCKOUT_CONFIG.MAX_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_CONFIG.LOCKOUT_DURATION_MS);
    await db.query(
      `UPDATE users
       SET locked_until = $1
       WHERE email = $2 OR username = $2`,
      [lockedUntil, normalized]
    );
    console.log(`[Security] User account locked: ${identifier} until ${lockedUntil.toISOString()}`);
  }

  return attempts;
};

const resetUserFailedAttempts = async (identifier) => {
  const normalized = normalizeIdentifier(identifier);
  await db.query(
    `UPDATE users
     SET failed_login_attempts = 0, locked_until = NULL
     WHERE email = $1 OR username = $1`,
    [normalized]
  );
};

// ─── Convenience wrappers for Vendors table ───────────────────────────────────

const checkVendorLockout = (vendorId) =>
  checkLockout('vendors', 'vendor_id', vendorId);

const recordVendorFailedAttempt = (vendorId) =>
  recordFailedAttempt('vendors', 'vendor_id', vendorId);

const resetVendorFailedAttempts = (vendorId) =>
  resetFailedAttempts('vendors', 'vendor_id', vendorId);

module.exports = {
  LOCKOUT_CONFIG,
  checkUserLockout,
  recordUserFailedAttempt,
  resetUserFailedAttempts,
  checkVendorLockout,
  recordVendorFailedAttempt,
  resetVendorFailedAttempts,
};
