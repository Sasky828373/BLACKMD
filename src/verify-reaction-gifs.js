/**
 * Reaction GIF Verification Tool
 * 
 * This script verifies each reaction GIF and helps identify which GIF is being used for each command.
 * It will create a manifest file that can be used to manually verify each GIF.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const REACTIONS_DIR = path.join(process.cwd(), 'data', 'reaction_gifs');
const SOURCE_DIR = path.join(process.cwd(), 'attached_assets');
const MANIFEST_PATH = path.join(process.cwd(), 'reaction_gifs_manifest.json');

// List of reaction commands
const reactionCommands = [
    'hug', 'kiss', 'slap', 'cry', 'dance', 'happy', 'kill', 'cuddle', 
    'punch', 'smile', 'wave', 'pat', 'laugh', 'blush', 'wink', 'poke',
    'bonk', 'bite', 'highfive', 'yeet'
];

// Calculate file hash (MD5) for identification
function calculateFileHash(filePath) {
    try {
        const fileBuffer = fs.readFileSync(filePath);
        return crypto.createHash('md5').update(fileBuffer).digest('hex');
    } catch (error) {
        console.error(`Error calculating hash for ${filePath}: ${error.message}`);
        return 'unknown';
    }
}

// Get file size in readable format
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
    else return (bytes / 1048576).toFixed(2) + ' MB';
}

// Map source files for reference
function mapSourceFiles() {
    const sourceMap = {};
    
    try {
        const files = fs.readdirSync(SOURCE_DIR);
        
        for (const file of files) {
            if (file.endsWith('.gif')) {
                const filePath = path.join(SOURCE_DIR, file);
                const hash = calculateFileHash(filePath);
                const stats = fs.statSync(filePath);
                
                sourceMap[hash] = {
                    filename: file,
                    size: stats.size,
                    readableSize: formatFileSize(stats.size)
                };
            }
        }
        
        return sourceMap;
    } catch (error) {
        console.error(`Error mapping source files: ${error.message}`);
        return {};
    }
}

// Verify reaction GIFs
function verifyReactionGifs() {
    const sourceMap = mapSourceFiles();
    const manifest = {};
    
    console.log('Starting reaction GIF verification...');
    console.log(`Source directory: ${SOURCE_DIR}`);
    console.log(`Reaction GIFs directory: ${REACTIONS_DIR}`);
    
    if (Object.keys(sourceMap).length === 0) {
        console.error('No source GIFs found for comparison!');
    } else {
        console.log(`Found ${Object.keys(sourceMap).length} source GIFs for comparison`);
    }
    
    // Verify each reaction command
    for (const command of reactionCommands) {
        const gifPath = path.join(REACTIONS_DIR, `${command}.gif`);
        
        if (fs.existsSync(gifPath)) {
            const stats = fs.statSync(gifPath);
            const hash = calculateFileHash(gifPath);
            const sourceInfo = sourceMap[hash] || { filename: 'unknown', size: 0 };
            
            manifest[command] = {
                path: gifPath,
                size: stats.size,
                readableSize: formatFileSize(stats.size),
                hash: hash,
                sourceFile: sourceInfo.filename,
                matchesSource: !!sourceMap[hash]
            };
            
            const matchStatus = manifest[command].matchesSource ? '✅' : '❌';
            console.log(`${matchStatus} ${command}: ${manifest[command].readableSize} - Source: ${manifest[command].sourceFile}`);
        } else {
            manifest[command] = {
                path: gifPath,
                exists: false,
                error: 'File not found'
            };
            
            console.error(`❌ ${command}: GIF not found at ${gifPath}`);
        }
    }
    
    // Save manifest for reference
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    console.log(`\nManifest saved to: ${MANIFEST_PATH}`);
    
    // Provide manual fix instructions
    console.log('\nTo fix GIF mappings:');
    console.log('1. Open the manifest file to see which GIF is assigned to each command');
    console.log('2. Manually copy source GIFs to the correct reaction GIF files');
}

// Run verification
verifyReactionGifs();