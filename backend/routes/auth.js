const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const { body } = require('express-validator');
const { validate } = require('../middleware/validator');
const auth = require('../middleware/auth');

/**
 * @helper Sanitize error message for production
 */
const handleError = (res, err, customMsg = "Server Error") => {
  console.error(`${customMsg}:`, err.message || err);
  return res.status(500).json({ 
    message: process.env.NODE_ENV === 'production' ? customMsg : `${customMsg}: ${err.message}` 
  });
};

// Register
router.post('/register', [
  body('fullName').trim().notEmpty().withMessage('Full name is required').escape(),
  body('email').isEmail().withMessage('Invalid email address').normalizeEmail().trim(),
  body('username').trim().notEmpty().withMessage('Username is required').isLength({ min: 3 }).withMessage('Username must be at least 3 characters long').escape(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  validate
], async (req, res) => {
  const { fullName, email, username, password } = req.body;

  try {
    // Hash password first
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Use INSERT ... ON CONFLICT or check existence within a transaction/logic
    // For simplicity and compatibility, we use a single query that fails if exists
    // Ensure email and username HAVE UNIQUE CONSTRAINTS in DB schema
    
    let newUser;
    try {
      newUser = await db.query(
        'INSERT INTO users (full_name, email, username, password) VALUES ($1, $2, $3, $4) RETURNING id, full_name, email, username',
        [fullName, email, username, hashedPassword]
      );
    } catch (insertErr) {
      if (insertErr.code === '23505') { // Unique violation in Postgres
        const detail = insertErr.detail || '';
        if (detail.includes('email')) return res.status(400).json({ message: "Email already exists" });
        if (detail.includes('username')) return res.status(400).json({ message: "Username already taken" });
        return res.status(400).json({ message: "User already exists" });
      }
      return handleError(res, insertErr, "Registration failed");
    }

    const token = jwt.sign(
      { id: newUser.rows[0].id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: newUser.rows[0].id,
        fullName: newUser.rows[0].full_name,
        email: newUser.rows[0].email,
        username: newUser.rows[0].username
      }
    });

  } catch (err) {
    handleError(res, err, "Signup failed");
  }
});

// Login
router.post('/login', [
  body('identifier').trim().notEmpty().withMessage('Email or username is required').escape(),
  body('password').notEmpty().withMessage('Password is required'),
  validate
], async (req, res) => {
  const { identifier, password } = req.body;

  try {
    const userRes = await db.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1)',
      [identifier]
    );
    
    // Generic "Invalid credentials" to prevent enumeration
    if (userRes.rows.length === 0) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const user = userRes.rows[0];

    // Validate password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        username: user.username
      }
    });

  } catch (err) {
    handleError(res, err, "Login failed");
  }
});

// Verify current session
router.get('/verify', auth, async (req, res) => {
  try {
    const userRes = await db.query('SELECT id, full_name, email, username FROM users WHERE id = $1', [req.user.id]);
    
    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userRes.rows[0];
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        username: user.username
      }
    });
  } catch (err) {
    handleError(res, err, "Session verification failed");
  }
});

// Delete account
router.delete('/account', auth, async (req, res) => {
  try {
    const result = await db.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    if (result.rowCount === 0) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Account deleted successfully" });
  } catch (err) {
    handleError(res, err, "Account deletion failed");
  }
});

// Google Login
router.post('/google', [
  body('idToken').notEmpty().withMessage('ID Token is required'),
  validate
], async (req, res) => {
  const { idToken } = req.body;

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name } = payload;

    let userRes = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    let user;

    if (userRes.rows.length === 0) {
      // Create new user
      let username = email.split('@')[0];
      const checkUsername = await db.query('SELECT * FROM users WHERE username = $1', [username]);
      if (checkUsername.rows.length > 0) {
        username = `${username}_${crypto.randomBytes(2).toString('hex')}`;
      }

      // NO PLAINTEXT PASSWORDS. Use a long random hash.
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(randomPassword, salt);

      const newUser = await db.query(
        'INSERT INTO users (full_name, email, username, password) VALUES ($1, $2, $3, $4) RETURNING id, full_name, email, username',
        [name, email, username, hashedPassword]
      );
      user = newUser.rows[0];
    } else {
      user = userRes.rows[0];
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      isNewUser: userRes.rows.length === 0,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        username: user.username
      }
    });
  } catch (err) {
    handleError(res, err, "Google authentication failed");
  }
});

// Update username
router.put('/username', [
  auth,
  body('username').trim().notEmpty().withMessage('Username cannot be empty').isLength({ min: 3 }).withMessage('Username must be at least 3 characters long').escape(),
  validate
], async (req, res) => {
  const { username } = req.body;

  try {
    const checkRes = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (checkRes.rows.length > 0 && checkRes.rows[0].id !== req.user.id) {
      return res.status(400).json({ message: "Username already taken" });
    }

    await db.query('UPDATE users SET username = $1 WHERE id = $2', [username, req.user.id]);
    res.json({ message: "Username updated successfully", username });
  } catch (err) {
    handleError(res, err, "Username update failed");
  }
});

// Get user details by username (for Windows side lookup)
router.get('/user/:username', [
  auth
], async (req, res) => {
  const { username } = req.params;

  try {
    const userRes = await db.query(
      'SELECT full_name, email, username FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(userRes.rows[0]);
  } catch (err) {
    handleError(res, err, "Fetching user details failed");
  }
});

module.exports = router;
