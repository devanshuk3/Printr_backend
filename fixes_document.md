# Printr Codebase Issues and Proposed Fixes

After a thorough static analysis of the Printr backend and mobile application codebases, several issues have been identified spanning from resource management to race conditions. 
**Note:** As requested, the CSP (Content Security Policy via Helmet) has been left untouched and is not considered an issue here.

## 1. Backend Issues

### 1.1 Database Connection Leak on Graceful Shutdown
**Location:** `backend/index.js` (line 193)
**Issue:** The `SIGTERM` handler successfully closes the Express server using `server.close()`, but it fails to close the PostgreSQL connection pool (`db.pool.end()`). When deploying on a platform like Render, repeated deployments or restarts will leave orphaned connections until they time out, potentially exhausting the database connection limit.
**Proposed Fix:** Import the database module inside `index.js` (already done) and call `await db.pool.end()` before `process.exit(0)`.

### 1.2 Missing Render Sleep Prevention Cron
**Location:** `backend/index.js` (line 178) & `backend/utils/cleanup.js`
**Issue:** A comment clearly states `//cron job to prevent Render from going to sleep`. However, the function called right before it (`startCleanupTask()`) only initiates internal cleanup scripts (R2 bucket cleaning, history purging), but no HTTP ping is made to keep the Render free-tier instance awake.
**Proposed Fix:** Implement a basic node-cron job that sends an HTTP GET request to the `/api/health` endpoint every 10-14 minutes to prevent the server from sleeping.

### 1.3 Inefficient Schema Query on Vendor Registration
**Location:** `backend/routes/vendors.js` (lines 538-548)
**Issue:** The `/register` route executes a raw SQL query against `information_schema.columns` every single time a vendor registers. This adds unnecessary latency and load to the database.
**Proposed Fix:** Cache the result of this schema query in memory upon the first registration, or better yet, define the permitted column array statically in the codebase to eliminate the need for the runtime schema check entirely.

### 1.4 Race Condition in Google Auth Username Generation
**Location:** `backend/routes/auth.js` (lines 220-224)
**Issue:** When a new user logs in via Google, the system checks if the derived username exists. If it does, it appends a random hex string. However, if two requests with the same derived username come in concurrently, they could both pass the `SELECT` check and one will crash with a unique constraint violation on `INSERT`.
**Proposed Fix:** Wrap the generation in a `while` loop that attempts the `INSERT` and catches the unique violation (code '23505') specifically for the username, retrying with a new random hex until successful.

### 1.5 Duplicated Configuration
**Location:** `backend/index.js` (lines 51 and 111)
**Issue:** `app.set('trust proxy', 1);` is invoked twice. 
**Proposed Fix:** Remove the duplicate call on line 111.

---

## 2. Mobile App Issues

### 2.1 Missing Native Fallback for Google Play Services
**Location:** `mobile-app/app/(auth)/login.tsx` (lines 38-63)
**Issue:** The app relies on `@react-native-google-signin/google-signin`. While `hasPlayServices()` is called, if it fails (e.g., on some customized Android ROMs, older devices without Play Services, or emulators), it immediately aborts the login attempt.
**Proposed Fix:** Add better error handling UX for missing Play Services. Currently it only warns in the console for non-`DEVELOPER_ERROR`s. Furthermore, providing a robust web-based fallback (using `expo-web-browser` with a standard OAuth URL) would be ideal for devices without Play Services.
