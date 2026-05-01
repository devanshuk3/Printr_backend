const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimiter');
const handleError = require('../utils/errorHandler');
const { validateBody } = require('../middleware/validator');
const { calculatePaymentSchema } = require('../middleware/schemas');

router.use(generalLimiter);

/**
 * Platform fee percentage charged to vendors (8% of printing cost).
 * This is the single source of truth for the cut percentage.
 */
const PLATFORM_FEE_PERCENT = 0.08;



/**
 * Parse a page range string (e.g. "1-5, 8, 10-12") and return the count of unique pages.
 */
const parsePageRange = (rangeStr, maxPages) => {
  if (!rangeStr || !rangeStr.trim()) return 0;
  const parts = rangeStr.split(',');
  const processedPages = new Set();

  parts.forEach(part => {
    const range = part.trim().split('-');
    if (range.length === 2) {
      const start = parseInt(range[0]);
      const end = parseInt(range[1]);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = Math.max(1, start); i <= Math.min(end, maxPages); i++) {
          processedPages.add(i);
        }
      }
    } else {
      const page = parseInt(range[0]);
      if (!isNaN(page) && page >= 1 && page <= maxPages) {
        processedPages.add(page);
      }
    }
  });

  return processedPages.size;
};

/**
 * POST /api/payment/calculate
 * 
 * Calculates the total payment amount server-side.
 * 
 * Body:
 *   vendorId       (string, required) - The vendor to print with
 *   totalPages     (int, required)    - Total pages across all documents
 *   copies         (int, required)    - Number of copies
 *   colorMode      (string, required) - "Colored" or "Black & White"
 *   doubleSided    (string, required) - "YES" or "NO"
 *   pageSelection  (string, required) - "All" or "Custom"
 *   customRange    (string, optional) - e.g. "1-5, 8" (only when pageSelection is "Custom")
 * 
 * Returns:
 *   totalAmount    (number)  - The final cost the user pays (= printingCost, no extra fees to user)
 *   printingCost   (number)  - The base printing cost
 *   platformFee    (number)  - The platform cut from vendor revenue (8%)
 *   effectivePages (number)  - The actual number of pages being printed
 *   sheetsPerCopy  (number)  - Sheets used per copy (accounts for double-sided)
 *   pricePerPage   (number)  - The vendor's price per page for the selected color mode
 */
router.post('/calculate', [
  auth,
  validateBody(calculatePaymentSchema),
], async (req, res) => {
  const { vendorId, totalPages, copies, colorMode, doubleSided, pageSelection, customRange } = req.body;

  try {
    // 1. Fetch vendor pricing from the database (authoritative source)
    const vendorRes = await db.query(
      'SELECT bw_price, color_price, bw_price_single, bw_price_2_to_5, bw_price_6_to_9, bw_price_10_plus, color_price_single, color_price_2_to_5, color_price_6_to_9, color_price_10_plus, has_bw_printer, has_color_printer FROM vendors WHERE LOWER(TRIM(vendor_id)) = LOWER(TRIM($1))',
      [vendorId]
    );

    if (vendorRes.rows.length === 0) {
      return res.status(404).json({ message: "Vendor not found." });
    }

    const vendor = vendorRes.rows[0];

    // 2. Validate that the vendor supports the requested color mode
    if (colorMode === 'Colored' && !vendor.has_color_printer) {
      return res.status(400).json({ message: "This vendor does not support color printing." });
    }
    if (colorMode === 'Black & White' && !vendor.has_bw_printer) {
      return res.status(400).json({ message: "This vendor does not support black & white printing." });
    }

    // 3. Determine effective pages (handle custom range)
    let effectivePages = totalPages;
    if (pageSelection === 'Custom' && customRange) {
      effectivePages = parsePageRange(customRange, totalPages);
    }

    // 4. Determine the price per page from the vendor's settings based on effectivePages
    let pricePerPage = 0;
    if (colorMode === 'Colored') {
      if (effectivePages === 1 && parseFloat(vendor.color_price_single) > 0) pricePerPage = parseFloat(vendor.color_price_single);
      else if (effectivePages >= 2 && effectivePages <= 5 && parseFloat(vendor.color_price_2_to_5) > 0) pricePerPage = parseFloat(vendor.color_price_2_to_5);
      else if (effectivePages >= 6 && effectivePages <= 9 && parseFloat(vendor.color_price_6_to_9) > 0) pricePerPage = parseFloat(vendor.color_price_6_to_9);
      else if (effectivePages >= 10 && parseFloat(vendor.color_price_10_plus) > 0) pricePerPage = parseFloat(vendor.color_price_10_plus);
      else pricePerPage = parseFloat(vendor.color_price) || 0;
    } else {
      if (effectivePages === 1 && parseFloat(vendor.bw_price_single) > 0) pricePerPage = parseFloat(vendor.bw_price_single);
      else if (effectivePages >= 2 && effectivePages <= 5 && parseFloat(vendor.bw_price_2_to_5) > 0) pricePerPage = parseFloat(vendor.bw_price_2_to_5);
      else if (effectivePages >= 6 && effectivePages <= 9 && parseFloat(vendor.bw_price_6_to_9) > 0) pricePerPage = parseFloat(vendor.bw_price_6_to_9);
      else if (effectivePages >= 10 && parseFloat(vendor.bw_price_10_plus) > 0) pricePerPage = parseFloat(vendor.bw_price_10_plus);
      else pricePerPage = parseFloat(vendor.bw_price) || 0;
    }

    // 5. Calculate sheets per copy (double-sided halves the sheet count)
    const sheetsPerCopy = doubleSided === 'YES'
      ? Math.ceil(effectivePages / 2)
      : effectivePages;

    // 6. Calculate base printing cost (this is what the user pays)
    const printingCost = sheetsPerCopy * copies * pricePerPage;

    // 7. Platform fee is calculated on the vendor's revenue (not charged to user)
    const platformFee = printingCost * PLATFORM_FEE_PERCENT;

    // 8. Total amount = printing cost only (no extra fees for the user)
    const totalAmount = printingCost;

    res.json({
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      printingCost: parseFloat(printingCost.toFixed(2)),
      platformFee: parseFloat(platformFee.toFixed(2)),
      effectivePages,
      sheetsPerCopy,
      pricePerPage: parseFloat(pricePerPage.toFixed(2))
    });

  } catch (err) {
    handleError(res, err, "Could not calculate payment amount.");
  }
});

/**
 * Export the platform fee percentage for use in other modules (e.g. increment-stats).
 */
router.PLATFORM_FEE_PERCENT = PLATFORM_FEE_PERCENT;

module.exports = router;
