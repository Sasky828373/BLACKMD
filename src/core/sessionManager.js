/**
 * Session Manager
 * Manages WhatsApp session persistence with automated backups
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { ensureDirectoryExists, fileExists, copyFile } = require('../utils/fileUtils');

// Constants
const DEFAULT_AUTH_FOLDER = './auth_info_baileys';
const DEFAULT_BACKUP_FOLDER = './auth_info_baileys_backup';
const BACKUP_INTERVAL = 15 * 60 * 1000; // 15 minutes
const MAX_BACKUPS = 10; // Maximum number of backup sets to keep

class SessionManager {
    constructor(options = {}) {
        this.authFolder = options.authFolder || DEFAULT_AUTH_FOLDER;
        this.backupFolder = options.backupFolder || DEFAULT_BACKUP_FOLDER;
        this.backupInterval = options.backupInterval || BACKUP_INTERVAL;
        this.maxBackups = options.maxBackups || MAX_BACKUPS;
        this.backupTimer = null;
        
        // Ensure folders exist
        ensureDirectoryExists(this.authFolder);
        ensureDirectoryExists(this.backupFolder);
    }

    /**
     * Initialize session manager and start scheduled backups
     * @returns {Promise<boolean>} Success status
     */
    async initialize() {
        try {
            logger.info('Initializing session manager...');
            
            // Create initial backup if auth files exist
            if (fs.existsSync(this.authFolder)) {
                const files = fs.readdirSync(this.authFolder);
                if (files.length > 0) {
                    await this.backupSession();
                }
            }
            
            // Set up scheduled backups
            this.startScheduledBackups();
            
            logger.info('Session manager initialized successfully');
            return true;
        } catch (error) {
            logger.error('Error initializing session manager:', error);
            return false;
        }
    }

    /**
     * Start scheduled backups
     */
    startScheduledBackups() {
        if (this.backupTimer) {
            clearInterval(this.backupTimer);
        }
        
        this.backupTimer = setInterval(async () => {
            await this.backupSession();
        }, this.backupInterval);
        
        logger.info(`Scheduled backups set up (interval: ${this.backupInterval / 60000} minutes)`);
    }

    /**
     * Stop scheduled backups
     */
    stopScheduledBackups() {
        if (this.backupTimer) {
            clearInterval(this.backupTimer);
            this.backupTimer = null;
            logger.info('Scheduled backups stopped');
        }
    }

    /**
     * Create a backup of the current session
     * @returns {Promise<Object>} Backup result with details
     */
    async backupSession() {
        try {
            logger.info('Creating session backup...');
            
            const timestamp = Date.now();
            const backupDir = path.join(this.backupFolder, `backup_${timestamp}`);
            
            // Create backup directory
            ensureDirectoryExists(backupDir);
            
            // Get all files in auth folder
            const files = fs.readdirSync(this.authFolder);
            let copiedFiles = 0;
            const checksums = {};
            
            // Copy each file and calculate checksums
            for (const file of files) {
                if (file === '.DS_Store' || file === 'Thumbs.db') continue;
                
                const srcPath = path.join(this.authFolder, file);
                const destPath = path.join(backupDir, file);
                
                // Skip directories
                if (fs.statSync(srcPath).isDirectory()) continue;
                
                // Copy file
                if (copyFile(srcPath, destPath)) {
                    copiedFiles++;
                    checksums[file] = this.calculateChecksum(srcPath);
                }
            }
            
            // Create checksums file
            if (copiedFiles > 0) {
                const checksumPath = path.join(backupDir, 'checksums.json');
                fs.writeFileSync(checksumPath, JSON.stringify(checksums, null, 2));
                
                logger.info(`Backup created successfully (${copiedFiles} files) at ${backupDir}`);
                
                // Clean up old backups
                await this.cleanupOldBackups();
                
                return {
                    success: true,
                    timestamp,
                    location: backupDir,
                    fileCount: copiedFiles
                };
            } else {
                // No files were copied, clean up empty directory
                try {
                    fs.rmdirSync(backupDir);
                } catch (rmError) {
                    logger.warn('Error removing empty backup directory:', rmError);
                }
                
                logger.warn('No files copied during backup');
                return {
                    success: false,
                    reason: 'No files to backup'
                };
            }
        } catch (error) {
            logger.error('Error backing up session:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Calculate file checksum
     * @param {string} filePath Path to file
     * @returns {string|null} SHA-256 checksum or null if error
     */
    calculateChecksum(filePath) {
        try {
            const fileBuffer = fs.readFileSync(filePath);
            const hashSum = crypto.createHash('sha256');
            hashSum.update(fileBuffer);
            return hashSum.digest('hex');
        } catch (error) {
            logger.error(`Error calculating checksum for ${filePath}:`, error);
            return null;
        }
    }

    /**
     * Clean up old backups, keeping only the most recent ones
     * @returns {Promise<number>} Number of removed backups
     */
    async cleanupOldBackups() {
        try {
            // Get all backup directories
            const dirs = fs.readdirSync(this.backupFolder)
                .filter(name => name.startsWith('backup_'))
                .map(name => ({
                    name,
                    path: path.join(this.backupFolder, name),
                    timestamp: parseInt(name.replace('backup_', '')) || 0
                }))
                .sort((a, b) => b.timestamp - a.timestamp); // Sort newest first
            
            // Keep only the newest maxBackups
            const toRemove = dirs.slice(this.maxBackups);
            
            for (const dir of toRemove) {
                await this.removeBackupDirectory(dir.path);
            }
            
            if (toRemove.length > 0) {
                logger.info(`Cleaned up ${toRemove.length} old backup(s)`);
            }
            
            return toRemove.length;
        } catch (error) {
            logger.error('Error cleaning up old backups:', error);
            return 0;
        }
    }

    /**
     * Remove a backup directory and all its files
     * @param {string} dirPath Path to directory
     * @returns {Promise<boolean>} Success status
     */
    async removeBackupDirectory(dirPath) {
        try {
            // Get all files in directory
            const files = fs.readdirSync(dirPath);
            
            // Delete each file
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                fs.unlinkSync(filePath);
            }
            
            // Delete directory
            fs.rmdirSync(dirPath);
            return true;
        } catch (error) {
            logger.error(`Error removing backup directory ${dirPath}:`, error);
            return false;
        }
    }

    /**
     * Restore session from a specific backup
     * @param {string|null} backupDir Specific backup directory or null for latest
     * @returns {Promise<Object>} Restoration result
     */
    async restoreSession(backupDir = null) {
        try {
            // If no backup specified, use the latest one
            if (!backupDir) {
                const latestBackup = this.getLatestBackup();
                if (!latestBackup) {
                    logger.error('No backups found to restore from');
                    return {
                        success: false,
                        reason: 'No backups available'
                    };
                }
                backupDir = latestBackup.path;
            }
            
            // Ensure backup directory exists
            if (!fs.existsSync(backupDir)) {
                logger.error(`Backup directory not found: ${backupDir}`);
                return {
                    success: false,
                    reason: 'Backup directory not found'
                };
            }
            
            logger.info(`Restoring session from backup: ${backupDir}`);
            
            // Backup current session first
            const backupResult = await this.backupSession();
            
            if (!backupResult.success) {
                logger.warn('Pre-restore backup failed, proceeding with restore anyway');
            }
            
            // Get all files in backup directory
            const files = fs.readdirSync(backupDir)
                .filter(file => file !== 'checksums.json');
            
            let restoredFiles = 0;
            
            // Copy each file from backup to auth folder
            for (const file of files) {
                const srcPath = path.join(backupDir, file);
                const destPath = path.join(this.authFolder, file);
                
                // Skip directories
                if (fs.statSync(srcPath).isDirectory()) continue;
                
                // Copy file
                if (copyFile(srcPath, destPath)) {
                    restoredFiles++;
                }
            }
            
            logger.info(`Session restored successfully (${restoredFiles} files)`);
            
            return {
                success: true,
                restoredFiles,
                source: backupDir
            };
        } catch (error) {
            logger.error('Error restoring session:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get the latest backup
     * @returns {Object|null} Latest backup info or null if none found
     */
    getLatestBackup() {
        try {
            if (!fs.existsSync(this.backupFolder)) {
                return null;
            }
            
            // Get all backup directories
            const dirs = fs.readdirSync(this.backupFolder)
                .filter(name => name.startsWith('backup_'))
                .map(name => ({
                    name,
                    path: path.join(this.backupFolder, name),
                    timestamp: parseInt(name.replace('backup_', '')) || 0
                }))
                .sort((a, b) => b.timestamp - a.timestamp); // Sort newest first
            
            if (dirs.length === 0) {
                return null;
            }
            
            return dirs[0];
        } catch (error) {
            logger.error('Error getting latest backup:', error);
            return null;
        }
    }

    /**
     * Get list of all available backups
     * @returns {Array} List of backup info objects
     */
    getBackups() {
        try {
            if (!fs.existsSync(this.backupFolder)) {
                return [];
            }
            
            // Get all backup directories
            return fs.readdirSync(this.backupFolder)
                .filter(name => name.startsWith('backup_'))
                .map(name => {
                    const dirPath = path.join(this.backupFolder, name);
                    const timestamp = parseInt(name.replace('backup_', '')) || 0;
                    const date = new Date(timestamp);
                    
                    // Count files in backup
                    let fileCount = 0;
                    try {
                        fileCount = fs.readdirSync(dirPath).length;
                    } catch (e) {
                        // Ignore errors
                    }
                    
                    return {
                        name,
                        path: dirPath,
                        timestamp,
                        date: date.toISOString(),
                        fileCount
                    };
                })
                .sort((a, b) => b.timestamp - a.timestamp); // Sort newest first
        } catch (error) {
            logger.error('Error listing backups:', error);
            return [];
        }
    }

    /**
     * Verify a specific backup for integrity
     * @param {string} backupDir Path to backup directory
     * @returns {Promise<Object>} Verification result
     */
    async verifyBackup(backupDir) {
        try {
            // Ensure backup directory exists
            if (!fs.existsSync(backupDir)) {
                return {
                    success: false,
                    reason: 'Backup directory not found'
                };
            }
            
            // Check if checksums file exists
            const checksumPath = path.join(backupDir, 'checksums.json');
            if (!fs.existsSync(checksumPath)) {
                return {
                    success: false,
                    reason: 'Checksums file not found'
                };
            }
            
            // Load checksums
            const checksums = JSON.parse(fs.readFileSync(checksumPath, 'utf8'));
            
            // Verify each file
            const results = {
                total: Object.keys(checksums).length,
                verified: 0,
                missing: [],
                corrupted: []
            };
            
            for (const [file, expectedChecksum] of Object.entries(checksums)) {
                const filePath = path.join(backupDir, file);
                
                // Check if file exists
                if (!fs.existsSync(filePath)) {
                    results.missing.push(file);
                    continue;
                }
                
                // Verify checksum
                const actualChecksum = this.calculateChecksum(filePath);
                if (actualChecksum !== expectedChecksum) {
                    results.corrupted.push(file);
                } else {
                    results.verified++;
                }
            }
            
            // Determine overall result
            results.success = results.missing.length === 0 && results.corrupted.length === 0;
            
            return results;
        } catch (error) {
            logger.error(`Error verifying backup ${backupDir}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Create singleton instance
const sessionManager = new SessionManager();

module.exports = {
    SessionManager,
    sessionManager
};