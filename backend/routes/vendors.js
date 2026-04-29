const express = require('express');
const router = express.Router();
const db = require('../db');
const r2 = require('../r2');
const { GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const auth = require('../middleware/auth');
const checkRole = require('../middleware/roleAuth');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { generalLimiter, uploadLimiter, queueLimiter, authLimiter, sensitiveLimiter, destructiveLimiter, downloadLimiter } = require('../middleware/rateLimiter');
const handleError = require('../utils/errorHandler');
const { validateBody, validateParams, validateQuery } = require('../middleware/validator');
const {
  vendorLoginSchema, vendorRegisterSchema, vendorSettingsSchema,
  uploadUrlSchema, orderBatchSchema, patchOrderSchema,
  incrementStatsSchema, updateOrderStatusSchema, clearVendorSchema,
  downloadSchema, printedLegacySchema, deleteOrderSchema,
  vendorIdParamSchema, fileParamsSchema, orderIdParamSchema,
  queueQuerySchema, downloadQuerySchema,
} = require('../middleware/schemas');
const { checkVendorLockout, recordVendorFailedAttempt, resetVendorFailedAttempts } = require('../utils/lockout');


// ── Application-Level Queue Caching (Limits DB requests on dashboard polling) ──
const queueCache = new Map(); // key: vendor_id, value: { data: [], total: number, timestamp: number }
const totalCountCache = new Map(); // key: vendor_id, value: { count: number, timestamp: number }

router.use(generalLimiter);

const invalidateCache = (vendorId) => {
  if (!vendorId) return;
  const key = vendorId.toLowerCase().trim();
  queueCache.delete(key);
  totalCountCache.delete(key);
  console.log(`[Cache] Invalidated queue for vendor: ${vendorId}`);
};

/**
 * @helper Log order status transitions for debugging and analytics
 */
const logStatusChange = (orderId, fromStatus, toStatus) => {
  const timestamp = new Date().toISOString();
  console.log(`[OrderLog] Order:${orderId} | ${fromStatus} -> ${toStatus} | ${timestamp}`);
};



/**
 * @endpoint Initialize a batch of orders before payment/upload
 */
router.post('/orders/batch', [auth, uploadLimiter, validateBody(orderBatchSchema)], async (req, res) => {
  const { vendorId, files } = req.body;

  try {
    const sanitizedVendorId = vendorId.trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '');
    const orderIds = [];
    
    for (const file of files) {
      const orderRes = await db.query(
        'INSERT INTO orders (user_id, vendor_id, status, page_count, total_amount, is_color) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [req.user.id, sanitizedVendorId, 'uploading', file.pageCount || 1, file.totalAmount || 0, file.isColor || false]
      );
      const id = orderRes.rows[0].id;
      logStatusChange(id, 'none', 'uploading');
      orderIds.push(id);
    }
    
    res.json({ orderIds });
  } catch (err) {
    handleError(res, err, "Failed to initiate order batch");
  }
});

