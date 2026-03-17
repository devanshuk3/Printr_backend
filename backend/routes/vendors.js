const express = require('express');
const router = express.Router();
const db = require('../db');
const r2 = require('../r2');
const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { param, body } = require('express-validator');
const { validate } = require('../middleware/validator');
const auth = require('../middleware/auth');
const checkRole = require('../middleware/roleAuth');

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
      'SELECT bw_price FROM vendors WHERE vendor_id = $1',
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
       WHERE vendor_id = $3`,
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
    const filePath = `${vendorId}/${fileName}`;
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

    // Strict sanitization
    const sanitizedVendorId = vendorId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    const extension = fileName.split('.').pop();
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    const filePath = `${sanitizedVendorId}/${Date.now()}_${cleanFileName}.${extension}`;

    const bucketName = process.env.R2_BUCKET_NAME ? process.env.R2_BUCKET_NAME.trim() : '';
    if (!bucketName) {
      throw new Error("R2_BUCKET_NAME is missing on server");
    }

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: filePath,
      ContentType: 'application/octet-stream', // Hardcoded for signature stability
    });

    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 600 });
    res.json({ uploadUrl, filePath, bucket: bucketName });
  } catch (err) {
    console.error("R2 Upload URL Error Detail:", err);
    handleError(res, err, "Generating upload URL failed");
  }
});

module.exports = router;
