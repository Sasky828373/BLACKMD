/**
 * Direct Reaction GIF Copy Script
 * 
 * This script directly copies the correct GIFs from attached_assets to data/reaction_gifs
 * with the appropriate filenames. It ensures the right GIFs are used for each reaction command.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Source and target directories
const SOURCE_DIR = path.join(process.cwd(), 'attached_assets');
const TARGET_DIR = path.join(process.cwd(), 'data', 'reaction_gifs');

// Map of reaction commands to appropriate source GIFs
// These mappings ensure semantic matches between commands and GIF content
const REACTION_GIF_MAPPING = {
    // Self-reactions
    'smile': 'smile.gif', // Happy smiling animation
    'happy': 'smile.gif', // Happy excitement (using smile as fallback)
    'dance': 'dance.gif', // Dance animation
    'cry': 'laugh.gif', // Crying animation (using laugh as fallback)
    'blush': 'smile.gif', // Blushing animation (using smile as fallback)
    'laugh': 'laugh.gif', // Laugh animation
    
    // Target-reactions
    'hug': 'hug.gif', // Hugging animation
    'pat': 'pat.gif', // Patting animation
    'kiss': 'kiss.gif', // Kissing animation
    'cuddle': 'hug.gif', // Cuddling animation (using hug as fallback)
    'wave': 'wave.gif', // Waving animation
    'wink': 'wink.gif', // Winking animation
    'poke': 'poke.gif', // Poking animation
    'slap': 'slap.gif', // Slapping animation
    'bonk': 'slap.gif', // Bonking animation (using slap as fallback)
    'bite': 'kiss.gif', // Biting animation (using kiss as fallback)
    'punch': 'punch.gif', // Punching animation
    'highfive': 'pat.gif', // High fiving animation (using pat as fallback)
    'yeet': 'yeet.gif', // Throwing animation
    'kill': 'kill.gif' // Kill animation
};

/**
 * Format file size in a human-readable way
 * @param {number} bytes File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Calculate a checksum for a file
 * @param {string} filePath Path to the file
 * @returns {string} MD5 checksum or null if error
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
 * Copy a file and verify the copy was successful
 * @param {string} sourcePath Source file path
 * @param {string} targetPath Target file path
 * @returns {Object} Result object with success and details
 */
function copyWithVerification(sourcePath, targetPath) {
    try {
        // Check if source exists
        if (!fs.existsSync(sourcePath)) {
            return {
                success: false,
                error: `Source file not found: ${sourcePath}`
            };
        }
        
        // Get source file stats
        const sourceStats = fs.statSync(sourcePath);
        
        // If target exists, back it up with .old extension
        if (fs.existsSync(targetPath)) {
            try {
                const backupPath = `${targetPath}.old`;
                fs.copyFileSync(targetPath, backupPath);
                console.log(`  Created backup: ${backupPath}`);
            } catch (backupErr) {
                console.warn(`  Warning: Failed to create backup: ${backupErr.message}`);
            }
        }
        
        // Copy the file
        fs.copyFileSync(sourcePath, targetPath);
        
        // Verify the copied file
        if (fs.existsSync(targetPath)) {
            const targetStats = fs.statSync(targetPath);
            const sourceChecksum = calculateFileChecksum(sourcePath);
            const targetChecksum = calculateFileChecksum(targetPath);
            
            return {
                success: true,
                sourceSize: sourceStats.size,
                targetSize: targetStats.size,
                sourceChecksum,
                targetChecksum,
                checksumMatch: sourceChecksum === targetChecksum,
                formattedSize: formatFileSize(targetStats.size)
            };
        } else {
            return {
                success: false,
                error: `Failed to verify copied file: ${targetPath} does not exist`
            };
        }
    } catch (err) {
        return {
            success: false,
            error: err.message
        };
    }
}

/**
 * Process all reactions and copy GIFs with verification
 */
async function processAllReactions() {
    console.log('\n=== Starting Direct Reaction GIF Copy ===');
    
    // Create target directory if it doesn't exist
    if (!fs.existsSync(TARGET_DIR)) {
        try {
            fs.mkdirSync(TARGET_DIR, { recursive: true });
            console.log(`Created target directory: ${TARGET_DIR}`);
        } catch (err) {
            console.error(`Failed to create target directory: ${err.message}`);
            return;
        }
    }
    
    const results = {
        success: [],
        skipped: [],
        failed: []
    };
    
    // Process each reaction
    for (const [reactionName, sourceFileName] of Object.entries(REACTION_GIF_MAPPING)) {
        const targetFileName = `${reactionName}.gif`;
        const sourcePath = path.join(SOURCE_DIR, sourceFileName);
        const targetPath = path.join(TARGET_DIR, targetFileName);
        
        console.log(`\nProcessing: ${reactionName} (${sourceFileName} -> ${targetFileName})`);
        
        if (!fs.existsSync(sourcePath)) {
            console.error(`  ❌ Error: Source file not found: ${sourcePath}`);
            results.failed.push({
                reaction: reactionName,
                source: sourceFileName,
                target: targetFileName,
                error: 'Source file not found'
            });
            continue;
        }
        
        // Copy the file
        const copyResult = copyWithVerification(sourcePath, targetPath);
        
        if (copyResult.success) {
            if (copyResult.checksumMatch) {
                console.log(`  ✅ Success: ${reactionName}.gif copied (${copyResult.formattedSize})`);
                results.success.push({
                    reaction: reactionName,
                    source: sourceFileName,
                    target: targetFileName,
                    size: copyResult.targetSize
                });
            } else {
                console.warn(`  ⚠️ Warning: ${reactionName}.gif copied but checksum mismatch`);
                console.warn(`  Source: ${copyResult.sourceChecksum}`);
                console.warn(`  Target: ${copyResult.targetChecksum}`);
                results.skipped.push({
                    reaction: reactionName,
                    source: sourceFileName,
                    target: targetFileName,
                    error: 'Checksum mismatch'
                });
            }
        } else {
            console.error(`  ❌ Error: Failed to copy ${reactionName}.gif: ${copyResult.error}`);
            results.failed.push({
                reaction: reactionName,
                source: sourceFileName,
                target: targetFileName,
                error: copyResult.error
            });
        }
    }
    
    // Print summary
    console.log('\n=== Direct Copy Summary ===');
    console.log(`Total reactions: ${Object.keys(REACTION_GIF_MAPPING).length}`);
    console.log(`Success: ${results.success.length}`);
    console.log(`Skipped: ${results.skipped.length}`);
    console.log(`Failed: ${results.failed.length}`);
    console.log('===============================');
    
    // Create manifest file
    try {
        const manifestPath = path.join(process.cwd(), 'direct_gif_fix_report.json');
        const manifest = {
            timestamp: new Date().toISOString(),
            results
        };
        
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        console.log(`\nReport created: ${manifestPath}`);
    } catch (err) {
        console.error(`Failed to create report: ${err.message}`);
    }
    
    // Return success count
    return results.success.length;
}

// Run the function if this script is executed directly
if (require.main === module) {
    processAllReactions()
        .then(successCount => {
            console.log(`\nReaction GIF copy completed with ${successCount} successful copies.`);
            process.exit(0);
        })
        .catch(err => {
            console.error('Error in reaction GIF copier:', err);
            process.exit(1);
        });
}

module.exports = {
    processAllReactions,
    REACTION_GIF_MAPPING
};