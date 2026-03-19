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
    const prefix = `${sanitizedVendorId}/`;

    // List all objects under this vendor's prefix
    let continuationToken = undefined;
    const allKeys = [];

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      });

      const listed = await r2.send(listCommand);

      if (listed.Contents && listed.Contents.length > 0) {
        allKeys.push(...listed.Contents.map(obj => ({ Key: obj.Key })));
      }

      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);

    if (allKeys.length === 0) {
      return res.json({ message: "No existing files to clear", deleted: 0 });
    }

    // Delete in batches of 1000 (R2 limit)
    for (let i = 0; i < allKeys.length; i += 1000) {
      const batch = allKeys.slice(i, i + 1000);
      await r2.send(new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: { Objects: batch },
      }));
    }

    console.log(`[R2] Cleared ${allKeys.length} old files for vendor: ${sanitizedVendorId}`);
    res.json({ message: "Vendor folder cleared", deleted: allKeys.length });
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
    'application/octet-stream'
  ]).withMessage('Unsupported file type'),
  validate
], async (req, res) => {
  const { vendorId, fileName, contentType } = req.body;

  try {
    if (!process.env.R2_BUCKET_NAME) {
      throw new Error("R2_BUCKET_NAME is not defined in environment variables");
    }

    // Strict sanitization - folder names are always lowercase for case-insensitivity
    const sanitizedVendorId = vendorId.trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '');
    const extension = fileName.split('.').pop()?.toLowerCase() || 'unknown';
    // Preserve the fileName provided (which now contains username_orderid)
    const cleanFileName = fileName.split('.').slice(0, -1).join('.').replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
    
    // Ensure uniqueness while respecting the requested naming convention
    const uniqueId = crypto.randomUUID().substring(0, 8); // Shorter suffix for cleaner names
    const filePath = `${sanitizedVendorId}/${cleanFileName}_${uniqueId}.${extension}`;

    const bucketName = process.env.R2_BUCKET_NAME ? process.env.R2_BUCKET_NAME.trim() : '';
    if (!bucketName) {
      throw new Error("R2_BUCKET_NAME is missing on server");
    }

    // Insert record into database before uploading
    // Default retention: 2 hours
    const deleteAfter = new Date(Date.now() + 2 * 60 * 60 * 1000);

    await db.supabaseQuery(
      `INSERT INTO uploaded_files (object_key, vendor_id, user_id, file_name, status, delete_after)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [filePath, sanitizedVendorId, req.user.id, fileName, 'uploaded', deleteAfter]
    );

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: filePath,
      ChecksumAlgorithm: undefined,
    });

    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 600 });
    res.json({ uploadUrl, filePath, bucket: bucketName });
  } catch (err) {
    console.error("R2 Upload URL Error Detail:", err);
    handleError(res, err, "Generating upload URL failed");
  }
});

// Get Print History for the current user (PROTECTED)
router.get('/files/history', auth, async (req, res) => {
  try {
    const historyRes = await db.supabaseQuery(
      `SELECT f.file_name, f.uploaded_at, f.status, f.deleted_at, v.shop_name
       FROM uploaded_files f
       LEFT JOIN vendors v ON LOWER(f.vendor_id) = LOWER(v.vendor_id)
       WHERE f.user_id = $1
       ORDER BY f.uploaded_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    const mappedHistory = historyRes.rows.map(row => {
      // Logic for status mapping
      let displayStatus = 'in_queue'; 
      if (row.status === 'printed' || row.deleted_at) {
        displayStatus = 'completed';
      } else if (row.status === 'failed') {
        displayStatus = 'failed';
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

module.exports = router;
