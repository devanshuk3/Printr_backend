const express = require('express');
const router = express.Router();
const db = require('../db');
const supabase = require('../supabase');
const { param, body } = require('express-validator');
const { validate } = require('../middleware/validator');

// Verify Vendor ID
router.get('/verify/:vendorId', [
  param('vendorId').trim().notEmpty().withMessage('Vendor ID is required'),
  validate
], async (req, res) => {
  const { vendorId } = req.params;
  console.log(`Verifying vendor: ${vendorId}`);

  try {
    const result = await db.supabaseQuery(
      'SELECT vendor_id, shop_name as name, bw_price as price_per_page, color_price, phone, upi_id, pages_printed, platform_fee FROM vendors WHERE LOWER(TRIM(vendor_id)) = LOWER(TRIM($1))',
      [vendorId]
    );

    console.log(`Query result rows: ${result.rows.length}`);
    if (result.rows.length === 0) {
      console.log(`Vendor ${vendorId} not found in database.`);
      return res.status(404).json({ message: "Vendor not found" });
    }

    console.log(`Vendor found: ${JSON.stringify(result.rows[0])}`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Vendor Verify Error:', err.message);
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

// Get all vendors (for Admin)
router.get('/all', async (req, res) => {
  try {
    const result = await db.supabaseQuery('SELECT vendor_id, shop_name as name, bw_price as price_per_page, color_price, phone, upi_id, pages_printed, platform_fee FROM vendors ORDER BY shop_name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('All Vendors Error:', err.message);
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

// Increment vendor stats after successful print
router.post('/increment-stats', [
  body('vendorId').trim().notEmpty().withMessage('Vendor ID is required'),
  body('pages').isInt({ min: 1 }).withMessage('Pages must be at least 1'),
  validate
], async (req, res) => {
  const { vendorId, pages } = req.body;

  try {
    // 1. Get vendor's current price to calculate fee increment
    const vendorRes = await db.supabaseQuery(
      'SELECT bw_price FROM vendors WHERE vendor_id = $1',
      [vendorId]
    );

    if (vendorRes.rows.length === 0) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    const bwPrice = parseFloat(vendorRes.rows[0].bw_price) || 0;
    const feeIncrement = (pages * bwPrice * 0.10);

    // 2. Update stats
    await db.supabaseQuery(
      `UPDATE vendors 
       SET pages_printed = COALESCE(pages_printed, 0) + $1, 
           platform_fee = COALESCE(platform_fee, 0) + $2 
       WHERE vendor_id = $3`,
      [pages, feeIncrement.toFixed(2), vendorId]
    );

    res.json({ message: "Stats updated successfully", increment: feeIncrement.toFixed(2) });
  } catch (err) {
    console.error('Increment Stats Error:', err.message);
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

// Generate a secure Signed URL for a file
// Only valid for 1 hour
router.get('/files/:vendorId/:fileName', [
  param('vendorId').trim().notEmpty(),
  param('fileName').trim().notEmpty(),
  validate
], async (req, res) => {
  const { vendorId, fileName } = req.params;

  try {
    const filePath = `${vendorId}/${fileName}`;
    const { data, error } = await supabase.storage
      .from('printr_cloud_Storage')
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (error) {
      console.error('Supabase Signed URL Error:', error.message);
      return res.status(404).json({ message: "File not found or access denied" });
    }

    res.json({ signedUrl: data.signedUrl });
  } catch (err) {
    console.error('File Access Error:', err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
