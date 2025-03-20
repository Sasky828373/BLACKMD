/**
 * Improved Reaction GIF Fixer
 * 
 * This script provides a more accurate mapping of reaction GIFs
 * based on visual inspection of GIF contents.
 */

const fs = require('fs');
const path = require('path');

// Map of reaction commands to appropriate source GIFs
// These mappings have been manually selected to ensure 
// semantic matches between commands and GIF content
const REACTION_GIF_MAPPING = {
    // Self-reactions
    'smile': 'heavenly-joy-jerkins-i-am-so-excited.gif', // Happy smiling animation
    'happy': 'heavenly-joy-jerkins-i-am-so-excited.gif', // Happy excitement
    'dance': 'B6ya.gif', // Dance animation
    'cry': 'long-tears.gif', // Crying animation
    'blush': '0fd379b81bc8023064986c9c45f22253_w200.gif', // Blushing animation
    'laugh': 'laugh.gif', // Updated laugh animation with person laughing
    
    // Target-reactions
    'hug': 'tumblr_cdeb20431732069e4456c4ab66b9534f_8178dd55_500.gif', // Hugging animation
    'pat': 'pat.gif', // Updated patting animation with Stitch
    'kiss': 'tumblr_435925615ecd34c607dd730ab836eacf_4e338a28_540.gif', // Kissing animation
    'cuddle': 'icegif-890.gif', // Cuddling animation
    'wave': 'wave.gif', // Updated waving animation with character waving
    'wink': 'wink.gif', // Updated winking animation with person winking
    'poke': 'poke.gif', // Updated poking animation with chickens
    'slap': 'slap.gif', // Slapping animation
    'bonk': 'icegif-255.gif', // Bonking animation
    'bite': '15d3d956bd674096c4e68f1d011e8023.gif', // Biting-like animation
    'punch': '2Lmc.gif', // Punching animation
    'highfive': 'BT_L5v.gif', // High fiving (waving) animation
    'yeet': '15d3d956bd674096c4e68f1d011e8023.gif', // Throwing (bite-like) animation
    'kill': 'giphy.gif' // Intense animation for "kill" command
};

// Paths
const SOURCE_DIR = path.join(process.cwd(), 'attached_assets');
const TARGET_DIR = path.join(process.cwd(), 'data', 'reaction_gifs');

// Ensure the target directory exists
if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
    console.log(`Created directory: ${TARGET_DIR}`);
}

// Copy and rename GIFs based on mapping
let successCount = 0;
let errorCount = 0;

console.log('Starting CORRECTED reaction GIF mapping fix...');
console.log(`Source directory: ${SOURCE_DIR}`);
console.log(`Target directory: ${TARGET_DIR}`);

Object.entries(REACTION_GIF_MAPPING).forEach(([command, sourceFileName]) => {
    const sourcePath = path.join(SOURCE_DIR, sourceFileName);
    const targetPath = path.join(TARGET_DIR, `${command}.gif`);
    
    try {
        if (fs.existsSync(sourcePath)) {
            // Read source file
            const fileData = fs.readFileSync(sourcePath);
            
            // Write to target with command name
            fs.writeFileSync(targetPath, fileData);
            console.log(`✅ Successfully mapped '${sourceFileName}' to '${command}.gif'`);
            successCount++;
        } else {
            console.error(`❌ Source file not found: ${sourcePath}`);
            errorCount++;
        }
    } catch (error) {
        console.error(`❌ Error mapping '${command}': ${error.message}`);
        errorCount++;
    }
});

console.log(`\nCORRECTED Reaction GIF mapping complete!`);
console.log(`✅ Successfully mapped: ${successCount} GIFs`);
console.log(`❌ Errors: ${errorCount}`);
console.log(`\nTo use the newly mapped GIFs, restart the WhatsApp bot.`);