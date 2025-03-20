const fs = require('fs').promises;
const { ExifTool } = require('exiftool-vendored');
const logger = require('./logger');

/**
 * Write metadata to WebP sticker
 * @param {string} webpPath Path to WebP file
 * @param {Object} metadata Metadata to write
 * @param {string} metadata.packname Sticker pack name
 * @param {string} metadata.author Sticker author
 */
async function writeExifToWebp(webpPath, metadata) {
    try {
        const exiftool = new ExifTool();
        await exiftool.write(webpPath, {
            'XMP-dc:Title': metadata.packname,
            'XMP-dc:Creator': metadata.author,
            'XMP-dc:Description': 'Created with WhatsApp Bot',
            'XMP-dc:Rights': `© ${new Date().getFullYear()} ${metadata.author}`
        });
        await exiftool.end();
    } catch (err) {
        logger.error('Error writing sticker metadata:', err);
        // Continue without metadata if there's an error
    }
}

module.exports = {
    writeExifToWebp
};
