/**
 * Session Handler
 * Manages WhatsApp sessions, authentication, and persistent connections
 * Enhanced with features from popular MD bots
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

class SessionHandler {
    constructor(config = {}) {
        this.config = {
            sessionsDir: './sessions',
            backupDir: './session_backups',
            backupInterval: 6 * 60 * 60 * 1000, // 6 hours
            maxBackups: 5,
            sessionValidityDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
            ...config
        };

        this.sessions = new Map();
        this.setupDirectories();
        this.startBackupInterval();
        this.validateExistingSessions();
    }

    setupDirectories() {
        [this.config.sessionsDir, this.config.backupDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                logger.info(`Created directory: ${dir}`);
            }
        });
    }

    async validateExistingSessions() {
        try {
            const files = fs.readdirSync(this.config.sessionsDir);
            for (const file of files) {
                if (!file.endsWith('.json')) continue;

                const sessionPath = path.join(this.config.sessionsDir, file);
                try {
                    const data = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
                    const age = Date.now() - (data.created || 0);

                    if (age > this.config.sessionValidityDuration) {
                        logger.warn(`Session ${file} expired, moving to backup`);
                        await this.archiveSession(file);
                    } else {
                        // Validate session data structure
                        if (!this.isValidSessionData(data)) {
                            logger.warn(`Session ${file} has invalid structure, attempting repair`);
                            if (!await this.repairSession(file, data)) {
                                await this.archiveSession(file);
                            }
                        }
                    }
                } catch (error) {
                    logger.error(`Error validating session ${file}:`, error);
                    await this.archiveSession(file);
                }
            }
        } catch (error) {
            logger.error('Error during session validation:', error);
        }
    }

    isValidSessionData(data) {
        return data && 
               typeof data === 'object' && 
               'id' in data && 
               'created' in data && 
               'authKey' in data;
    }

    async repairSession(filename, data) {
        try {
            const repairedData = {
                id: data.id || path.parse(filename).name,
                created: data.created || Date.now(),
                authKey: data.authKey || crypto.randomBytes(32).toString('hex'),
                lastRepaired: Date.now()
            };

            const sessionPath = path.join(this.config.sessionsDir, filename);
            fs.writeFileSync(sessionPath, JSON.stringify(repairedData, null, 2));
            logger.info(`Repaired session: ${filename}`);
            return true;
        } catch (error) {
            logger.error(`Failed to repair session ${filename}:`, error);
            return false;
        }
    }

    async archiveSession(filename) {
        try {
            const source = path.join(this.config.sessionsDir, filename);
            const archiveDir = path.join(this.config.backupDir, 'archived_sessions');

            if (!fs.existsSync(archiveDir)) {
                fs.mkdirSync(archiveDir, { recursive: true });
            }

            const destination = path.join(archiveDir, `${filename}.${Date.now()}`);
            fs.renameSync(source, destination);
            logger.info(`Archived invalid session: ${filename}`);
        } catch (error) {
            logger.error(`Failed to archive session ${filename}:`, error);
        }
    }

    async createSession(sessionId, options = {}) {
        try {
            const sessionPath = path.join(this.config.sessionsDir, `${sessionId}.json`);

            // Generate unique authentication data
            const authData = {
                id: sessionId,
                created: Date.now(),
                authKey: crypto.randomBytes(32).toString('hex'),
                deviceId: crypto.randomBytes(16).toString('hex'),
                platform: options.platform || 'android',
                ...options
            };

            // Save session data
            fs.writeFileSync(sessionPath, JSON.stringify(authData, null, 2));
            this.sessions.set(sessionId, authData);

            // Create immediate backup
            await this.backupSessions();

            logger.info(`Created new session: ${sessionId}`);
            return authData;

        } catch (error) {
            logger.error(`Error creating session ${sessionId}:`, error);
            throw error;
        }
    }

    async loadSession(sessionId) {
        try {
            const sessionPath = path.join(this.config.sessionsDir, `${sessionId}.json`);

            if (!fs.existsSync(sessionPath)) {
                logger.warn(`Session ${sessionId} not found`);
                return null;
            }

            const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

            // Validate session data
            if (!this.isValidSessionData(sessionData)) {
                logger.warn(`Session ${sessionId} data is invalid, attempting repair`);
                if (!await this.repairSession(`${sessionId}.json`, sessionData)) {
                    return null;
                }
            }

            this.sessions.set(sessionId, sessionData);
            logger.info(`Loaded session: ${sessionId}`);
            return sessionData;

        } catch (error) {
            logger.error(`Error loading session ${sessionId}:`, error);
            throw error;
        }
    }

    async updateSession(sessionId, updates) {
        try {
            const sessionPath = path.join(this.config.sessionsDir, `${sessionId}.json`);

            if (!this.sessions.has(sessionId)) {
                throw new Error(`Session ${sessionId} not found`);
            }

            const currentData = this.sessions.get(sessionId);
            const updatedData = {
                ...currentData,
                ...updates,
                lastUpdated: Date.now()
            };

            // Create backup before update
            const backupPath = `${sessionPath}.backup`;
            fs.copyFileSync(sessionPath, backupPath);

            try {
                fs.writeFileSync(sessionPath, JSON.stringify(updatedData, null, 2));
                this.sessions.set(sessionId, updatedData);
                fs.unlinkSync(backupPath); // Remove backup after successful update
            } catch (error) {
                // Restore from backup if update fails
                fs.copyFileSync(backupPath, sessionPath);
                fs.unlinkSync(backupPath);
                throw error;
            }

            logger.info(`Updated session: ${sessionId}`);
            return updatedData;

        } catch (error) {
            logger.error(`Error updating session ${sessionId}:`, error);
            throw error;
        }
    }

    async deleteSession(sessionId) {
        try {
            const sessionPath = path.join(this.config.sessionsDir, `${sessionId}.json`);

            if (fs.existsSync(sessionPath)) {
                // Archive instead of delete
                await this.archiveSession(`${sessionId}.json`);
            }

            this.sessions.delete(sessionId);
            logger.info(`Deleted session: ${sessionId}`);

        } catch (error) {
            logger.error(`Error deleting session ${sessionId}:`, error);
            throw error;
        }
    }

    async backupSessions() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(this.config.backupDir, `backup_${timestamp}`);

            fs.mkdirSync(backupPath, { recursive: true });

            // Copy all session files with verification
            const sessionFiles = fs.readdirSync(this.config.sessionsDir);
            for (const file of sessionFiles) {
                if (!file.endsWith('.json')) continue;

                const sourcePath = path.join(this.config.sessionsDir, file);
                const targetPath = path.join(backupPath, file);

                try {
                    // Read and validate source file
                    const sourceData = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
                    if (!this.isValidSessionData(sourceData)) {
                        logger.warn(`Skipping backup of invalid session: ${file}`);
                        continue;
                    }

                    fs.copyFileSync(sourcePath, targetPath);

                    // Verify backup integrity
                    const backupData = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
                    if (JSON.stringify(sourceData) !== JSON.stringify(backupData)) {
                        throw new Error('Backup verification failed');
                    }
                } catch (error) {
                    logger.error(`Error backing up session ${file}:`, error);
                }
            }

            // Cleanup old backups
            await this.cleanupOldBackups();

            logger.info(`Created session backup: ${timestamp}`);

        } catch (error) {
            logger.error('Error creating session backup:', error);
        }
    }

    async cleanupOldBackups() {
        try {
            const backups = fs.readdirSync(this.config.backupDir)
                .filter(dir => dir.startsWith('backup_'))
                .map(dir => ({
                    name: dir,
                    time: fs.statSync(path.join(this.config.backupDir, dir)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time);

            // Keep only the specified number of recent backups
            if (backups.length > this.config.maxBackups) {
                for (const backup of backups.slice(this.config.maxBackups)) {
                    const backupPath = path.join(this.config.backupDir, backup.name);
                    fs.rmSync(backupPath, { recursive: true, force: true });
                    logger.info(`Removed old backup: ${backup.name}`);
                }
            }

        } catch (error) {
            logger.error('Error cleaning up old backups:', error);
        }
    }

    startBackupInterval() {
        setInterval(() => this.backupSessions(), this.config.backupInterval);
        logger.info(`Scheduled automatic backups every ${this.config.backupInterval / (60 * 60 * 1000)} hours`);
    }

    getActiveSessions() {
        return Array.from(this.sessions.entries()).map(([id, data]) => ({
            id,
            created: new Date(data.created).toISOString(),
            lastUpdated: data.lastUpdated ? new Date(data.lastUpdated).toISOString() : null,
            platform: data.platform || 'unknown',
            deviceId: data.deviceId || 'unknown'
        }));
    }

    getSessionStats() {
        const totalSessions = this.sessions.size;
        const activeSessions = Array.from(this.sessions.values())
            .filter(s => Date.now() - (s.lastUpdated || s.created) < 24 * 60 * 60 * 1000).length;

        return {
            total: totalSessions,
            active: activeSessions,
            inactive: totalSessions - activeSessions,
            oldestSession: Math.min(...Array.from(this.sessions.values()).map(s => s.created)),
            newestSession: Math.max(...Array.from(this.sessions.values()).map(s => s.created))
        };
    }
}

module.exports = SessionHandler;