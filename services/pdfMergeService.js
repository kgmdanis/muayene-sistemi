const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

/**
 * Merge multiple PDF buffers into a single PDF
 * @param {Buffer[]} buffers - Array of PDF buffers
 * @returns {Promise<Buffer>} - Merged PDF buffer
 */
async function mergePdfs(buffers) {
    const mergedPdf = await PDFDocument.create();

    for (const buffer of buffers) {
        try {
            const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
            const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            pages.forEach(page => mergedPdf.addPage(page));
        } catch (err) {
            console.error('PDF sayfa kopyalama hatası:', err.message);
            // Skip problematic PDFs rather than failing the whole merge
        }
    }

    const mergedBytes = await mergedPdf.save();
    return Buffer.from(mergedBytes);
}

/**
 * Convert an image (JPEG/PNG) to a single-page PDF
 * @param {Buffer} imageBuffer - Image buffer
 * @param {string} mimeType - e.g. "image/jpeg", "image/png"
 * @returns {Promise<Buffer>} - PDF buffer with the image as a page
 */
async function imageToPdfPage(imageBuffer, mimeType) {
    const pdfDoc = await PDFDocument.create();

    let image;
    if (mimeType === 'image/png') {
        image = await pdfDoc.embedPng(imageBuffer);
    } else {
        image = await pdfDoc.embedJpg(imageBuffer);
    }

    // A4 page size: 595.28 x 841.89 points
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Scale image to fit page with margins
    const margin = 40;
    const maxWidth = pageWidth - 2 * margin;
    const maxHeight = pageHeight - 2 * margin;

    const imgWidth = image.width;
    const imgHeight = image.height;
    const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight, 1);

    const drawWidth = imgWidth * scale;
    const drawHeight = imgHeight * scale;

    page.drawImage(image, {
        x: (pageWidth - drawWidth) / 2,
        y: pageHeight - margin - drawHeight,
        width: drawWidth,
        height: drawHeight
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}

/**
 * Read a file and convert to PDF buffer
 * If file is already PDF, return as-is; if image, convert to PDF page
 * @param {string} filePath - Path to the file
 * @returns {Promise<Buffer>} - PDF buffer
 */
async function fileToPdfBuffer(filePath) {
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.pdf') {
        return buffer;
    } else if (['.jpg', '.jpeg'].includes(ext)) {
        return await imageToPdfPage(buffer, 'image/jpeg');
    } else if (ext === '.png') {
        return await imageToPdfPage(buffer, 'image/png');
    } else {
        throw new Error(`Desteklenmeyen dosya formatı: ${ext}`);
    }
}

module.exports = {
    mergePdfs,
    imageToPdfPage,
    fileToPdfBuffer
};
