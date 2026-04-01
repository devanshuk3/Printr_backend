const express = require('express');
const router = express.Router();
const db = require('../db');
const r2 = require('../r2');
const { GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { param, body } = require('express-validator');
const { validate } = require('../middleware/validator');
const auth = require('../middleware/auth');
const checkRole = require('../middleware/roleAuth');
const crypto = require('crypto');

/**
 * @helper Sanitize error message for production
 */
const handleError = (res, err, customMsg = "Server Error") => {
  console.error(`${customMsg}:`, err.message || err);
  return res.status(500).json({
    message: process.env.NODE_ENV === 'production' ? customMsg : `${customMsg}: ${err.message}`
  });
};

// Verify Vendor ID (Publicly accessible but sanitized)
router.get('/verify/:vendorId', [
  param('vendorId').trim().notEmpty().withMessage('Vendor ID is required').isAlphanumeric().withMessage('Invalid characters in Vendor ID').escape(),
  validate
], async (req, res) => {
  const { vendorId } = req.params;

  try {
    const result = await db.supabaseQuery(
      'SELECT vendor_id, shop_name as name, bw_price as price_per_page, color_price, phone, upi_id, pages_printed, platform_fee FROM vendors WHERE LOWER(TRIM(vendor_id)) = LOWER(TRIM($1))',
      [vendorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    handleError(res, err, "Vendor verification failed");
  }
});

// Get all vendors (Only accessible by ADMINS)
router.get('/all', [auth, checkRole(['admin'])], async (req, res) => {
  try {
    const result = await db.supabaseQuery('SELECT vendor_id, shop_name as name, bw_price as price_per_page, color_price, phone, upi_id, pages_printed, platform_fee FROM vendors ORDER BY shop_name ASC');
    res.json(result.rows);
  } catch (err) {
    handleError(res, err, "Fetching vendors failed");
  }
});

// Increment vendor stats after successful print (PROTECTED)
router.post('/increment-stats', [
  auth, // Require valid token
  body('vendorId').trim().notEmpty().withMessage('Vendor ID is required').escape(),
  body('pages').isInt({ min: 1 }).withMessage('Pages must be at least 1'),
  validate
], async (req, res) => {
  const { vendorId, pages } = req.body;

  try {
    const vendorRes = await db.supabaseQuery(
      'SELECT bw_price FROM vendors WHERE LOWER(vendor_id) = LOWER($1)',
      [vendorId]
    );

    if (vendorRes.rows.length === 0) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    const bwPrice = parseFloat(vendorRes.rows[0].bw_price) || 0;
    const feeIncrement = (pages * bwPrice * 0.10);

    await db.supabaseQuery(
      `UPDATE vendors 
       SET pages_printed = COALESCE(pages_printed, 0) + $1, 
           platform_fee = COALESCE(platform_fee, 0) + $2 
       WHERE LOWER(vendor_id) = LOWER($3)`,
      [pages, feeIncrement.toFixed(2), vendorId]
    );

    res.json({ message: "Stats updated successfully" });
  } catch (err) {
    handleError(res, err, "Updating stats failed");
  }
});

// Generate a secure Signed URL for a file (Download/View) (PROTECTED)
router.get('/files/:vendorId/:fileName', [
  auth,
  param('vendorId').trim().notEmpty().escape(),
  param('fileName').trim().notEmpty().escape(),
  validate
], async (req, res) => {
  const { vendorId, fileName } = req.params;

  try {
    const sanitizedVendorId = vendorId.trim().toLowerCase();
    const filePath = `${sanitizedVendorId}/${fileName}`;
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: filePath,
    });

    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 3600 });
    res.json({ signedUrl });
  } catch (err) {
    handleError(res, err, "Generating view URL failed");
  }
});

// Clear all existing files in a vendor's R2 folder (PROTECTED)
// This ensures each vendor has only ONE folder/batch of files at a time
router.post('/files/clear-vendor', [
  auth,
  body('vendorId').trim().notEmpty().matches(/^[a-zA-Z0-9_-]+$/).withMessage('Invalid Vendor ID format'),
  validate
], async (req, res) => {
  const { vendorId } = req.body;

  try {
    const bucketName = (process.env.R2_BUCKET_NAME || '').trim();
    if (!bucketName) throw new Error("R2_BUCKET_NAME is not configured");

    const sanitizedVendorId = vendorId.trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '');

    // Optimize: Instead of LISTing the R2 bucket (Class A), we query the database
    // This is much faster and cheaper as it avoids scanning the entire bucket folder.
    const result = await db.supabaseQuery(
      'SELECT id, object_key FROM uploaded_files WHERE LOWER(vendor_id) = LOWER($1) AND deleted_at IS NULL',
      [sanitizedVendorId]
    );

    const allFiles = result.rows;

    if (allFiles.length === 0) {
      return res.json({ message: "No existing files to clear", deleted: 0 });
    }

    // Delete in batches of 1000 (R2 limit)
    const keysToDelete = allFiles.map(file => ({ Key: file.object_key }));
    const idsToDelete = allFiles.map(file => file.id);

    for (let i = 0; i < keysToDelete.length; i += 1000) {
      const batch = keysToDelete.slice(i, i + 1000);
      await r2.send(new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: { Objects: batch },
      }));
    }

    // Mark as deleted in DB
    await db.supabaseQuery(
      'UPDATE uploaded_files SET deleted_at = NOW() WHERE id = ANY($1)',
      [idsToDelete]
    );

    console.log(`[R2] Cleared ${allFiles.length} files from DB metadata for vendor: ${sanitizedVendorId}`);
    res.json({ message: "Vendor folder cleared", deleted: allFiles.length });
  } catch (err) {
    console.error("Clear vendor files error:", err);
    handleError(res, err, "Clearing vendor files failed");
  }
});