// Verify Vendor ID (Publicly accessible but sanitized)
router.get('/verify/:vendorId', [
  validateParams(vendorIdParamSchema),
], async (req, res) => {
  const { vendorId } = req.params;

  try {
    const result = await db.query(
      'SELECT vendor_id, shop_name as name, bw_price as price_per_page, color_price, phone, upi_id, pages_printed, platform_fee, has_bw_printer, has_color_printer FROM vendors WHERE LOWER(TRIM(vendor_id)) = LOWER(TRIM($1))',
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
    const result = await db.query('SELECT vendor_id, shop_name as name, bw_price as price_per_page, color_price, phone, upi_id, pages_printed, platform_fee, has_bw_printer, has_color_printer FROM vendors ORDER BY shop_name ASC');
    res.json(result.rows);
  } catch (err) {
    handleError(res, err, "Fetching vendors failed");
  }
});

// Increment vendor stats after successful print (PROTECTED)
router.post('/increment-stats', [
  auth,
  validateBody(incrementStatsSchema),
], async (req, res) => {
  const { vendorId, pages, totalAmount } = req.body;

  try {
    // Platform fee: 8% of the total order amount
    const PLATFORM_FEE_PERCENT = 0.08;
    let feeIncrement = 0;

    if (totalAmount && totalAmount > 0) {
      // Use the backend-calculated totalAmount for accurate fee
      feeIncrement = totalAmount * PLATFORM_FEE_PERCENT;
    } else {
      // Fallback: estimate from pages * bw_price
      const vendorRes = await db.query(
        'SELECT bw_price FROM vendors WHERE LOWER(vendor_id) = LOWER($1)',
        [vendorId]
      );
      if (vendorRes.rows.length > 0) {
        const bwPrice = parseFloat(vendorRes.rows[0].bw_price) || 0;
        feeIncrement = pages * bwPrice * PLATFORM_FEE_PERCENT;
      }
    }

    await db.query(
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
  downloadLimiter,
  validateParams(fileParamsSchema),
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
  destructiveLimiter,
  validateBody(clearVendorSchema),
], async (req, res) => {
  const { vendorId } = req.body;

  try {
    const bucketName = (process.env.R2_BUCKET_NAME || '').trim();
    if (!bucketName) throw new Error("R2_BUCKET_NAME is not configured");

    const sanitizedVendorId = vendorId.trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '');

    // Optimize: Instead of LISTing the R2 bucket (Class A), we query the database
    // This is much faster and cheaper as it avoids scanning the entire bucket folder.
    const result = await db.query(
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
    await db.query(
      'UPDATE uploaded_files SET deleted_at = NOW() WHERE id = ANY($1)',
      [idsToDelete]
    );

    console.log(`[R2] Cleared ${allFiles.length} files from DB metadata for vendor: ${sanitizedVendorId}`);
    invalidateCache(vendorId);
    res.json({ message: "Vendor folder cleared", deleted: allFiles.length });
  } catch (err) {
    console.error("Clear vendor files error:", err);
    handleError(res, err, "Clearing vendor files failed");
  }
});

// Generate a secure Pre-signed URL for UPLOAD (PROTECTED)
router.post('/files/upload-url', [
  auth,
  uploadLimiter,
  validateBody(uploadUrlSchema),
], async (req, res) => {
  const { vendorId, fileName, contentType, totalPages, totalAmount, isColor, pageCount, orderId: existingOrderId } = req.body;

  try {
    // 0. Get user's username - with fallback if query/column fails
    let username = `user${req.user.id}`;
    try {
      const userRes = await db.query('SELECT username FROM users WHERE id = $1', [req.user.id]);
      if (userRes.rows.length > 0 && userRes.rows[0].username) {
        username = userRes.rows[0].username;
      }
    } catch (e) {
      console.warn("Could not fetch username (likely column missing), using fallback:", e.message);
    }

    // 1. Get or create a placeholder in Orders table
    const sanitizedVendorId = vendorId.trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '');
    let orderId = existingOrderId;
    
    if (orderId && contentType !== 'application/json') {
      // Verify the existing order matches the user
      const check = await db.query('SELECT id FROM orders WHERE id = $1 AND user_id = $2', [orderId, req.user.id]);
      if (check.rows.length === 0) {
        return res.status(403).json({ message: "Invalid orderId provided" });
      }
    } else if (contentType !== 'application/json') {
      const orderRes = await db.query(
        'INSERT INTO orders (user_id, vendor_id, status, page_count, total_amount, is_color) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [req.user.id, sanitizedVendorId, 'uploading', pageCount || 1, totalAmount || 0, isColor || false]
      );
      orderId = orderRes.rows[0].id;
      logStatusChange(orderId, 'none', 'uploading');
    } else {
      // For JSON preferences, we generate a random temporary numeric ID if one isn't provided
      orderId = existingOrderId || Date.now().toString().slice(-8);
    }

    // 2. Generate the filename as username + unique_order_id
    const extension = fileName.split('.').pop()?.toLowerCase() || 'unknown';
    const finalFileName = `${username}${orderId}.${extension}`;
    const filePath = `${sanitizedVendorId}/${finalFileName}`;

    // 3. Update the order with the final file name (SKIP FOR JSON)
    if (contentType !== 'application/json') {
      await db.query(
        'UPDATE orders SET file_name = $1 WHERE id = $2',
        [finalFileName, orderId]
      );
    }

    const bucketName = process.env.R2_BUCKET_NAME ? process.env.R2_BUCKET_NAME.trim() : '';
    if (!bucketName) {
      throw new Error("R2_BUCKET_NAME is missing on server");
    }

    // 4. Insert into uploaded_files for storage tracking (1 hour retention)
    const deleteAfter = new Date(Date.now() + 1 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO uploaded_files (object_key, vendor_id, user_id, file_name, status, delete_after)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [filePath, sanitizedVendorId, req.user.id, finalFileName, 'uploaded', deleteAfter]
    );

    // 5. Removed Print Queue usage as per user request

    // Cache invalidation moved to confirm-upload instead of on URL generation
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: filePath,
      ContentType: contentType, // Sign the content type
    });

    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 300 }); // 5 minutes is plenty to start an upload
    res.json({ uploadUrl, filePath, bucket: bucketName, orderId, finalFileName });
  } catch (err) {
    console.error("R2 Upload URL Error Detail:", err);
    // Explicitly returning the actual error message to the frontend for diagnostics - UPDATED to user friendly
    res.status(500).json({
      message: `We're having trouble setting up your upload. Please try again.`
    });
  }
});

