const express = require('express');
const router = express.Router();
const db = require('../db');

// Verify Vendor ID
router.get('/verify/:vendorId', async (req, res) => {
  const { vendorId } = req.params;

  try {
    const result = await db.query(
      'SELECT vendor_id, shop_name as name, bw_price as price_per_page, color_price, phone FROM vendors WHERE LOWER(vendor_id) = LOWER($1)',
      [vendorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Vendor Verify Error:', err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Get all vendors (for Admin)
router.get('/all', async (req, res) => {
  try {
    const result = await db.query('SELECT vendor_id, shop_name as name, bw_price as price_per_page FROM vendors ORDER BY shop_name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('All Vendors Error:', err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
