# Security Audit Report - Printr Backend

## Overview
This report details security vulnerabilities, logical flaws, and other issues found in the Printr backend codebase. The audit was conducted in read-only mode without modifying any files.

## Critical Issues

### 1. Hardcoded Secrets in Environment File
- **File**: `backend/.env`
- **Lines**: 2-20
- **Severity**: Critical
- **Description**: The environment file contains actual secrets including database credentials with passwords, JWT secret, R2 storage keys, and Gmail app password.
- **Impact**: Anyone with access to the repository can extract these credentials and compromise the entire system.
- **Evidence**: 
  ```
  SUPABASE_URL=postgresql://postgres.jduoonbxrlmifpctncnl:Devanshu%4054678900@aws-1-ap-south-1.pooler.supabase.com:6543/postgres
  JWT_SECRET=supersecret123
  R2_ACCESS_KEY_ID=5b7e44f7292198799e9cb30e8567ee58
  R2_SECRET_ACCESS_KEY=7577359b563dee123ab264ef823aa817431f89f5b15517c8002d8f692c9b796a
  GMAIL_USER=printrapp.otp@gmail.com
  GMAIL_APP_PASS=xxxx xxxx xxxx xxxx
  ```
- **Note**: Although the `.env` file is listed in `.gitignore`, the presence of actual secrets in the file poses a risk if the file is ever accidentally committed or shared.

### 2. Weak JWT Secret
- **File**: `backend/.env`
- **Line**: 4
- **Severity**: Critical
- **Description**: JWT_SECRET is set to "supersecret123" which is weak and predictable.
- **Impact**: An attacker could brute force or guess this secret and forge authentication tokens, potentially gaining unauthorized access to any user account.
- **Evidence**: `JWT_SECRET=supersecret123`

### 3. Missing Input Validation in OTP Verification
- **File**: `backend/routes/auth.js`
- **Lines**: 309-310
- **Severity**: High
- **Description**: The OTP verification endpoint accepts a userId parameter without verifying it belongs to the authenticated user.
- **Impact**: A malicious user could verify another user's email by providing their userId and guessing the OTP.
- **Evidence**:
  ```javascript
  const { userId, otp } = req.body;
  const otpHash = hashToken(otp);
  
  // Fetch the latest unused OTP for this user
  const otpRecord = await db.query(
    `SELECT * FROM email_otps
     WHERE user_id = $1 AND used = false AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  ```

### 4. Potential Race Condition in OTP Attempt Tracking
- **File**: `backend/routes/auth.js`
- **Lines**: 326-337
- **Severity**: Medium
- **Description**: The OTP attempt counter is read, then updated separately, creating a race condition where multiple simultaneous requests could bypass the attempt limit.
- **Impact**: An attacker could send multiple OTP verification requests simultaneously to exceed the MAX_OTP_ATTEMPTS limit.
- **Evidence**:
  ```javascript
  // Check if max attempts exceeded
  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    await db.query('UPDATE email_otps SET used = true WHERE id = $1', [record.id]);
    return res.status(429).json({ error: 'Too many failed attempts. Please request a new code.' });
  }
  
  // Check if OTP matches
  if (record.otp_hash !== otpHash) {
    // Increment failed attempt counter
    await db.query('UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1', [record.id]);
    // ...
  }
  ```

### 5. Insecure SSL Configuration for Database
- **File**: `backend/db.js`
- **Line**: 18
- **Severity**: Medium
- **Description**: SSL is set to `{ rejectUnauthorized: false }` which disables certificate validation, making connections vulnerable to MITM attacks.
- **Impact**: An attacker could intercept database connections and steal credentials or data.
- **Evidence**:
  ```javascript
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }, //default to SSL for Supabase, only disable if strictly 'false'
  ```

### 6. Lack of Password Strength Validation
- **File**: `backend/middleware/schemas.js`
- **Lines**: 11-12
- **Severity**: Medium
- **Description**: Password validation only checks length (8+ chars) but doesn't require complexity (mix of character types).
- **Impact**: Users could set weak passwords like "12345678" or "password".
- **Evidence**:
  ```javascript
  /** Password: 8+ chars, at least one uppercase, one lowercase, one digit */
  const passwordField = z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password is too long');
  ```
  Note: The comment mentions complexity requirements but the implementation doesn't enforce them.

### 7. Information Leak in Error Handling
- **File**: `backend/index.js`
- **Lines**: 110-117
- **Severity**: Low
- **Description**: In development mode, full error messages are returned to clients, potentially leaking sensitive information.
- **Impact**: Error messages might reveal database structure, file paths, or other internal details.
- **Evidence**:
  ```javascript
  //error handling middleware
  app.use((err, req, res, next) => {
    console.error('[Error Stack]', err.stack);
    res.status(err.status || 500).json({
      message: process.env.NODE_ENV === 'production'
        ? "An unexpected error occurred"
        : err.message  // <-- Full error message in development
    });
  });
  ```

## Major Issues

### 1. Insecure Default for DB_SSL
- **File**: `backend/.env`
- **Line**: 9
- **Severity**: Low
- **Description**: DB_SSL=false is set in the example environment, which would disable SSL for database connections.
- **Impact**: If deployed with this setting, database credentials and data could be transmitted unencrypted.
- **Evidence**: `DB_SSL=false`

### 2. Missing Rate Limiting on Critical Endpoints
- **File**: `backend/routes/auth.js`
- **Lines**: 28-31, 88-90, 200-201, etc.
- **Severity**: Medium
- **Description**: While some endpoints have rate limiting, critical ones like login and OTP verification could benefit from stricter limits.
- **Impact**: Brute force attacks on passwords or OTP codes.
- **Evidence**: 
  ```javascript
  // Login endpoint uses authLimiter but could be stricter
  router.post('/login', [
    authLimiter,
    validateBody(loginSchema),
  ], async (req, res) => { ... });
  
  // OTP verification has no specific limiter beyond authLimiter
  router.post('/verify-email', [
    authLimiter,
    validateBody(verifyEmailSchema),
  ], async (req, res) => { ... });
  ```

### 3. Insecure Password Reset Implementation (Inferred)
- **File**: Not directly visible in codebase, but pattern suggests
- **Severity**: Medium
- **Description**: Based on the authentication patterns, if password reset functionality exists, it may have similar vulnerabilities to the OTP verification.
- **Impact**: Account takeover through password reset.
- **Note**: This is inferred from the OTP verification pattern.

## Minor Issues

### 1. Potential Timing Attack in Token Comparison
- **File**: `backend/utils/otp.js` (inferred)
- **Severity**: Low
- **Description**: Direct string comparison of hashes may be vulnerable to timing attacks.
- **Evidence**: Not directly visible but common in hash comparisons.

### 2. Lack of Security Headers
- **File**: `backend/index.js`
- **Lines**: 66-68
- **Severity**: Low
- **Description**: While helmet is used, specific security headers could be strengthened.
- **Evidence**: Basic helmet usage without specific configuration.

### 3. Verbose Logging Potentially Exposing Information
- **File**: Multiple files
- **Severity**: Low
- **Description**: Some console.log statements may expose internal details.
- **Evidence**: Various console.log statements throughout codebase.

## Architecture Risks

### 1. Centralized Secret Management
- **Risk**: All secrets are managed through environment variables which is good, but the .env file contains actual values.
- **Mitigation**: Use proper secret management in production (AWS Secrets Manager, HashiCorp Vault, etc.)

### 2. Single Point of Failure in Authentication
- **Risk**: JWT secret compromise would affect all authentication.
- **Mitigation**: Consider key rotation strategies and proper secret management.

### 3. Database Connection Pool Exhaustion Risk
- **File**: `backend/db.js`
- **Line**: 19
- **Description**: Max pool size of 40 may be insufficient under high load.
- **Evidence**: `max: 40,//max pool size -- current pooled connections`