// Generate a secure Pre-signed URL for UPLOAD (PROTECTED)
router.post('/files/upload-url', [
  auth,
  body('vendorId').trim().notEmpty().matches(/^[a-zA-Z0-9_-]+$/).withMessage('Invalid Vendor ID format'),
  body('fileName').trim().notEmpty().isLength({ max: 100 }).escape(),
  body('contentType').trim().notEmpty().isIn([
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
    'application/json'
  ]).withMessage('Unsupported file type'),
  body('totalPages').optional().isInt().withMessage('totalPages must be an integer'),
  body('totalAmount').optional().isFloat().withMessage('totalAmount must be a number'),
  validate
], async (req, res) => {
  const { vendorId, fileName, contentType, totalPages, totalAmount } = req.body;

  try {
    // 0. Get user's username - with fallback if query/column fails
    let username = `user${req.user.id}`;
    try {
      const userRes = await db.supabaseQuery('SELECT username FROM users WHERE id = $1', [req.user.id]);
      if (userRes.rows.length > 0 && userRes.rows[0].username) {
        username = userRes.rows[0].username;
      }
    } catch (e) {
      console.warn("Could not fetch username (likely column missing), using fallback:", e.message);
    }

    // 1. Create a placeholder in Orders table to get a unique order ID (SKIP FOR JSON PREFERENCES)
    const sanitizedVendorId = vendorId.trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '');
    let orderId = null;
    if (contentType !== 'application/json') {
      const orderRes = await db.supabaseQuery(
        'INSERT INTO orders (user_id, vendor_id, status) VALUES ($1, $2, $3) RETURNING id',
        [req.user.id, sanitizedVendorId, 'pending']
      );
      orderId = orderRes.rows[0].id;
    } else {
      // For JSON preferences, we generate a random temporary numeric ID if one isn't provided
      orderId = Date.now().toString().slice(-8);
    }

    // 2. Generate the filename as username + unique_order_id
    const extension = fileName.split('.').pop()?.toLowerCase() || 'unknown';
    const finalFileName = `${username}${orderId}.${extension}`;
    const filePath = `${sanitizedVendorId}/${finalFileName}`;

    // 3. Update the order with the final file name (SKIP FOR JSON)
    if (contentType !== 'application/json') {
      await db.supabaseQuery(
        'UPDATE orders SET file_name = $1 WHERE id = $2',
        [finalFileName, orderId]
      );
    }

    const bucketName = process.env.R2_BUCKET_NAME ? process.env.R2_BUCKET_NAME.trim() : '';
    if (!bucketName) {
      throw new Error("R2_BUCKET_NAME is missing on server");
    }

    // 4. Insert into uploaded_files for storage tracking (10 hour base retention)
    const deleteAfter = new Date(Date.now() + 10 * 60 * 60 * 1000);
    await db.supabaseQuery(
      `INSERT INTO uploaded_files (object_key, vendor_id, user_id, file_name, status, delete_after)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [filePath, sanitizedVendorId, req.user.id, finalFileName, 'uploaded', deleteAfter]
    );

    // 5. Removed Print Queue usage as per user request

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: filePath,
      ContentType: contentType, // Sign the content type
    });

    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 600 });
    res.json({ uploadUrl, filePath, bucket: bucketName, orderId, finalFileName });
  } catch (err) {
    console.error("R2 Upload URL Error Detail:", err);
    // Explicitly returning the actual error message to the frontend for diagnostics
    res.status(500).json({
      message: `Generating upload URL failed: ${err.message}`
    });
  }
});

// Get Print History for the current user (PROTECTED)
router.get('/files/history', auth, async (req, res) => {
  try {
    const historyRes = await db.supabaseQuery(
      `SELECT o.file_name, o.created_at as uploaded_at, o.status, f.deleted_at, v.shop_name
       FROM orders o
       LEFT JOIN uploaded_files f ON o.file_name = f.file_name
       LEFT JOIN vendors v ON LOWER(o.vendor_id) = LOWER(v.vendor_id)
       WHERE o.user_id = $1 AND o.file_name NOT LIKE '%.json'
       ORDER BY o.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    const mappedHistory = historyRes.rows.map(row => {
      // Logic for status mapping
      let displayStatus = 'in_queue';

      // Sync from orders table status column
      if (row.status === 'completed' || row.status === 'printed' || row.deleted_at) {
        displayStatus = 'completed';
      } else if (row.status === 'failed' || row.status === 'cancelled') {
        displayStatus = 'failed';
      } else if (row.status === 'pending') {
        displayStatus = 'in_queue';
      }

      // Format date/time
      const dt = new Date(row.uploaded_at);
      const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      const dateStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');

      return {
        fileName: row.file_name,
        time: timeStr,
        date: dateStr,
        status: displayStatus,
        vendorName: row.shop_name || "Unknown Vendor"
      };
    });

    res.json(mappedHistory);
  } catch (err) {
    handleError(res, err, "Fetching print history failed");
  }
});

