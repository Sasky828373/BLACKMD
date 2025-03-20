/**
 * Reaction GIF Fixer
 * 
 * This script fixes the issue with reaction GIFs not matching the correct commands.
 * It maps the appropriate GIFs to each reaction command based on content.
 */

const fs = require('fs');
const path = require('path');

// Map of reaction commands to appropriate source GIFs
const REACTION_GIF_MAPPING = {
    'hug': 'tumblr_cdeb20431732069e4456c4ab66b9534f_8178dd55_500.gif',
    'kiss': 'tumblr_435925615ecd34c607dd730ab836eacf_4e338a28_540.gif',
    'slap': 'slap.gif',
    'cry': 'long-tears.gif',
    'dance': 'B6ya.gif',
    'happy': 'heavenly-joy-jerkins-i-am-so-excited.gif',
    'kill': 'giphy.gif',
    'cuddle': 'icegif-890.gif',
    'punch': '2Lmc.gif',
    'smile': 'tumblr_435925615ecd34c607dd730ab836eacf_4e338a28_540.gif',
    'wave': 'BT_L5v.gif',
    'pat': 'cbfd2a06c6d350e19a0c173dec8dccde.gif',
    'laugh': '200w.gif',
    'blush': '0fd379b81bc8023064986c9c45f22253_w200.gif',
    'wink': '21R.gif',
    'poke': '1fg1og.gif',
    'bonk': 'icegif-255.gif',
    'bite': '15d3d956bd674096c4e68f1d011e8023.gif',
    'highfive': 'BT_L5v.gif',
    'yeet': '15d3d956bd674096c4e68f1d011e8023.gif'
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

console.log('Starting reaction GIF mapping fix...');
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

console.log(`\nReaction GIF mapping complete!`);
console.log(`✅ Successfully mapped: ${successCount} GIFs`);
console.log(`❌ Errors: ${errorCount}`);
console.log(`\nTo use the newly mapped GIFs, restart the WhatsApp bot.`);