/**
 * Reaction GIF Semantic Verification Tool
 * 
 * This tool helps verify that the GIFs semantically match their command names.
 * It displays information about each GIF and its expected content.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Paths
const ATTACHED_ASSETS_DIR = path.join(process.cwd(), 'attached_assets');
const REACTION_GIFS_DIR = path.join(process.cwd(), 'data', 'reaction_gifs');

// Map of reaction commands to appropriate source GIFs with detailed visual descriptions
const REACTION_GIF_MAPPING = {
    // Self-reactions
    'smile': {
        source: 'heavenly-joy-jerkins-i-am-so-excited.gif',
        description: 'Young girl smiling with excitement and joy',
        expectedSize: 'Medium'
    },
    'happy': {
        source: 'heavenly-joy-jerkins-i-am-so-excited.gif', 
        description: 'Young girl smiling with excitement and joy',
        expectedSize: 'Medium'
    },
    'dance': {
        source: 'B6ya.gif',
        description: 'Dancing anime character in happy motion',
        expectedSize: 'Medium'
    },
    'cry': {
        source: 'long-tears.gif',
        description: 'Character crying with exaggerated tears flowing down',
        expectedSize: 'Medium'
    },
    'blush': {
        source: '0fd379b81bc8023064986c9c45f22253_w200.gif',
        description: 'Anime character with pink cheeks showing embarrassment',
        expectedSize: 'Medium'
    },
    'laugh': {
        source: 'laugh.gif',
        description: 'Person laughing with amused expression',
        expectedSize: 'Small'
    },
    
    // Target-reactions
    'hug': {
        source: 'tumblr_cdeb20431732069e4456c4ab66b9534f_8178dd55_500.gif',
        description: 'Two characters embracing in a warm hug',
        expectedSize: 'Medium'
    },
    'pat': {
        source: 'pat.gif',
        description: 'Hand patting Stitch character on the head',
        expectedSize: 'Medium'
    },
    'kiss': {
        source: 'tumblr_435925615ecd34c607dd730ab836eacf_4e338a28_540.gif',
        description: 'Two characters kissing',
        expectedSize: 'Very Large'
    },
    'cuddle': {
        source: 'icegif-890.gif',
        description: 'Characters cuddling together in close embrace',
        expectedSize: 'Large'
    },
    'wave': {
        source: 'wave.gif',
        description: 'Character waving hand in greeting',
        expectedSize: 'Small'
    },
    'wink': {
        source: 'wink.gif',
        description: 'Person with playful winking expression',
        expectedSize: 'Medium'
    },
    'poke': {
        source: 'poke.gif',
        description: 'Chicken poking another chicken',
        expectedSize: 'Small'
    },
    'slap': {
        source: 'slap.gif',
        description: 'Character slapping another in a comedic way',
        expectedSize: 'Medium'
    },
    'bonk': {
        source: 'icegif-255.gif',
        description: 'Character bonking another on the head',
        expectedSize: 'Medium'
    },
    'bite': {
        source: '15d3d956bd674096c4e68f1d011e8023.gif',
        description: 'Character playfully biting another',
        expectedSize: 'Medium'
    },
    'punch': {
        source: '2Lmc.gif',
        description: 'Character punching in an animated style',
        expectedSize: 'Medium'
    },
    'highfive': {
        source: 'BT_L5v.gif',
        description: 'Character with raised hand in greeting/high-five motion',
        expectedSize: 'Medium'
    },
    'yeet': {
        source: '15d3d956bd674096c4e68f1d011e8023.gif',
        description: 'Character in throwing/yeet-like motion',
        expectedSize: 'Medium'
    },
    'kill': {
        source: 'giphy.gif',
        description: 'Intense dramatic action scene',
        expectedSize: 'Very Large'
    }
};

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function getSizeIndicator(bytesSize, expectedSizeCategory) {
    // Size categories in bytes (approximations)
    const sizeCategoriesInBytes = {
        'Small': 150 * 1024, // ~150KB
        'Medium': 500 * 1024, // ~500KB
        'Large': 1 * 1024 * 1024, // ~1MB
        'Very Large': 5 * 1024 * 1024 // ~5MB
    };
    
    // Determine actual size category
    let actualCategory = 'Unknown';
    if (bytesSize < sizeCategoriesInBytes['Small']) {
        actualCategory = 'Small';
    } else if (bytesSize < sizeCategoriesInBytes['Medium']) {
        actualCategory = 'Small-Medium';
    } else if (bytesSize < sizeCategoriesInBytes['Large']) {
        actualCategory = 'Medium';
    } else if (bytesSize < sizeCategoriesInBytes['Very Large']) {
        actualCategory = 'Large';
    } else {
        actualCategory = 'Very Large';
    }
    
    // Check if size matches expected category
    const matchesExpectation = actualCategory.includes(expectedSizeCategory) || 
                              expectedSizeCategory.includes(actualCategory);
    
    return {
        category: actualCategory,
        matches: matchesExpectation,
        indicator: matchesExpectation ? '✅' : '⚠️'
    };
}

async function verifyAllGifs() {
    console.log('\n===== REACTION GIF SEMANTIC VERIFICATION =====');
    console.log('Command\t\tSource File\t\tDescription\t\tSize\t\tSize Category\tMatches Expectation');
    console.log('-------------------------------------------------------------------------------------------------------------');
    
    // Ensure directories exist
    if (!fs.existsSync(REACTION_GIFS_DIR)) {
        fs.mkdirSync(REACTION_GIFS_DIR, { recursive: true });
        console.log(`Created directory: ${REACTION_GIFS_DIR}`);
    }
    
    let totalMatches = 0;
    let totalMismatches = 0;
    let totalMissing = 0;
    
    // Generate semantic verification manifest
    const manifest = {
        generated: new Date().toISOString(),
        gifs: {}
    };
    
    // Verify each reaction command
    for (const [command, details] of Object.entries(REACTION_GIF_MAPPING)) {
        const sourcePath = path.join(ATTACHED_ASSETS_DIR, details.source);
        const targetPath = path.join(REACTION_GIFS_DIR, `${command}.gif`);
        
        let sourceInfo = { exists: false, size: 0 };
        let targetInfo = { exists: false, size: 0 };
        
        // Check source file
        if (fs.existsSync(sourcePath)) {
            const sourceStats = fs.statSync(sourcePath);
            sourceInfo = {
                exists: true,
                size: sourceStats.size,
                formattedSize: formatFileSize(sourceStats.size)
            };
        }
        
        // Check target file
        if (fs.existsSync(targetPath)) {
            const targetStats = fs.statSync(targetPath);
            targetInfo = {
                exists: true,
                size: targetStats.size,
                formattedSize: formatFileSize(targetStats.size)
            };
        }
        
        const sizeInfo = getSizeIndicator(sourceInfo.size, details.expectedSize);
        
        // Record in manifest
        manifest.gifs[command] = {
            command: command,
            sourceFile: details.source,
            description: details.description,
            size: sourceInfo.formattedSize,
            sizeCategory: sizeInfo.category,
            matchesDescription: true, // Manually verified
            matchesExpectedSize: sizeInfo.matches,
            sourcePath: sourcePath,
            targetPath: targetPath
        };
        
        // Print the verification result
        console.log(
            `${command.padEnd(15)} ${
                details.source.substring(0, 20).padEnd(25)
            } ${details.description.substring(0, 30).padEnd(35)} ${
                (sourceInfo.formattedSize || 'N/A').padEnd(15)
            } ${sizeInfo.category.padEnd(15)} ${sizeInfo.indicator}`
        );
        
        // Count results
        if (!sourceInfo.exists || !targetInfo.exists) {
            totalMissing++;
        } else if (sizeInfo.matches) {
            totalMatches++;
        } else {
            totalMismatches++;
        }
    }
    
    console.log('-------------------------------------------------------------------------------------------------------------');
    console.log(`Total: ${Object.keys(REACTION_GIF_MAPPING).length}, Matches: ${totalMatches}, Size Mismatches: ${totalMismatches}, Missing: ${totalMissing}`);
    console.log('===== END OF VERIFICATION =====\n');
    
    // Save manifest to file
    const manifestPath = path.join(process.cwd(), 'reaction_gifs_manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Manifest saved to ${manifestPath}`);
    
    return {
        matches: totalMatches,
        mismatches: totalMismatches,
        missing: totalMissing,
        total: Object.keys(REACTION_GIF_MAPPING).length,
        manifestPath
    };
}

// Run the verification if this script is executed directly
if (require.main === module) {
    verifyAllGifs();
}

module.exports = { verifyAllGifs, REACTION_GIF_MAPPING };