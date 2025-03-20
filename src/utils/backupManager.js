/**
 * Enhanced Backup Manager for WhatsApp Session Credentials
 * Provides robust persistence for 24/7 operation
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const cron = require('node-cron');
const logger = require('./logger');

// Session identifier - using a fixed value ensures consistency across restarts
const SESSION_ID = process.env.SESSION_ID || 'BlackskyMD';

// Backup directories - using multiple locations for redundancy
const BACKUP_DIRS = [
    './backups',
    './auth_info_baileys_backup',
    './data/session_backups'
];

/**
 * Create a backup of the current WhatsApp session
 * @param {Object} creds - The credentials object from Baileys
 * @returns {Promise<boolean>} - Success status
 */
async function createBackup(creds) {
    try {
        if (!creds) {
            logger.error('No credentials provided for backup');
            return false;
        }

        // Create backup directories if they don't exist
        for (const dir of BACKUP_DIRS) {
            await fs.mkdir(dir, { recursive: true });
        }

        const timestamp = Date.now();
        const checksum = calculateChecksum(JSON.stringify(creds));
        
        // Create metadata object with verification info
        const backupMeta = {
            timestamp,
            checksum,
            session: SESSION_ID,
            version: '1.0'
        };
        
        // Save the backup to all locations for redundancy
        for (const dir of BACKUP_DIRS) {
            try {
                // Save timestamped backup
                const backupPath = path.join(dir, `creds_backup_${timestamp}.json`);
                await fs.writeFile(
                    backupPath,
                    JSON.stringify({ creds, meta: backupMeta }, null, 2)
                );
                
                // Also save as latest for easy recovery
                const latestPath = path.join(dir, 'latest_creds.json');
                await fs.writeFile(
                    latestPath,
                    JSON.stringify({ creds, meta: backupMeta }, null, 2)
                );
                
                logger.info(`Backup saved to ${backupPath}`);
            } catch (dirErr) {
                logger.error(`Failed to save backup to ${dir}:`, dirErr);
            }
        }
        
        // Clean up old backups to prevent excessive storage use
        await cleanupOldBackups();
        
        return true;
    } catch (error) {
        logger.error('Error creating backup:', error);
        return false;
    }
}

/**
 * Calculate a checksum for data verification
 * @param {string} data - Data to hash
 * @returns {string} - SHA-256 hash
 */
function calculateChecksum(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Clean up old backup files to prevent excessive storage use
 */
async function cleanupOldBackups() {
    try {
        const MAX_BACKUPS_PER_DIR = 10;
        
        for (const dir of BACKUP_DIRS) {
            try {
                const files = await fs.readdir(dir);
                const backupFiles = files.filter(file => 
                    file.startsWith('creds_backup_') && file.endsWith('.json')
                );
                
                if (backupFiles.length > MAX_BACKUPS_PER_DIR) {
                    // Sort by name (which includes timestamp)
                    backupFiles.sort();
                    
                    // Remove oldest files, keeping MAX_BACKUPS_PER_DIR
                    const filesToRemove = backupFiles.slice(0, backupFiles.length - MAX_BACKUPS_PER_DIR);
                    
                    for (const file of filesToRemove) {
                        await fs.unlink(path.join(dir, file));
                        logger.debug(`Removed old backup: ${file}`);
                    }
                }
            } catch (dirErr) {
                // Continue to next directory
            }
        }
    } catch (error) {
        logger.error('Error cleaning up old backups:', error);
    }
}

/**
 * Restore credentials from available backups
 * @returns {Promise<Object|null>} - Restored credentials or null if not found
 */
async function restoreBackup() {
    try {
        // Try each backup location in order
        for (const dir of BACKUP_DIRS) {
            try {
                // Check if directory exists
                try {
                    await fs.access(dir);
                } catch {
                    continue; // Skip to next directory if this one doesn't exist
                }
                
                // First try the "latest" file
                const latestPath = path.join(dir, 'latest_creds.json');
                try {
                    const data = await fs.readFile(latestPath, 'utf8');
                    const parsed = JSON.parse(data);
                    
                    // Verify checksum if available
                    if (parsed.meta && parsed.meta.checksum) {
                        const calculatedChecksum = calculateChecksum(JSON.stringify(parsed.creds));
                        if (calculatedChecksum !== parsed.meta.checksum) {
                            logger.warn(`Checksum verification failed for ${latestPath}`);
                            continue;
                        }
                    }
                    
                    logger.info(`Restored from ${latestPath}`);
                    return parsed.creds;
                } catch (latestErr) {
                    // Latest file not found or invalid, try timestamped backups
                }
                
                // Find all timestamped backups
                const files = await fs.readdir(dir);
                const backupFiles = files
                    .filter(file => file.startsWith('creds_backup_') && file.endsWith('.json'))
                    .sort()
                    .reverse(); // Newest first
                
                if (backupFiles.length > 0) {
                    // Try each backup file until we find a valid one
                    for (const file of backupFiles) {
                        try {
                            const filePath = path.join(dir, file);
                            const data = await fs.readFile(filePath, 'utf8');
                            const parsed = JSON.parse(data);
                            
                            // Return the first valid backup we find
                            logger.info(`Restored from backup: ${filePath}`);
                            return parsed.creds || parsed; // Handle both new and old format
                        } catch (fileErr) {
                            // Continue to next file
                        }
                    }
                }
            } catch (dirErr) {
                // Continue to next directory
            }
        }
        
        // If we get here, no valid backup was found
        logger.warn('No valid backup found in any location');
        return null;
    } catch (error) {
        logger.error('Error restoring backup:', error);
        return null;
    }
}

/**
 * Set up automatic scheduled backups
 * @param {Function} getCredsFunction - Function that returns current credentials
 */
function setupScheduledBackups(getCredsFunction) {
    if (!getCredsFunction || typeof getCredsFunction !== 'function') {
        logger.error('Invalid credentials function provided for scheduled backups');
        return false;
    }
    
    // Schedule backup every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
        try {
            const creds = await getCredsFunction();
            if (creds) {
                await createBackup(creds);
                logger.info('Scheduled backup completed successfully');
            }
        } catch (error) {
            logger.error('Scheduled backup failed:', error);
        }
    });
    
    logger.info('Automatic backup schedule configured (every 15 minutes)');
    return true;
}

module.exports = {
    createBackup,
    restoreBackup,
    setupScheduledBackups,
    SESSION_ID
};