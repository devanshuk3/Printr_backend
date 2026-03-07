const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// Register
router.post('/register', async (req, res) => {
  const { fullName, email, password } = req.body;

  try {
    // Basic validation
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "Please enter all fields" });
    }

    // Check if user exists
    let userRes;
    try {
      userRes = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    } catch (dbErr) {
      console.error('Database query error (check user):', dbErr.message);
      return res.status(500).json({ message: "Database Error: " + dbErr.message });
    }

    if (userRes.rows.length > 0) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert user
    let newUser;
    try {
      newUser = await db.query(
        'INSERT INTO users (full_name, email, password) VALUES ($1, $2, $3) RETURNING id, full_name, email',
        [fullName, email, hashedPassword]
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
        email: newUser.rows[0].email
      }
    });

  } catch (err) {
    console.error('Fatal Signup Error:', err.message);
    res.status(500).json({ message: "Internal Server Error: " + err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: "Please enter all fields" });
    }

    // Check for user
    const userRes = await db.query('SELECT * FROM users WHERE email = $1', [email]);
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
        email: user.email
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
    const userRes = await db.query('SELECT id, full_name, email FROM users WHERE id = $1', [req.user.id]);
    
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
        email: user.email
      }
    });

  } catch (err) {
    console.error('Verify Error:', err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
