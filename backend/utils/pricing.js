/**
 * Platform fee percentage (8% of vendor revenue).
 * Single source of truth — used by payment.js and vendors.js.
 */
const PLATFORM_FEE_PERCENT = 0.08;

/**
 * @param {number} pages Total volume of pages in the order (e.g. unique_pages * copies)
 * @returns {number} Convenience fee in Rupees
 */
// Convenience fee logic — kept for reference, currently disabled
/*
const calculateConvenienceFee = (pages) => {
    if (!pages || pages <= 0) return 0;
    
    // Efficient tiered logic (O(1) time complexity)
    if(pages <=2) return 0.5;
    if (pages <= 5) return 1;
    if (pages <= 20) return 3;
    if (pages <= 50) return 5;
    
    return 8;
};
*/

module.exports = {
    PLATFORM_FEE_PERCENT
};
