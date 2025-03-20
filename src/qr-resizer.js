/**
 * QR Code Size Optimizer
 * 
 * This utility creates a more compact QR code that's easier to scan
 * in environments with limited screen space or low resolution.
 */

const qrcode = require('qrcode-terminal');

/**
 * Generate a compact QR code with customized size
 * @param {string} text - The text to encode in the QR code
 * @param {Object} options - Options for the QR code
 * @param {boolean} options.small - Whether to use the small size (default: true)
 * @param {Function} options.callback - Callback function for the QR code
 */
function generateCompactQR(text, options = {}) {
    const { small = true, callback = null } = options;
    
    // Use built-in small option for more compact QR
    const qrOptions = { small };
    
    if (callback) {
        qrcode.generate(text, qrOptions, callback);
    } else {
        return new Promise((resolve) => {
            qrcode.generate(text, qrOptions, (qr) => {
                resolve(qr);
            });
        });
    }
}

/**
 * Display a QR code with a custom header and footer
 * @param {string} text - The text to encode in the QR code
 * @param {Object} options - Options for the QR display
 * @param {string} options.headerText - Text to display above the QR code
 * @param {string} options.footerText - Text to display below the QR code
 * @param {boolean} options.small - Whether to use the small size (default: true)
 */
async function displayQRWithHeader(text, options = {}) {
    const {
        headerText = 'Scan this QR code with your WhatsApp app:',
        footerText = 'Keep this window open while scanning',
        small = true
    } = options;
    
    // Generate the QR code
    const qr = await generateCompactQR(text, { small });
    
    // Clear terminal and show nicely formatted QR code
    console.clear();
    
    // Display header
    console.log('\n\x1b[36m' + '═'.repeat(50) + '\x1b[0m');
    console.log('\x1b[1m' + headerText + '\x1b[0m');
    console.log('\x1b[36m' + '═'.repeat(50) + '\x1b[0m\n');
    
    // Display QR
    console.log(qr);
    
    // Display footer
    console.log('\x1b[36m' + '═'.repeat(50) + '\x1b[0m');
    console.log('\x1b[1m' + footerText + '\x1b[0m');
    console.log('\x1b[36m' + '═'.repeat(50) + '\x1b[0m\n');
}

module.exports = {
    generateCompactQR,
    displayQRWithHeader
};