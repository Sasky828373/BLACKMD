/**
 * Test Reaction GIFs Script
 * 
 * This script tests whether reaction GIFs are correctly mapped to their commands
 * and prints the results with detailed diagnostics.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Paths
const ATTACHED_ASSETS_DIR = path.join(process.cwd(), 'attached_assets');
const REACTION_GIFS_DIR = path.join(process.cwd(), 'data', 'reaction_gifs');

// Map of reaction commands to appropriate source GIFs
// These mappings should match those in src/commands/reactions.js
const REACTION_GIF_MAPPING = {
    // Self-reactions
    'smile': 'heavenly-joy-jerkins-i-am-so-excited.gif', // Happy smiling animation
    'happy': 'heavenly-joy-jerkins-i-am-so-excited.gif', // Happy excitement
    'dance': 'B6ya.gif', // Dance animation
    'cry': 'long-tears.gif', // Crying animation
    'blush': '0fd379b81bc8023064986c9c45f22253_w200.gif', // Blushing animation
    'laugh': '200w.gif', // Laughing animation
    
    // Target-reactions
    'hug': 'tumblr_cdeb20431732069e4456c4ab66b9534f_8178dd55_500.gif', // Hugging animation
    'pat': 'cbfd2a06c6d350e19a0c173dec8dccde.gif', // Patting animation
    'kiss': 'tumblr_435925615ecd34c607dd730ab836eacf_4e338a28_540.gif', // Kissing animation
    'cuddle': 'icegif-890.gif', // Cuddling animation
    'wave': 'BT_L5v.gif', // Waving animation
    'wink': '21R.gif', // Winking animation
    'poke': '1fg1og.gif', // Poking animation
    'slap': 'slap.gif', // Slapping animation
    'bonk': 'icegif-255.gif', // Bonking animation
    'bite': '15d3d956bd674096c4e68f1d011e8023.gif', // Biting-like animation
    'punch': '2Lmc.gif', // Punching animation
    'highfive': 'BT_L5v.gif', // High fiving (waving) animation
    'yeet': '15d3d956bd674096c4e68f1d011e8023.gif', // Throwing (bite-like) animation
    'kill': 'giphy.gif' // Intense animation for "kill" command
};

/**
 * Calculate a file checksum
 * @param {string} filePath - Path to the file
 * @returns {string|null} - MD5 checksum or null if error
 */
function calculateFileChecksum(filePath) {
    try {
        const fileBuffer = fs.readFileSync(filePath);
        return crypto.createHash('md5').update(fileBuffer).digest('hex');
    } catch (err) {
        console.error(`Error calculating checksum for ${filePath}: ${err.message}`);
        return null;
    }
}

/**
 * Format file size in a human-readable way
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Test if GIFs are correctly mapped
 */
function testReactionGifs() {
    console.log('\n===== REACTION GIF MAPPING TEST =====');
    console.log('Command\t\tSource GIF\t\tTarget GIF\t\tMatch?\tSource Size\tTarget Size\tChecksum Match');
    console.log('--------------------------------------------------------------------------------------------------');
    
    // Ensure directories exist
    if (!fs.existsSync(REACTION_GIFS_DIR)) {
        fs.mkdirSync(REACTION_GIFS_DIR, { recursive: true });
        console.log(`Created directory: ${REACTION_GIFS_DIR}`);
    }
    
    let matches = 0;
    let mismatches = 0;
    let missing = 0;
    
    // Test each reaction command
    Object.entries(REACTION_GIF_MAPPING).forEach(([command, sourceFileName]) => {
        const sourcePath = path.join(ATTACHED_ASSETS_DIR, sourceFileName);
        const targetPath = path.join(REACTION_GIFS_DIR, `${command}.gif`);
        
        let sourceInfo = { exists: false, size: 0, checksum: null };
        let targetInfo = { exists: false, size: 0, checksum: null };
        
        // Check source file
        if (fs.existsSync(sourcePath)) {
            const sourceStats = fs.statSync(sourcePath);
            sourceInfo = {
                exists: true,
                size: sourceStats.size,
                formattedSize: formatFileSize(sourceStats.size),
                checksum: calculateFileChecksum(sourcePath)
            };
        }
        
        // Check target file
        if (fs.existsSync(targetPath)) {
            const targetStats = fs.statSync(targetPath);
            targetInfo = {
                exists: true,
                size: targetStats.size,
                formattedSize: formatFileSize(targetStats.size),
                checksum: calculateFileChecksum(targetPath)
            };
        }
        
        // Determine if they match
        const matchStatus = sourceInfo.exists && targetInfo.exists 
            ? (sourceInfo.checksum === targetInfo.checksum ? 'YES ✅' : 'NO ❌')
            : 'N/A ⚠️';
        
        // Print the result
        console.log(
            `${command.padEnd(15)} ${
                sourceFileName.substring(0, 20).padEnd(25)
            } ${targetPath.split('/').pop().padEnd(20)} ${
                matchStatus.padEnd(8)
            } ${(sourceInfo.formattedSize || 'N/A').padEnd(12)} ${
                (targetInfo.formattedSize || 'N/A').padEnd(12)
            } ${sourceInfo.checksum === targetInfo.checksum ? 'YES ✅' : 'NO ❌'}`
        );
        
        // Count results
        if (!sourceInfo.exists || !targetInfo.exists) {
            missing++;
        } else if (sourceInfo.checksum === targetInfo.checksum) {
            matches++;
        } else {
            mismatches++;
        }
    });
    
    console.log('--------------------------------------------------------------------------------------------------');
    console.log(`Total: ${Object.keys(REACTION_GIF_MAPPING).length}, Matches: ${matches}, Mismatches: ${mismatches}, Missing: ${missing}`);
    console.log('===== END OF TEST =====\n');
    
    return { matches, mismatches, missing, total: Object.keys(REACTION_GIF_MAPPING).length };
}

// Run the test if this script is executed directly
if (require.main === module) {
    testReactionGifs();
}

module.exports = { testReactionGifs };