/**
 * Startup Verification Utility
 * Performs verification checks during bot startup to ensure everything is properly configured
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const logger = require('./logger');

/**
 * Get all available command files in the commands directory
 * @returns {Promise<Array<string>>} Array of command file paths
 */
async function getAvailableCommandFiles() {
    try {
        const commandsDir = path.join(process.cwd(), 'src', 'commands');
        const dirEntries = await readdir(commandsDir);
        const filePaths = [];
        
        for (const entry of dirEntries) {
            const entryPath = path.join(commandsDir, entry);
            const stats = await stat(entryPath);
            
            if (stats.isFile() && entry.endsWith('.js') && !entry.endsWith('.bak') && !entry.startsWith('_')) {
                filePaths.push(entryPath);
            } else if (stats.isDirectory()) {
                try {
                    const subDirFiles = await readdir(entryPath);
                    for (const subFile of subDirFiles) {
                        if (subFile.endsWith('.js') && !subFile.endsWith('.bak') && !subFile.startsWith('_')) {
                            filePaths.push(path.join(entryPath, subFile));
                        }
                    }
                } catch (err) {
                    logger.error(`Error reading subdirectory ${entry}: ${err.message}`);
                }
            }
        }
        
        return filePaths;
    } catch (error) {
        logger.error(`Error getting command files: ${error.message}`);
        return [];
    }
}

/**
 * Verify the bot's startup requirements
 * @returns {Promise<Object>} Verification results
 */
async function verifyStartupRequirements() {
    // Start timing the verification
    const startTime = Date.now();
    logger.info('Beginning startup verification checks...');
    
    // Check command modules
    const commandFiles = await getAvailableCommandFiles();
    const commandCount = commandFiles.length;
    logger.info(`Found ${commandCount} potential command modules`);
    
    // Check required directories
    const requiredDirs = [
        'auth_info_baileys',
        'data',
        'logs'
    ];
    
    const dirResults = {};
    for (const dir of requiredDirs) {
        dirResults[dir] = fs.existsSync(path.join(process.cwd(), dir));
        if (!dirResults[dir]) {
            try {
                fs.mkdirSync(path.join(process.cwd(), dir), { recursive: true });
                dirResults[dir] = true;
                logger.info(`Created missing directory: ${dir}`);
            } catch (err) {
                logger.error(`Failed to create directory ${dir}: ${err.message}`);
            }
        }
    }
    
    // Check if data/reaction_gifs exists and has files
    const reactionGifsDir = path.join(process.cwd(), 'data', 'reaction_gifs');
    let reactionGifsOk = false;
    let reactionGifsCount = 0;
    
    if (fs.existsSync(reactionGifsDir)) {
        try {
            const files = await readdir(reactionGifsDir);
            reactionGifsCount = files.filter(f => f.endsWith('.gif')).length;
            reactionGifsOk = reactionGifsCount > 0;
        } catch (err) {
            logger.error(`Error checking reaction GIFs: ${err.message}`);
        }
    } else {
        try {
            fs.mkdirSync(reactionGifsDir, { recursive: true });
            logger.info('Created missing directory: data/reaction_gifs');
        } catch (err) {
            logger.error(`Failed to create reaction_gifs directory: ${err.message}`);
        }
    }
    
    // Check session backup directory
    const backupDirOk = fs.existsSync(path.join(process.cwd(), 'auth_info_baileys_backup'));
    
    // Calculate verification duration
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    return {
        commandModules: {
            count: commandCount,
            ok: commandCount > 0
        },
        directories: dirResults,
        reactionGifs: {
            ok: reactionGifsOk,
            count: reactionGifsCount
        },
        backupDir: backupDirOk,
        duration: duration,
        timestamp: new Date().toISOString(),
        success: commandCount > 0 && Object.values(dirResults).every(v => v) && backupDirOk
    };
}

/**
 * Display a formatted verification report in the console
 * @param {Object} results - Verification results
 */
function displayVerificationReport(results) {
    logger.info('='.repeat(50));
    logger.info('BLACKSKY-MD STARTUP VERIFICATION REPORT');
    logger.info('='.repeat(50));
    
    // Command modules
    logger.info(`Command Modules: ${results.commandModules.ok ? '✓' : '✗'} (${results.commandModules.count} found)`);
    
    // Required directories
    logger.info('Required Directories:');
    for (const [dir, exists] of Object.entries(results.directories)) {
        logger.info(`  - ${dir}: ${exists ? '✓' : '✗'}`);
    }
    
    // Reaction GIFs
    logger.info(`Reaction GIFs: ${results.reactionGifs.ok ? '✓' : '✗'} (${results.reactionGifs.count} found)`);
    
    // Backup directory
    logger.info(`Backup Directory: ${results.backupDir ? '✓' : '✗'}`);
    
    // Summary
    logger.info('='.repeat(50));
    logger.info(`Verification completed in ${results.duration.toFixed(2)}s`);
    logger.info(`Overall Status: ${results.success ? 'PASSED' : 'FAILED'}`);
    logger.info('='.repeat(50));
}

module.exports = {
    verifyStartupRequirements,
    displayVerificationReport
};