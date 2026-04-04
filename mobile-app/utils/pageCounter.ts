import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { decode } from 'base64-arraybuffer';

/**
 * Robust page counter for PDF and DOCX files on the frontend.
 */
export async function countFilePages(fileUri: string, fileName: string): Promise<number> {
    const isPdf = fileName.toLowerCase().endsWith('.pdf');
    const isDocx = fileName.toLowerCase().endsWith('.docx');
    
    if (isPdf) {
        try {
            // Read as base64 for better compatibility with pdf-lib in Expo
            const base64 = await FileSystem.readAsStringAsync(fileUri, { 
                encoding: FileSystem.EncodingType.Base64 
            });
            const arrayBuffer = decode(base64);
            const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
            const count = pdfDoc.getPageCount();
            console.log(`[PageCounter] PDF-lib count for ${fileName}: ${count}`);
            return count;
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.warn(`[PageCounter] pdf-lib failed for ${fileName}, falling back to regex:`, message);
            // Fallback to fast UTF8 regex if pdf-lib fails (e.g. huge files or weird encryption)
            try {
                const content = await FileSystem.readAsStringAsync(fileUri, { 
                    encoding: FileSystem.EncodingType.UTF8 
                });
                const countMatch = content.match(/\/Count\s+(\d+)/);
                if (countMatch && countMatch[1]) return parseInt(countMatch[1]);
                const pageMatches = content.match(/\/Type\s*\/Page\b/g);
                return pageMatches ? pageMatches.length : 1;
            } catch (err) {
                return 1;
            }
        }
    }
    
    if (isDocx) {
        try {
            const base64 = await FileSystem.readAsStringAsync(fileUri, { 
                encoding: FileSystem.EncodingType.Base64 
            });
            const zip = await JSZip.loadAsync(base64, { base64: true });
            const appXml = await zip.file('docProps/app.xml')?.async('text');
            
            if (appXml) {
                const match = appXml.match(/<Pages>(\d+)<\/Pages>/);
                if (match && match[1]) {
                    return parseInt(match[1]);
                }
            }
            return 1;
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.warn(`[PageCounter] DOCX error for ${fileName}:`, message);
            return 1;
        }
    }
    
    // Images are always 1 page
    return 1;
}
