const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Register
router.post('/register', async (req, res) => {
  const { fullName, email, username, password } = req.body;

  try {
    // Basic validation
    if (!fullName || !email || !username || !password) {
      return res.status(400).json({ message: "Please enter all fields" });
    }

    // Check if user exists (email or username)
    let userRes;
    try {
      userRes = await db.query('SELECT * FROM users WHERE email = $1 OR username = $2', [email, username]);
    } catch (dbErr) {
      console.error('Database query error (check user):', dbErr.message);
      return res.status(500).json({ message: "Database Error: " + dbErr.message });
    }

    if (userRes.rows.length > 0) {
      const existingUser = userRes.rows[0];
      if (existingUser.email === email) {
        return res.status(400).json({ message: "Email already exists" });
      }
      if (existingUser.username === username) {
        return res.status(400).json({ message: "Username already taken" });
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert user
    let newUser;
    try {
      newUser = await db.query(
        'INSERT INTO users (full_name, email, username, password) VALUES ($1, $2, $3, $4) RETURNING id, full_name, email, username',
        [fullName, email, username, hashedPassword]
      );
    } catch (dbErr) {
      console.error('Database insert error:', dbErr.message);
      return res.status(500).json({ message: "Database Insertion Error: " + dbErr.message });
    }

    // Create token
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET missing in environment');
      return res.status(500).json({ message: "Server Error: JWT Secret is missing" });
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
    console.error('Fatal Signup Error:', err.message);
    res.status(500).json({ message: "Internal Server Error: " + err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { identifier, password } = req.body; // 'identifier' can be email or username

  try {
    if (!identifier || !password) {
      return res.status(400).json({ message: "Please enter all fields" });
    }

    // Check for user (by email or username)
    const userRes = await db.query(
      'SELECT * FROM users WHERE email = $1 OR username = $1',
      [identifier]
    );
    if (userRes.rows.length === 0) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const user = userRes.rows[0];

    // Validate password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Create token
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Server Error: JWT Secret is missing" });
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
    console.error('Login Error:', err.message);
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

// Verify current session
const auth = require('../middleware/auth');
router.get('/verify', auth, async (req, res) => {
  try {
    const userRes = await db.query('SELECT id, full_name, email, username FROM users WHERE id = $1', [req.user.id]);
    
    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userRes.rows[0];

    // Create a NEW token to extend the session (resetting the 7-day timer)
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
    console.error('Verify Error:', err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete account
router.delete('/account', auth, async (req, res) => {
  try {
    const result = await db.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "Account deleted successfully" });
  } catch (err) {
    console.error('Delete Account Error:', err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Google Login
router.post('/google', async (req, res) => {
  const { idToken } = req.body;

  try {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({ message: "Server Error: Google Client ID is missing" });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name } = payload;

    // Check if user exists
    let userRes = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    let user;

    if (userRes.rows.length === 0) {
      // Create new user if they don't exist
      let username = email.split('@')[0];
      
      // Check if username exists, if so append something
      const checkUsername = await db.query('SELECT * FROM users WHERE username = $1', [username]);
      if (checkUsername.rows.length > 0) {
        username = `${username}_${Math.floor(Math.random() * 1000)}`;
      }

      // Insert with dummy password as social users don't need one
      const newUser = await db.query(
        'INSERT INTO users (full_name, email, username, password) VALUES ($1, $2, $3, $4) RETURNING id, full_name, email, username',
        [name, email, username, 'GOOGLE_AUTH_USER']
      );
      user = newUser.rows[0];
    } else {
      user = userRes.rows[0];
    }

    // Create token
    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

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
    console.error('Google Auth Error:', err.message);
    res.status(400).json({ message: "Google authentication failed: " + err.message });
  }
});

// Update username
router.put('/username', auth, async (req, res) => {
  const { username } = req.body;

  try {
    if (!username || username.trim() === '') {
      return res.status(400).json({ message: "Username cannot be empty" });
    }

    // Check if new username is already taken
    const checkRes = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    if (checkRes.rows.length > 0) {
      // If it belongs to someone else
      if (checkRes.rows[0].id !== req.user.id) {
        return res.status(400).json({ message: "Username already taken" });
      }
    }

    // Update username
    await db.query('UPDATE users SET username = $1 WHERE id = $2', [username, req.user.id]);
    
    res.json({ message: "Username updated successfully", username });
  } catch (err) {
    console.error('Update Username Error:', err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