// Confirm that an upload was completely successful
router.post('/orders/:id/confirm-upload', [auth, uploadLimiter], async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Get order details to check file
    const orderCheck = await db.query(
      'SELECT vendor_id, file_name, status FROM orders WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    const { vendor_id, file_name, status } = orderCheck.rows[0];

    // Idempotency check: If already confirmed as pending, return success immediately
    if (status === 'pending') {
      return res.json({ success: true, message: "Order already confirmed" });
    }

    if (status !== 'uploading') {
      return res.status(400).json({ message: `Order cannot be confirmed from its current status: ${status}` });
    }

    const sanitizedVendorId = vendor_id.toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '');
    const objectKey = `${sanitizedVendorId}/${file_name}`;
    const bucketName = process.env.R2_BUCKET_NAME ? process.env.R2_BUCKET_NAME.trim() : '';

    // 2. Server-side verification: Check if file actually exists in R2
    try {
      const headData = await r2.send(new HeadObjectCommand({ Bucket: bucketName, Key: objectKey }));
      
      // Verification: Prevent massive file uploads (e.g., > 70MB) from being finalized
      if (headData.ContentLength && headData.ContentLength > 70 * 1024 * 1024) {
          return res.status(400).json({ message: "File is too large for printing (Max 70MB)" });
      }
    } catch (headErr) {
      console.warn("Confirm upload failed: file not found in R2 for key:", objectKey);
      return res.status(400).json({ message: "File upload could not be verified on the server." });
    }

    // 3. Update status
    const result = await db.query(`
      UPDATE orders SET status = 'pending', updated_at = NOW() 
      WHERE id = $1
      RETURNING vendor_id
    `, [id]);

    logStatusChange(id, status, 'pending');

    invalidateCache(result.rows[0].vendor_id);
    res.json({ success: true, message: "Order confirmed successfully" });
  } catch (err) {
    handleError(res, err, "Confirming order upload failed");
  }
});

