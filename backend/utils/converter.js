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
    try {
        console.log('[Converter] Starting DOCX to PDF conversion...');
        
        // 1. Convert DOCX to HTML using mammoth
        const { value: html } = await mammoth.convertToHtml({ buffer });
        
        // 2. Add some basic styling so it doesn't look completely plain
        const styledHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: 'Times New Roman', serif; line-height: 1.6; padding: 20px; }
                    img { max-width: 100%; height: auto; }
                    /* Handling some mammoth defaults */
                </style>
            </head>
            <body>
                ${html}
            </body>
            </html>
        `;

        // 3. Launch puppeteer to generate PDF from HTML
        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(styledHtml, { waitUntil: 'networkidle0' });
        
        const pdfBuffer = await page.pdf({
            format: 'A4',
            margin: {
                top: '40px',
                bottom: '40px',
                left: '40px',
                right: '40px'
            },
            printBackground: true
        });

        await browser.close();
        console.log('[Converter] Conversion successful.');
        return pdfBuffer;
    } catch (error) {
        console.error('[Converter] Error during conversion:', error);
        throw error;
    }
}

module.exports = { convertDocxToPdf };
