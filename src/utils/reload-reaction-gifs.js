/**
 * Reaction GIF Reload Script
 * 
 * This script combines the functionality of fix-reaction-gifs-corrected.js 
 * with a restart trigger for the WhatsApp bot.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Calculate a checksum for a file
 * @param {string} filePath Path to the file
 * @returns {string|null} MD5 checksum or null if error
 */
function calculateFileChecksum(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return null;
        }
        
        const fileBuffer = fs.readFileSync(filePath);
        const hashSum = crypto.createHash('md5');
        hashSum.update(fileBuffer);
        
        return hashSum.digest('hex');
    } catch (err) {
        console.error(`Error calculating checksum for ${filePath}: ${err.message}`);
        return null;
    }
}

/**
 * Format file size in a human-readable way
 * @param {number} bytes File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Copy a file with verification
 * @param {string} sourcePath Source file path
 * @param {string} targetPath Target file path
 * @returns {Object} Result object with success and details
 */
function directCopyFile(sourcePath, targetPath) {
    try {
        if (!fs.existsSync(sourcePath)) {
            return { 
                success: false, 
                error: 'Source file not found',
                sourcePath,
                targetPath
            };
        }
        
        // Create target directory if it doesn't exist
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        
        // Get source file information
        const sourceStats = fs.statSync(sourcePath);
        const sourceChecksum = calculateFileChecksum(sourcePath);
        
        // Copy the file
        fs.copyFileSync(sourcePath, targetPath);
        
        // Verify the copy
        const targetStats = fs.statSync(targetPath);
        const targetChecksum = calculateFileChecksum(targetPath);
        
        const success = targetChecksum === sourceChecksum;
        
        return {
            success,
            sourcePath,
            targetPath,
            sourceSize: formatFileSize(sourceStats.size),
            targetSize: formatFileSize(targetStats.size),
            sourceChecksum,
            targetChecksum,
            error: success ? null : 'Checksum verification failed'
        };
    } catch (err) {
        return {
            success: false,
            sourcePath,
            targetPath,
            error: err.message
        };
    }
}

/**
 * Create a manifest file with results
 * @param {Array} results Results array
 */
function createManifest(results) {
    try {
        const manifestPath = path.join(process.cwd(), 'reaction_gifs_manifest.json');
        
        const manifest = {
            timestamp: new Date().toISOString(),
            totalFiles: results.length,
            successCount: results.filter(r => r.success).length,
            failedCount: results.filter(r => !r.success).length,
            results
        };
        
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        console.log(`✅ Created manifest file: ${manifestPath}`);
        
        return manifest;
    } catch (err) {
        console.error(`Error creating manifest: ${err.message}`);
        return null;
    }
}

/**
 * Reload reaction GIFs by copying from attached_assets to data/reaction_gifs
 */
async function reloadReactionGifs() {
    console.log('🔄 Starting reaction GIF reload process...');
    
    const reactionMap = {
        'bite.gif': 'bite.gif',
        'blush.gif': 'blush.gif',
        'bonk.gif': 'bonk.gif',
        'cry.gif': 'cry.gif',
        'cuddle.gif': 'cuddle.gif',
        'dance.gif': 'dance.gif',
        'happy.gif': 'happy.gif',
        'highfive.gif': 'highfive.gif',
        'hug.gif': 'hug.gif',
        'kill.gif': 'kill.gif',
        'kiss.gif': 'kiss.gif',
        'laugh.gif': 'laugh.gif',
        'pat.gif': 'pat.gif',
        'poke.gif': 'poke.gif',
        'punch.gif': 'punch.gif',
        'slap.gif': 'slap.gif',
        'smile.gif': 'smile.gif',
        'wave.gif': 'wave.gif',
        'wink.gif': 'wink.gif',
        'yeet.gif': 'yeet.gif'
    };
    
    const sourceDir = path.join(process.cwd(), 'attached_assets');
    const targetDir = path.join(process.cwd(), 'data', 'reaction_gifs');
    
    // Create target directory if it doesn't exist
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        console.log(`Created target directory: ${targetDir}`);
    }
    
    const results = [];
    const sourceFiles = fs.readdirSync(sourceDir);
    
    // Find all matching GIFs in the source directory
    for (const [sourceName, targetName] of Object.entries(reactionMap)) {
        if (sourceFiles.includes(sourceName)) {
            const sourcePath = path.join(sourceDir, sourceName);
            const targetPath = path.join(targetDir, targetName);
            
            console.log(`Processing ${sourceName} → ${targetName}`);
            
            const result = directCopyFile(sourcePath, targetPath);
            results.push(result);
            
            if (result.success) {
                console.log(`✅ Successfully copied ${sourceName} to ${targetName}`);
            } else {
                console.error(`❌ Failed to copy ${sourceName}: ${result.error}`);
            }
        } else {
            console.warn(`⚠️ Source file ${sourceName} not found in ${sourceDir}`);
            results.push({
                success: false,
                sourcePath: path.join(sourceDir, sourceName),
                targetPath: path.join(targetDir, targetName),
                error: 'Source file not found'
            });
        }
    }
    
    // Create a manifest file with the results
    const manifest = createManifest(results);
    
    // Create a touch file to signal the bot to reload
    const touchFile = path.join(process.cwd(), 'reload_reactions.lock');
    fs.writeFileSync(touchFile, new Date().toISOString());
    console.log(`✅ Created reload trigger: ${touchFile}`);
    
    const successCount = results.filter(r => r.success).length;
    const totalFiles = Object.keys(reactionMap).length;
    
    console.log(`\n📊 Reaction GIF Reload Summary:`);
    console.log(`   - Total files: ${totalFiles}`);
    console.log(`   - Successfully copied: ${successCount}`);
    console.log(`   - Failed: ${totalFiles - successCount}`);
    
    return {
        success: successCount > 0,
        successCount,
        totalFiles,
        failedCount: totalFiles - successCount
    };
}

/**
 * Trigger a restart of the WhatsApp bot
 */
function triggerBotRestart() {
    try {
        console.log('\n🔄 Triggering bot command reload...');
        
        // Create a trigger file that the bot will check for
        const triggerPath = path.join(process.cwd(), 'reload_commands.lock');
        fs.writeFileSync(triggerPath, new Date().toISOString());
        
        console.log(`✅ Created command reload trigger: ${triggerPath}`);
        return true;
    } catch (err) {
        console.error(`❌ Failed to trigger bot restart: ${err.message}`);
        return false;
    }
}

// Run the script if executed directly
if (require.main === module) {
    reloadReactionGifs()
        .then(result => {
            if (result.success) {
                triggerBotRestart();
                console.log('\n✅ Reaction GIF reload complete and bot reload triggered!');
            } else {
                console.log('\n❌ Reaction GIF reload completed with errors.');
            }
        })
        .catch(err => {
            console.error(`\n❌ Error during reaction GIF reload: ${err.message}`);
        });
}

module.exports = {
    reloadReactionGifs,
    triggerBotRestart
};