// Get Print History for the current user (PROTECTED)
router.get('/files/history', auth, async (req, res) => {
  try {
    const historyRes = await db.query(
      `SELECT * FROM (
         SELECT o.file_name, o.created_at as uploaded_at, o.status, f.deleted_at, v.shop_name
         FROM orders o
         LEFT JOIN uploaded_files f ON o.file_name = f.file_name
         LEFT JOIN vendors v ON LOWER(o.vendor_id) = LOWER(v.vendor_id)
         WHERE o.user_id = $1 AND o.file_name NOT LIKE '%.json' AND o.status != 'uploading'
         
         UNION ALL
         
         SELECT a.file_name, a.created_at as uploaded_at, a.status, f.deleted_at, v.shop_name
         FROM archived_orders a
         LEFT JOIN uploaded_files f ON a.file_name = f.file_name
         LEFT JOIN vendors v ON LOWER(a.vendor_id) = LOWER(v.vendor_id)
         WHERE a.user_id = $1 AND a.file_name NOT LIKE '%.json' AND a.status != 'uploading'
       ) as combined_history
       ORDER BY uploaded_at DESC
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
router.post('/login', [
  authLimiter,
  validateBody(vendorLoginSchema),
], async (req, res) => {
  const { vendor_id, password } = req.body;
  
  try {
    // ── Account lockout check ──
    const lockoutStatus = await checkVendorLockout(vendor_id);
    if (lockoutStatus.locked) {
      return res.status(423).json({ success: false, message: lockoutStatus.message });
    }

    const result = await db.query(
      'SELECT * FROM vendors WHERE LOWER(vendor_id) = LOWER($1)',
      [vendor_id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const vendor = result.rows[0];
    if (!vendor.password) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }
    const isMatch = await bcrypt.compare(password, vendor.password);
    if (!isMatch) {
      // ── Record failed attempt & potentially lock ──
      await recordVendorFailedAttempt(vendor_id);
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // ── Reset failed attempts on success ──
    await resetVendorFailedAttempts(vendor_id);

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
router.post('/register', [
  authLimiter,
  validateBody(vendorRegisterSchema),
], async (req, res) => {
  const data = req.body;

  try {
    // Check if vendor already exists
    const checkExist = await db.query(
      'SELECT id FROM vendors WHERE LOWER(vendor_id) = LOWER($1)',
      [data.vendor_id]
    );

    if (checkExist.rows.length > 0) {
      return res.status(409).json({ success: false, message: "Vendor ID already registered" });
    }

    // Some existing production DBs still have a NOT NULL `vendors.name` column.
    // Populate it with `shop_name` if the column exists.
    const hasNameColumnRes = await db.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'name' LIMIT 1"
    );
    const hasNameColumn = hasNameColumnRes.rows.length > 0;

    // Hash password first
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(data.password, salt);

    let query;
    let values;
    if (hasNameColumn) {
      query = `
        INSERT INTO vendors (
          vendor_id, password, full_name, shop_name, name, phone, upi_id, address,
          bw_price, color_price, paper_sizes, has_bw_printer, has_color_printer
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`;

      values = [
        data.vendor_id,
        hashedPassword,
        data.full_name,
        data.shop_name,
        data.shop_name, // `name` legacy column
        data.phone,
        data.upi_id,
        data.address,
        data.bw_price || 0,
        data.color_price || 0,
        data.paper_sizes,
        data.has_bw_printer ?? true,
        data.has_color_printer ?? false,
      ];
    } else {
      query = `
        INSERT INTO vendors (
          vendor_id, password, full_name, shop_name, phone, upi_id, address,
          bw_price, color_price, paper_sizes, has_bw_printer, has_color_printer
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`;

      values = [
        data.vendor_id,
        hashedPassword,
        data.full_name,
        data.shop_name,
        data.phone,
        data.upi_id,
        data.address,
        data.bw_price || 0,
        data.color_price || 0,
        data.paper_sizes,
        data.has_bw_printer ?? true,
        data.has_color_printer ?? false,
      ];
    }

    const result = await db.query(query, values);
    const vendor = result.rows[0];

    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: vendor.id, vendor_id: vendor.vendor_id, role: 'vendor' }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      token,
      vendor_id: vendor.vendor_id,
      message: "Account initialized successfully"
    });
  } catch (err) {
    console.error("[VendorRegister] Error:", err);
    // Return a little more diagnostics so the frontend can show the real cause.
    // (Safe because this is only used to debug vendor registration failures.)
    res.status(500).json({
      message: "Vendor registration failed (diagnostics)",
      code: err?.code,
      detail: err?.message,
    });
  }
});

// 3. List Queue (replaces /api/r2/files) (PROTECTED)
router.get('/files', [auth, queueLimiter, validateQuery(queueQuerySchema)], async (req, res) => {
  const vendorId = req.query.vendor_id;

  // Verify the authenticated vendor can only access their own queue
  const authVendorId = req.user.vendor_id;
  if (authVendorId && authVendorId.toLowerCase() !== vendorId.toString().toLowerCase().trim()) {
    return res.status(403).json({ message: "Access denied: You can only view your own queue" });
  }

  try {
    const sanitizedVendorId = vendorId.toLowerCase().trim();
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const cursor = req.query.cursor; // Timestamp for cursor-based pagination
    
    // Check Cache First (30 second buffer) - Only for first page without cursor
    if (offset === 0 && !cursor && limit === 20) {
      const cached = queueCache.get(sanitizedVendorId);
      if (cached && (Date.now() - cached.timestamp < 30000)) { // 30s TTL
          return res.json({ files: cached.data, total: cached.total, limit, offset });
      }
    }

    // Fetch Total Count for pagination (Cached for 20s to optimize scale)
    let totalCount;
    const countCached = totalCountCache.get(sanitizedVendorId);
    if (countCached && (Date.now() - countCached.timestamp < 20000)) {
        totalCount = countCached.count;
    } else {
        const countRes = await db.query(`
          SELECT COUNT(*) FROM orders 
          WHERE LOWER(vendor_id) = LOWER($1) 
          AND status NOT IN ('completed', 'rejected', 'uploading', 'failed')
        `, [sanitizedVendorId]);
        totalCount = parseInt(countRes.rows[0].count);
        totalCountCache.set(sanitizedVendorId, { count: totalCount, timestamp: Date.now() });
    }

    // Fetch from Database
    const result = await db.query(`
      SELECT 
        o.id, 
        o.file_name, 
        o.status, 
        o.created_at,
        o.page_count,
        o.is_color,
        o.total_amount,
        u.full_name as sender_name,
        f.object_key as file_key
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN uploaded_files f ON o.file_name = f.file_name
      WHERE LOWER(o.vendor_id) = LOWER($1) 
        AND o.status NOT IN ('completed', 'rejected', 'uploading', 'failed')
        AND o.file_name NOT LIKE '%.xml'
        ${cursor ? 'AND o.created_at < $4' : ''}
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3`,
      cursor ? [sanitizedVendorId, limit, offset, cursor] : [sanitizedVendorId, limit, offset]
    );

    // Save to Cache ONLY for first page
    if (offset === 0 && !cursor && limit === 20) {
      queueCache.set(sanitizedVendorId, { data: result.rows, total: totalCount, timestamp: Date.now() });
    }
    
    const lastItem = result.rows[result.rows.length - 1];
    const nextCursor = lastItem ? lastItem.created_at : null;

    res.json({ 
      files: result.rows,
      total: totalCount,
      limit,
      offset,
      nextCursor,
      hasMore: (offset + result.rows.length < totalCount)
    });
  } catch (err) {
    handleError(res, err, "Fetching vendor queue failed");
  }
});

// 4. Download (replaces /api/r2/download) (PROTECTED)
router.post('/download', [auth, downloadLimiter, validateBody(downloadSchema)], async (req, res) => {
  const { file_key, id } = req.body;

  try {
    // Verify that the file belongs to the authenticated vendor's folder
    const authVendorId = req.user.vendor_id;
    if (authVendorId) {
      const keyPrefix = file_key.split('/')[0];
      if (keyPrefix.toLowerCase() !== authVendorId.toLowerCase()) {
        return res.status(403).json({ message: "Access denied: This file does not belong to your account" });
      }
    }

    const bucketName = (process.env.R2_BUCKET_NAME || '').trim();
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

// GET version for compatibility with frontend preference fetching
router.get('/download', [auth, downloadLimiter, validateQuery(downloadQuerySchema)], async (req, res) => {
  const file_key = req.query.key;

  try {
    const authVendorId = req.user.vendor_id;
    if (authVendorId) {
      const keyPrefix = file_key.split('/')[0];
      if (keyPrefix.toLowerCase() !== authVendorId.toLowerCase()) {
        return res.status(403).json({ message: "Access denied: This file does not belong to your account" });
      }
    }

    const bucketName = (process.env.R2_BUCKET_NAME || '').trim();
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

// 5. Printed (replaces /api/r2/printed) (PROTECTED)
router.post('/printed-legacy', [auth, sensitiveLimiter, validateBody(printedLegacySchema)], async (req, res) => {
  const { id } = req.body;
  try {
    // Verify the order belongs to this vendor before updating
    const authVendorId = req.user.vendor_id;
    const checkRes = await db.query("SELECT vendor_id FROM orders WHERE id = $1", [id]);
    
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (authVendorId && checkRes.rows[0].vendor_id.toLowerCase() !== authVendorId.toLowerCase()) {
      return res.status(403).json({ message: "Access denied: This order does not belong to your account" });
    }

    const oldStatus = checkRes.rows[0].status;
    await db.query("UPDATE orders SET status = 'printed', updated_at = NOW() WHERE id = $1", [id]);
    
    // Also update uploaded_files status to sync with cleanup policy
    await db.query(`
      UPDATE uploaded_files 
      SET status = 'printed' 
      WHERE file_name = (SELECT file_name FROM orders WHERE id = $1)
    `, [id]);

    logStatusChange(id, oldStatus, 'printed');
    invalidateCache(checkRes.rows[0].vendor_id);

    res.json({ message: "Status updated to Printed", status: "success" });
  } catch (err) {
    handleError(res, err, "Marking printed failed");
  }
});

// 6. Delete/Cancel Order (replaces /api/r2/delete) (PROTECTED)
router.post('/delete', [auth, destructiveLimiter, validateBody(deleteOrderSchema)], async (req, res) => {
  const { id } = req.body;
  try {
    // Verify the order belongs to this vendor before cancelling
    const authVendorId = req.user.vendor_id;
    const checkRes = await db.query("SELECT * FROM orders WHERE id = $1", [id]);
    
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    const orderData = checkRes.rows[0];

    if (authVendorId && orderData.vendor_id.toLowerCase() !== authVendorId.toLowerCase()) {
      return res.status(403).json({ message: "Access denied: This order does not belong to your account" });
    }

    // Just change status so the order stays in queue for an hour (cleanup handles archiving later)
    await db.query("UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1", [id]);
    
    // Also update uploaded_files status to sync with cleanup policy
    await db.query(`
      UPDATE uploaded_files 
      SET status = 'cancelled' 
      WHERE file_name = (SELECT file_name FROM orders WHERE id = $1)
    `, [id]);

    logStatusChange(id, orderData.status, 'cancelled (stays in queue for 1h)');

    invalidateCache(orderData.vendor_id);

    res.json({ message: "Order cancelled and archived", status: "success" });
  } catch (err) {
    handleError(res, err, "Order cancellation failed");
  }
});

// 8. Patch Order metadata (e.g. update price/color mode after final checkout)
router.patch('/orders/:id', [
  auth,
  sensitiveLimiter,
  validateParams(orderIdParamSchema),
  validateBody(patchOrderSchema)
], async (req, res) => {
  const { id } = req.params;
  const { total_amount, is_color, page_count } = req.body;
  
  try {
    const updates = [];
    const values = [];
    let paramCounter = 1;
    
    if (total_amount !== undefined) {
      updates.push(`total_amount = $${paramCounter++}`);
      values.push(total_amount);
    }
    if (is_color !== undefined) {
      updates.push(`is_color = $${paramCounter++}`);
      values.push(is_color);
    }
    if (page_count !== undefined) {
      updates.push(`page_count = $${paramCounter++}`);
      values.push(page_count);
    }
    
    if (updates.length === 0) return res.status(400).json({ message: "No fields to update" });
    
    values.push(id);
    const query = `UPDATE orders SET ${updates.join(', ')} WHERE id = $${paramCounter}`;
    
    await db.query(query, values);
    res.json({ success: true, message: "Order updated successfully" });
  } catch (err) {
    handleError(res, err, "Updating order details failed");
  }
});

// 7. Update Vendor Settings (PROTECTED)
router.put('/settings', [
  auth,
  sensitiveLimiter,
  validateBody(vendorSettingsSchema),
], async (req, res) => {
  const { 
    shop_name, bw_price, color_price, upi_id, 
    auto_accept_jobs, enable_upi, min_amount,
    has_bw_printer, has_color_printer, bw_printer, color_printer
  } = req.body;

  const vendorIdFromAuth = req.user.vendor_id;

  try {
    // Dynamically build update query
    const updates = [];
    const values = [];
    let paramCounter = 1;

    if (shop_name !== undefined) {
      updates.push(`shop_name = $${paramCounter++}`);
      values.push(shop_name);
    }
    if (bw_price !== undefined) {
      updates.push(`bw_price = $${paramCounter++}`);
      values.push(bw_price);
    }
    if (color_price !== undefined) {
      updates.push(`color_price = $${paramCounter++}`);
      values.push(color_price);
    }
    if (upi_id !== undefined) {
      updates.push(`upi_id = $${paramCounter++}`);
      values.push(upi_id);
    }
    if (auto_accept_jobs !== undefined) {
      updates.push(`auto_accept_jobs = $${paramCounter++}`);
      values.push(auto_accept_jobs);
    }
    if (enable_upi !== undefined) {
      updates.push(`enable_upi = $${paramCounter++}`);
      values.push(enable_upi);
    }
    if (min_amount !== undefined) {
      updates.push(`min_amount = $${paramCounter++}`);
      values.push(min_amount);
    }
    if (has_bw_printer !== undefined) {
      updates.push(`has_bw_printer = $${paramCounter++}`);
      values.push(has_bw_printer);
    }
    if (has_color_printer !== undefined) {
      updates.push(`has_color_printer = $${paramCounter++}`);
      values.push(has_color_printer);
    }
    if (req.body.bw_printer !== undefined) {
      updates.push(`bw_printer = $${paramCounter++}`);
      values.push(req.body.bw_printer);
    }
    if (req.body.color_printer !== undefined) {
      updates.push(`color_printer = $${paramCounter++}`);
      values.push(req.body.color_printer);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No settings provided to update" });
    }

    values.push(vendorIdFromAuth);
    const query = `
      UPDATE vendors 
      SET ${updates.join(', ')} 
      WHERE LOWER(vendor_id) = LOWER($${paramCounter})
      RETURNING *`;

    const result = await db.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    res.json({ 
      success: true, 
      message: "Settings updated successfully",
      settings: result.rows[0]
    });
  } catch (err) {
    handleError(res, err, "Updating settings failed");
  }
});

// 8. Get current vendor settings (PROTECTED)
router.get('/settings/me', auth, async (req, res) => {
  const vendorIdFromAuth = req.user.vendor_id;
  try {
    const result = await db.query(
      'SELECT shop_name, bw_price, color_price, upi_id, auto_accept_jobs, enable_upi, min_amount, has_bw_printer, has_color_printer, bw_printer, color_printer FROM vendors WHERE LOWER(vendor_id) = LOWER($1)',
      [vendorIdFromAuth]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    handleError(res, err, "Fetching vendor settings failed");
  }
});

// 9. Get Vendor Activity Log (RECENT COMPLETED/CANCELLED ORDERS)
router.get('/activity-log', auth, async (req, res) => {
  const vendorIdFromAuth = req.user.vendor_id;
  try {
    const result = await db.query(`
      SELECT * FROM (
        SELECT 
          o.id, 
          o.status, 
          o.created_at,
          u.full_name as customer_name
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE LOWER(o.vendor_id) = LOWER($1) 
          AND o.status IN ('completed', 'cancelled', 'printed', 'rejected')
          
        UNION ALL
        
        SELECT 
          a.original_id as id, 
          a.status, 
          a.created_at,
          u.full_name as customer_name
        FROM archived_orders a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE LOWER(a.vendor_id) = LOWER($1) 
          AND a.status IN ('completed', 'cancelled', 'printed', 'rejected')
      ) as combined_activity
      ORDER BY created_at DESC
      LIMIT 20`,
      [vendorIdFromAuth]
    );

    res.json(result.rows);
  } catch (err) {
    handleError(res, err, "Fetching activity log failed");
  }
});

// 10. Update Order Status (Verify/Reject)
router.post('/update-order-status', [
  auth,
  validateBody(updateOrderStatusSchema),
], async (req, res) => {
  const { orderId, status } = req.body;
  const vendorIdFromAuth = req.user.vendor_id;

  try {
    // Ensure the order belongs to this vendor
    const checkRes = await db.query(
      'SELECT vendor_id, status FROM orders WHERE id = $1',
      [orderId]
    );

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (checkRes.rows[0].vendor_id.toLowerCase() !== vendorIdFromAuth.toLowerCase()) {
      return res.status(403).json({ message: "Access denied to this order" });
    }

    const oldStatus = checkRes.rows[0].status;
    if (oldStatus === status) {
      return res.json({ success: true, message: `Order already marked as ${status}` });
    }
    
    await db.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, orderId]
    );

    await db.query(`
      UPDATE uploaded_files 
      SET status = $1 
      WHERE file_name = (SELECT file_name FROM orders WHERE id = $2)
    `, [status, orderId]);
    
    logStatusChange(orderId, oldStatus, status);

    invalidateCache(vendorIdFromAuth);

    res.json({ success: true, message: `Order marked as ${status}` });
  } catch (err) {
    handleError(res, err, "Updating order status failed");
  }
});

module.exports = router;