// ============================================================================
// ELECTRON DASHBOARD COMPATIBILITY (LEGACY BRIDGE)
// ============================================================================

// 1. Vendor Login (Compatibility for Auth.tsx)
router.post('/login', async (req, res) => {
  const { vendor_id, password } = req.body;
  try {
    const result = await db.supabaseQuery(
      'SELECT * FROM vendors WHERE LOWER(vendor_id) = LOWER($1)',
      [vendor_id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: "Vendor not found" });
    }

    const vendor = result.rows[0];
    // In a production app, we'd use bcrypt here. 
    // Matching the Java backend's logic which might still be using plaintext or a specific hash.
    if (vendor.password !== password) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Reuse the user JWT secret for simplicity if needed, or vendor-specific token
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ id: vendor.id, vendor_id: vendor.vendor_id, role: 'vendor' }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      vendor_id: vendor.vendor_id,
      message: "Login successful"
    });
  } catch (err) {
    handleError(res, err, "Vendor login failed");
  }
});

// 2. Vendor Registration
router.post('/register', async (req, res) => {
  const data = req.body;
  try {
    const query = `
      INSERT INTO vendors (vendor_id, password, full_name, shop_name, phone, upi_id, address, bw_price, color_price, paper_sizes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`;
    
    const values = [
      data.vendor_id, data.password, data.full_name, data.shop_name, 
      data.phone, data.upi_id, data.address, data.bw_price, 
      data.color_price, data.paper_sizes
    ];

    const result = await db.supabaseQuery(query, values);
    const vendor = result.rows[0];

    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ id: vendor.id, vendor_id: vendor.vendor_id, role: 'vendor' }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      token,
      vendor_id: vendor.vendor_id,
      message: "Account initialized successfully"
    });
  } catch (err) {
    handleError(res, err, "Vendor registration failed");
  }
});

// 3. List Queue (replaces /api/r2/files)
router.get('/files', async (req, res) => {
  const vendorId = req.query.vendor_id;
  if (!vendorId) return res.status(400).json({ message: "vendor_id is required" });

  try {
    // List pending/in-progress orders specifically for the dashboard
    // Joins with users to get the sender_name
    const result = await db.supabaseQuery(`
      SELECT 
        o.id, 
        o.file_name, 
        o.status, 
        o.created_at,
        u.full_name as sender_name,
        f.object_key as file_key
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN uploaded_files f ON o.file_name = f.file_name
      WHERE LOWER(o.vendor_id) = LOWER($1) 
        AND o.status NOT IN ('completed', 'cancelled', 'printed', 'rejected')
        AND o.file_name NOT LIKE '%.xml'
      ORDER BY o.created_at DESC`, 
      [vendorId]
    );

    res.json({ files: result.rows });
  } catch (err) {
    handleError(res, err, "Fetching vendor queue failed");
  }
});

// 4. Download (replaces /api/r2/download)
router.post('/download', async (req, res) => {
  const { file_key, id } = req.body;
  if (!file_key) return res.status(400).json({ message: "file_key is required" });

  try {
    // Check if key is already full path (vendor/file) or just file
    const bucketName = process.env.R2_BUCKET_NAME;
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: file_key,
    });

    const downloadUrl = await getSignedUrl(r2, command, { expiresIn: 3600 });
    res.json({ downloadUrl, status: 'success' });
  } catch (err) {
    handleError(res, err, "Generating download URL failed");
  }
});

// 5. Printed (replaces /api/r2/printed)
router.post('/printed-legacy', async (req, res) => {
  const { id } = req.body;
  try {
    await db.supabaseQuery("UPDATE orders SET status = 'printed' WHERE id = $1", [id]);
    res.json({ message: "Status updated to Printed", status: "success" });
  } catch (err) {
    handleError(res, err, "Marking printed failed");
  }
});

// 6. Delete/Cancel Order (replaces /api/r2/delete)
router.post('/delete', async (req, res) => {
  const { id } = req.body;
  try {
    // We mark as cancelled in orders table instead of deleting metadata if possible, 
    // or we delete it completely if preferred.
    await db.supabaseQuery("UPDATE orders SET status = 'cancelled' WHERE id = $1", [id]);
    res.json({ message: "Order cancelled and removed", status: "success" });
  } catch (err) {
    handleError(res, err, "Order cancellation failed");
  }
});

module.exports = router;