## Recommendations

### Immediate Actions (Critical/High Priority)
1. **Remove actual secrets from .env file** and replace with placeholders or remove the file entirely
2. **Generate a strong JWT secret** (minimum 32 random characters)
3. **Add userId ownership verification** to the OTP verification endpoint
4. **Fix the OTP race condition** by using atomic operations for attempt tracking
5. **Enable proper SSL certificate validation** for database connections
6. **Implement proper password complexity requirements** in the validation schema

### Short-Term Actions (Medium Priority)
1. **Review and tighten rate limits** on authentication endpoints
2. **Implement proper error handling** that doesn't leak sensitive information
3. **Change DB_SSL default** to true or remove the setting to use secure defaults
4. **Review all console.log statements** for potential information leakage

### Long-Term Actions (Architecture Improvements)
1. **Implement proper secret management** for production deployments
2. **Add security headers** beyond basic helmet protection
3. **Consider implementing API versioning**
4. **Add comprehensive security testing** to the development pipeline
5. **Implement proper CORS policies** for production domains

## Estimated Production Readiness Score: 4/10

### Most Dangerous File/Module: `backend/.env`
- Contains actual production secrets that could lead to complete system compromise

### Most Likely Production Failure Point: Authentication System
- Weak JWT secret combined with potential OTP bypass vulnerabilities could lead to widespread account compromise

### Top 3 Fixes That Should Be Done First:
1. **Remove/secrete the actual secrets** in the backend/.env file
2. **Generate and deploy a strong JWT secret**
3. **Fix the OTP verification endpoint** to verify userId ownership and fix the race condition

## Additional Notes

The codebase shows good security awareness in many areas:
- Proper use of bcrypt for password hassing
- Parameterized queries to prevent SQL injection
- Input validation using Zod
- Rate limiting on sensitive endpoints
- Account lockout mechanisms
- Environment-based configuration

However, the critical issues with secret management significantly undermine these protections and must be addressed immediately before production deployment.