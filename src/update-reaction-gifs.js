/**
 * Update Reaction GIFs Script
 * 
 * This script copies specific GIFs from the attached_assets folder
 * to the data/reaction_gifs folder with the correct names.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Define source and destination directories
const SOURCE_DIR = path.join(process.cwd(), 'attached_assets');
const TARGET_DIR = path.join(process.cwd(), 'data', 'reaction_gifs');

// Define mapping of GIFs to reaction commands
const GIF_MAPPING = {
  // All GIFs are now available in attached_assets with their correct names
  'yeet.gif': 'yeet.gif',
  'wink.gif': 'wink.gif',
  'wave.gif': 'wave.gif',
  'slap.gif': 'slap.gif',
  'smile.gif': 'smile.gif',
  'poke.gif': 'poke.gif',
  'punch.gif': 'punch.gif',
  'pat.gif': 'pat.gif',
  'laugh.gif': 'laugh.gif',
  'kiss.gif': 'kiss.gif',
  'kill.gif': 'kill.gif',
  'hug.gif': 'hug.gif',
  'happy.gif': 'happy.gif',
  'cry.gif': 'cry.gif',
  'blush.gif': 'blush.gif',
  'cuddle.gif': 'cuddle.gif',
  'bonk.gif': 'bonk.gif',
  'bite.gif': 'bite.gif',
  'highfive.gif': 'highfive.gif',
};

/**
 * Format file size in a human-readable way
 * @param {number} bytes File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Calculate a checksum for a file
 * @param {string} filePath Path to the file
 * @returns {string} MD5 checksum or null if error
 */
function calculateFileChecksum(filePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('md5');
    hash.update(fileBuffer);
    return hash.digest('hex');
  } catch (err) {
    console.error(`Error calculating checksum for ${filePath}:`, err.message);
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
    // Create backup of existing file if it exists
    if (fs.existsSync(targetPath)) {
      const backupPath = `${targetPath}.old`;
      fs.copyFileSync(targetPath, backupPath);
      console.log(`  Created backup: ${backupPath}`);
    }

    // Copy the file
    fs.copyFileSync(sourcePath, targetPath);
    
    // Verify the copy
    const sourceSize = fs.statSync(sourcePath).size;
    const targetSize = fs.statSync(targetPath).size;
    const sourceChecksum = calculateFileChecksum(sourcePath);
    const targetChecksum = calculateFileChecksum(targetPath);
    
    const success = sourceSize === targetSize && sourceChecksum === targetChecksum;
    
    return {
      success,
      size: targetSize,
      sizeFormatted: formatFileSize(targetSize),
      sourceSize,
      targetSize,
      sourceChecksum,
      targetChecksum
    };
  } catch (err) {
    console.error(`Error copying ${sourcePath} to ${targetPath}:`, err.message);
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
  // Special case: For dance.gif, we'll use a copy of happy.gif if dance.gif doesn't exist
  const danceGif = path.join(SOURCE_DIR, 'dance.gif');
  const happyGif = path.join(SOURCE_DIR, 'happy.gif');
  if (!fs.existsSync(danceGif) && fs.existsSync(happyGif)) {
    console.log('Creating dance.gif from happy.gif for the dance command...');
    try {
      fs.copyFileSync(happyGif, danceGif);
      console.log('✅ Successfully created dance.gif');
    } catch (err) {
      console.error('❌ Failed to create dance.gif:', err.message);
    }
  }
  console.log('\n=== Starting Update Reaction GIFs ===\n');
  
  // Create directories if they don't exist
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
    console.log(`Created directory: ${TARGET_DIR}`);
  }
  
  // Process each mapped GIF
  const results = {};
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;
  
  for (const [sourceFile, targetFile] of Object.entries(GIF_MAPPING)) {
    const sourcePath = path.join(SOURCE_DIR, sourceFile);
    const targetPath = path.join(TARGET_DIR, targetFile);
    
    // Skip if source file doesn't exist
    if (!fs.existsSync(sourcePath)) {
      console.log(`⚠️ Source file not found: ${sourceFile}`);
      skipCount++;
      continue;
    }
    
    console.log(`Processing: ${sourceFile} -> ${targetFile}`);
    
    // Copy the file with verification
    const result = copyWithVerification(sourcePath, targetPath);
    
    if (result.success) {
      console.log(`  ✅ Success: ${targetFile} copied (${result.sizeFormatted})`);
      successCount++;
    } else {
      console.log(`  ❌ Failed: ${targetFile} - ${result.error || 'Verification failed'}`);
      failCount++;
    }
    
    results[targetFile] = result;
    
    // Add a blank line for readability
    console.log('');
  }
  
  console.log('=== Update Summary ===');
  console.log(`Total reactions processed: ${successCount + skipCount + failCount}`);
  console.log(`Success: ${successCount}`);
  console.log(`Skipped: ${skipCount}`);
  console.log(`Failed: ${failCount}`);
  console.log('===============================\n');
  
  // Create a report file
  const reportPath = path.join(process.cwd(), 'reaction_gifs_update_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`Report created: ${reportPath}\n`);
  
  if (successCount > 0) {
    console.log(`Reaction GIFs update completed with ${successCount} successful copies.`);
  } else {
    console.log('No reaction GIFs were successfully updated.');
  }
}

// Run the process
processAllReactions().catch(err => {
  console.error('Error in update process:', err);
});