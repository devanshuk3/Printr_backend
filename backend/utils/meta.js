const admZip = require('adm-zip');

/**
 * Extracts the page count from a DOCX file buffer without full conversion.
 * @param {Buffer} buffer - The DOCX file buffer
 * @returns {number} - The page count or 1 as fallback
 */
function getDocxPageCount(buffer) {
    try {
        const zip = new admZip(buffer);
        const appXml = zip.readAsText('docProps/app.xml');
        const match = appXml.match(/<Pages>(\d+)<\/Pages>/);
        if (match && match[1]) {
            const count = parseInt(match[1]);
            console.log(`[Meta] Extracted DOCX page count: ${count}`);
            return count;
        }
        return 1;
    } catch (error) {
        console.warn('[Meta] Error extracting DOCX page count:', error.message);
        return 1;
    }
}

/**
 * Extracts the page count from a PDF file buffer using regex.
 * @param {Buffer} buffer - The PDF file buffer
 * @returns {number} - The page count or 1 as fallback
 */
function getPdfPageCount(buffer) {
    try {
        const content = buffer.toString('utf8', 0, 50000); // Read first 50KB
        const countMatch = content.match(/\/Count\s+(\d+)/);
        if (countMatch && countMatch[1]) {
            return parseInt(countMatch[1]);
        } else {
            const pageMatches = content.match(/\/Type\s*\/Page\b/g);
            return pageMatches ? pageMatches.length : 1;
        }
    } catch (e) {
        return 1;
    }
}

module.exports = { getDocxPageCount, getPdfPageCount };
