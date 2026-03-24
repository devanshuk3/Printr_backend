/**
 * Calculates the convenience fee for a printing order based on the total number of pages.
 * Tiered pricing:
 * Pages <= 5 -> ₹1
 * 6-20 -> ₹3
 * 21-50 -> ₹5
 * > 50 -> ₹8
 * 
 * @param {number} pages Total volume of pages in the order (e.g. unique_pages * copies)
 * @returns {number} Convenience fee in Rupees
 */
const calculateConvenienceFee = (pages) => {
    if (!pages || pages <= 0) return 0;
    
    // Efficient tiered logic (O(1) time complexity)
    if (pages <= 5) return 1;
    if (pages <= 20) return 3;
    if (pages <= 50) return 5;
    
    return 8;
};

module.exports = {
    calculateConvenienceFee
};
