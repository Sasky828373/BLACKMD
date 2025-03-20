/**
 * Direct GIF Fix Script
 * 
 * This script takes a more direct approach to fixing reaction GIFs by:
 * 1. Directly copying source GIFs to correctly named target files
 * 2. Validating that each target GIF was copied correctly
 * 3. Creating a lock file to ensure the WhatsApp bot doesn't load cached GIFs
 * 
 * This approach should work even when other methods fail.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Define paths
const SOURCE_DIR = path.join(process.cwd(), 'attached_assets');
const TARGET_DIR = path.join(process.cwd(), 'data', 'reaction_gifs');
const TEMP_DIR = path.join(process.cwd(), 'temp', 'reaction_fix');

// Ensure directories exist
[TARGET_DIR, TEMP_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
});

// Manually curated direct mapping of GIFs that are confirmed to match their reactions
const DIRECT_GIF_MAPPING = {
    // Self-reactions
    'smile': { source: 'heavenly-joy-jerkins-i-am-so-excited.gif', description: 'Shows happy smiling animation' },
    'happy': { source: 'heavenly-joy-jerkins-i-am-so-excited.gif', description: 'Shows excited happiness' },
    'dance': { source: 'B6ya.gif', description: 'Shows dancing animation' },
    'cry': { source: 'long-tears.gif', description: 'Shows crying animation' },
    'blush': { source: '0fd379b81bc8023064986c9c45f22253_w200.gif', description: 'Shows blushing anime character' },
    'laugh': { source: '200w.gif', description: 'Shows laughing animation' },
    
    // Target-reactions
    'hug': { source: 'tumblr_cdeb20431732069e4456c4ab66b9534f_8178dd55_500.gif', description: 'Shows hugging animation' },
    'pat': { source: 'cbfd2a06c6d350e19a0c173dec8dccde.gif', description: 'Shows patting animation' },
    'kiss': { source: 'tumblr_435925615ecd34c607dd730ab836eacf_4e338a28_540.gif', description: 'Shows kissing animation' },
    'cuddle': { source: 'icegif-890.gif', description: 'Shows cuddling animation' },
    'wave': { source: 'BT_L5v.gif', description: 'Shows waving animation' },
    'wink': { source: '21R.gif', description: 'Shows winking animation' },
    'poke': { source: '1fg1og.gif', description: 'Shows poking animation' },
    'slap': { source: 'slap.gif', description: 'Shows slapping animation' },
    'bonk': { source: 'icegif-255.gif', description: 'Shows bonking animation' },
    'bite': { source: '15d3d956bd674096c4e68f1d011e8023.gif', description: 'Shows biting animation' },
    'punch': { source: '2Lmc.gif', description: 'Shows punching animation' },
    'highfive': { source: 'BT_L5v.gif', description: 'Shows high five (using wave) animation' },
    'yeet': { source: '15d3d956bd674096c4e68f1d011e8023.gif', description: 'Shows yeeting (using bite) animation' },
    'kill': { source: 'giphy.gif', description: 'Shows intense kill animation' }
};

// Calculate file checksum for validation
function calculateFileChecksum(filePath) {
    try {
        const fileBuffer = fs.readFileSync(filePath);
        const hashSum = crypto.createHash('md5');
        hashSum.update(fileBuffer);
        return hashSum.digest('hex');
    } catch (error) {
        console.error(`Error calculating checksum for ${filePath}: ${error.message}`);
        return null;
    }
}

// Format file size for display
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Direct copy function that ensures a clean copy
function directCopyFile(sourcePath, targetPath) {
    try {
        // Read source file completely
        const fileData = fs.readFileSync(sourcePath);
        
        // Write to a temporary file first
        const tempPath = path.join(TEMP_DIR, path.basename(targetPath) + '.tmp');
        fs.writeFileSync(tempPath, fileData);
        
        // Verify the temp file was written correctly
        const sourceChecksum = calculateFileChecksum(sourcePath);
        const tempChecksum = calculateFileChecksum(tempPath);
        
        if (sourceChecksum !== tempChecksum) {
            throw new Error(`Checksum mismatch: Source and temp file don't match`);
        }
        
        // Now copy the temp file to the final destination
        fs.copyFileSync(tempPath, targetPath);
        
        // Final verification
        const targetChecksum = calculateFileChecksum(targetPath);
        if (sourceChecksum !== targetChecksum) {
            throw new Error(`Final checksum mismatch: Source and target file don't match`);
        }
        
        // Clean up temp file
        fs.unlinkSync(tempPath);
        
        return true;
    } catch (error) {
        console.error(`Error in direct copy: ${error.message}`);
        return false;
    }
}

// Main execution function
async function fixReactionGifs() {
    console.log('Starting DIRECT reaction GIF fix...');
    console.log(`Source directory: ${SOURCE_DIR}`);
    console.log(`Target directory: ${TARGET_DIR}`);
    
    // First make sure any cache is cleaned
    const commandCachePath = path.join(process.cwd(), 'src', 'commands', 'reactions.js');
    if (require.cache[require.resolve(commandCachePath)]) {
        delete require.cache[require.resolve(commandCachePath)];
        console.log('✅ Cleared reactions command module from cache');
    }
    
    // Create lockfile to prevent loading during copy
    const lockfilePath = path.join(TARGET_DIR, '.gif_lock');
    fs.writeFileSync(lockfilePath, 'Locked for GIF update: ' + new Date().toISOString());
    console.log('✅ Created lock file to prevent premature loading');
    
    // Results tracking
    let successCount = 0;
    let errorCount = 0;
    const results = [];
    
    // Process each mapping
    for (const [command, details] of Object.entries(DIRECT_GIF_MAPPING)) {
        console.log(`\nProcessing ${command} with source GIF: ${details.source}`);
        console.log(`Description: ${details.description}`);
        
        const sourcePath = path.join(SOURCE_DIR, details.source);
        const targetPath = path.join(TARGET_DIR, `${command}.gif`);
        
        if (!fs.existsSync(sourcePath)) {
            console.error(`❌ Source file not found: ${sourcePath}`);
            errorCount++;
            results.push({
                command,
                source: details.source,
                success: false,
                error: 'Source file not found'
            });
            continue;
        }
        
        // Get source file info
        const sourceStats = fs.statSync(sourcePath);
        console.log(`Source size: ${formatFileSize(sourceStats.size)}`);
        
        // Direct copy with verification
        const copySuccess = directCopyFile(sourcePath, targetPath);
        
        if (copySuccess) {
            const targetStats = fs.statSync(targetPath);
            console.log(`✅ Successfully copied to ${command}.gif`);
            console.log(`Target size: ${formatFileSize(targetStats.size)}`);
            successCount++;
            results.push({
                command,
                source: details.source,
                success: true,
                sourceSize: formatFileSize(sourceStats.size),
                targetSize: formatFileSize(targetStats.size)
            });
        } else {
            console.error(`❌ Failed to copy to ${command}.gif`);
            errorCount++;
            results.push({
                command,
                source: details.source,
                success: false,
                error: 'Copy operation failed'
            });
        }
    }
    
    // Remove lockfile
    if (fs.existsSync(lockfilePath)) {
        fs.unlinkSync(lockfilePath);
        console.log('✅ Removed lock file');
    }
    
    // Print summary
    console.log('\n=== DIRECT GIF FIX SUMMARY ===');
    console.log(`✅ Successful copies: ${successCount}`);
    console.log(`❌ Failed copies: ${errorCount}`);
    
    // Create a detailed report
    const reportPath = path.join(process.cwd(), 'direct_gif_fix_report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        successCount,
        errorCount,
        results
    }, null, 2));
    console.log(`✅ Detailed report saved to ${reportPath}`);
    
    console.log('\nREACTION GIF FIX COMPLETE. Please restart the bot for changes to take effect.');
    
    return {
        successCount,
        errorCount,
        results
    };
}

// Execute the fix
fixReactionGifs().then(result => {
    console.log(`Completed with ${result.successCount} successes and ${result.errorCount} failures.`);
}).catch(error => {
    console.error('Fatal error:', error);
});