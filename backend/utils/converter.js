const mammoth = require('mammoth');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * Converts a DOCX buffer to PDF using Mammoth.js and Puppeteer.
 * @param {Buffer} buffer - The DOCX file buffer.
 * @returns {Promise<Buffer>} - The generated PDF buffer.
 */
async function convertDocxToPdf(buffer) {
    let browser = null;
    try {
        if (!buffer || buffer.length === 0) {
            throw new Error("Input buffer is empty or undefined");
        }
        
        console.log(`[Converter] Starting DOCX to PDF conversion... Buffer size: ${buffer.length} bytes`);
        
        // 1. Convert DOCX to HTML using mammoth
        console.log('[Converter] Calling mammoth...');
        const { value: html, messages } = await mammoth.convertToHtml({ buffer });
        console.log('[Converter] Mammoth complete. HTML length:', html.length);
        if (messages.length > 0) {
            console.log('[Converter] Mammoth messages:', messages.map(m => m.message).join(', '));
        }
        
        // 2. Wrap HTML in basic structure
        const styledHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: 'Times New Roman', serif; line-height: 1.6; padding: 40px; color: #000; }
                    img { max-width: 100%; height: auto; }
                    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
                    table, th, td { border: 1px solid black; padding: 8px; }
                    p { margin-bottom: 15px; }
                </style>
            </head>
            <body>
                ${html || '<p>No content in document.</p>'}
            </body>
            </html>
        `;

        // 3. Launch puppeteer
        console.log('[Converter] Launching Puppeteer...');
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--font-render-hinting=none'
            ]
        });
        
        const page = await browser.newPage();
        console.log('[Converter] Page created.');
        
        await page.setContent(styledHtml, { 
            waitUntil: 'networkidle0',
            timeout: 30000 
        });
        console.log('[Converter] Content set.');
        
        const pdfBuffer = await page.pdf({
            format: 'A4',
            margin: { top: '60px', bottom: '60px', left: '60px', right: '60px' },
            printBackground: true
        });
        console.log(`[Converter] PDF generated. Buffer size: ${pdfBuffer.length} bytes`);

        // 4. Extract page count from buffer
        const pdfString = pdfBuffer.toString('binary');
        const pageMatches = pdfString.match(/\/Type\s*\/Page\b/g);
        const pageCount = pageMatches ? pageMatches.length : 1;

        await browser.close();
        browser = null;
        console.log(`[Converter] Conversion successful. Final pages: ${pageCount}`);
        return { pdfBuffer, pageCount };
    } catch (error) {
        console.error('[Converter] FATAL ERROR:', error);
        if (browser) {
            try { await browser.close(); } catch (e) {}
        }
        throw new Error(`PDF conversion failed: ${error.message}`);
    }
}

module.exports = { convertDocxToPdf };
