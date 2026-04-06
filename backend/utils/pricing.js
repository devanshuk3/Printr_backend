/**
 * @param {number} pages Total volume of pages in the order (e.g. unique_pages * copies)
 * @returns {number} Convenience fee in Rupees
 */
const calculateConvenienceFee = (pages) => {
    // Platform fee logic commented out for now
    /*
    if (!pages || pages <= 0) return 0;
    
    // Efficient tiered logic (O(1) time complexity)
    if(pages <=2) return 0.5;
    if (pages <= 5) return 1;
    if (pages <= 20) return 3;
    if (pages <= 50) return 5;
    
    return 8;
    */
    return 0;
};

module.exports = {
    calculateConvenienceFee
};
