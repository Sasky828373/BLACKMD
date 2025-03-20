/**
 * Enhanced WhatsApp Connection Handler
 * Fixes "data argument must be Buffer" error in Baileys 
 * and provides reliable connection management
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const logger = require('../utils/logger');

class ConnectionManager {
    constructor(config = {}) {
        // Default configuration
        this.config = {
            authDir: './auth_info_baileys',
            printQR: true,
            browser: ['BLACKSKY-MD', 'Chrome', '110.0.0'],
            maxRetries: 10,
            reconnectInterval: 3000,
            ...config
        };

        // State variables
        this.socket = null;
        this.retryCount = 0;
        this.qrDisplayCount = 0;
        this.connectionState = 'disconnected';
        this.isConnecting = false;
        this.messageHandler = null;
        this.startTime = Date.now();
        
        // Ensure necessary directories exist
        this.setupDirectories();
    }

    setupDirectories() {
        const directories = [
            this.config.authDir,
            './backups',
            './auth_info_baileys_backup',
            './data/session_backups'
        ];

        directories.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                logger.info(`Created directory: ${dir}`);
            }
        });
    }

    /**
     * Connect to WhatsApp with enhanced error handling
     * @param {Function} messageHandler - Function to handle incoming messages
     * @returns {Promise<Object>} WhatsApp socket connection
     */
    async connect(messageHandler) {
        if (this.isConnecting) {
            logger.warn('Connection attempt already in progress');
            return null;
        }

        try {
            this.isConnecting = true;
            this.connectionState = 'connecting';
            this.messageHandler = messageHandler;

            logger.info('Initializing WhatsApp connection...');

            // Clean the auth state directory to fix connection issues
            await this.cleanAuthState();

            // Initialize auth state
            const { state, saveCreds } = await useMultiFileAuthState(this.config.authDir);
            
            // Try to restore from backup if state is incomplete
            if (!state.creds || !state.creds.me || !state.creds.myAppStateKeyId) {
                logger.info('Credentials appear incomplete, attempting to restore from backup');
                await this.restoreFromBackup(state);
            }

            // Fetch latest baileys version
            const { version } = await fetchLatestBaileysVersion();
            logger.info(`Using WhatsApp Web version: ${version.join('.')}`);

            // Configure socket with fixed settings 
            this.socket = makeWASocket({
                auth: state,
                printQRInTerminal: this.config.printQR,
                logger: logger,
                browser: this.config.browser,
                version: version,
                
                // These options help prevent the TypeError
                getMessage: async () => undefined,
                patchMessageBeforeSending: (message) => message,
                
                // Connection stability improvements
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 10000,
                retryRequestDelayMs: 2000,
                defaultQueryTimeoutMs: 60000,
                emitOwnEvents: false,
                fireInitQueries: true,
                
                // Key storage improvements
                keys: {
                    get: async (key) => {
                        try {
                            const data = state.keys[key];
                            return data;
                        } catch (error) {
                            logger.error(`Error accessing key ${key}:`, error);
                            return undefined;
                        }
                    },
                    set: async (key, data) => {
                        try {
                            state.keys[key] = data;
                            return true;
                        } catch (error) {
                            logger.error(`Error setting key ${key}:`, error);
                            return false;
                        }
                    }
                }
            });

            // Handle connection events
            this.socket.ev.on('connection.update', (update) => {
                this.handleConnectionUpdate(update, saveCreds);
            });

            // Handle credential updates
            this.socket.ev.on('creds.update', async () => {
                try {
                    await saveCreds();
                    // Backup credentials after saving
                    this.backupCredentials();
                    logger.info('Credentials updated and backed up');
                } catch (error) {
                    logger.error('Failed to save credentials:', error);
                }
            });

            // Handle messages if a handler is provided
            if (messageHandler && typeof messageHandler === 'function') {
                this.socket.ev.on('messages.upsert', async (m) => {
                    if (m.type === 'notify') {
                        try {
                            for (const msg of m.messages) {
                                await messageHandler(this.socket, msg);
                            }
                        } catch (error) {
                            logger.error('Error in message handler:', error);
                        }
                    }
                });
            }

            return this.socket;
            
        } catch (error) {
            logger.error('Connection error:', error);
            this.connectionState = 'error';
            this.isConnecting = false;
            
            // Retry connection with delay
            if (this.retryCount < this.config.maxRetries) {
                this.retryCount++;
                const delay = Math.min(
                    this.config.reconnectInterval * Math.pow(1.5, this.retryCount - 1), 
                    60000
                );
                
                logger.info(`Retrying connection in ${delay/1000}s (Attempt ${this.retryCount}/${this.config.maxRetries})...`);
                
                setTimeout(() => this.connect(messageHandler), delay);
            } else {
                logger.error('Maximum retry attempts reached. Please check your connection and try again.');
            }
            
            return null;
        }
    }

    /**
     * Handle connection updates from Baileys
     * @param {Object} update Connection update event
     * @param {Function} saveCreds Credentials save function
     */
    handleConnectionUpdate(update, saveCreds) {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            this.qrDisplayCount++;
            this.connectionState = 'qr';
            logger.info(`QR code received (Attempt ${this.qrDisplayCount})`);
            
            if (this.config.printQR) {
                qrcode.generate(qr, { small: true });
                logger.info('Scan the QR code above with your WhatsApp app.');
            }
            
            return;
        }
        
        if (connection === 'close') {
            this.isConnecting = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            logger.info(`Connection closed with status: ${statusCode}`);
            this.connectionState = 'disconnected';
            
            if (shouldReconnect && this.retryCount < this.config.maxRetries) {
                this.retryCount++;
                const delay = Math.min(
                    this.config.reconnectInterval * Math.pow(1.5, this.retryCount - 1), 
                    60000
                );
                
                logger.info(`Reconnecting in ${delay/1000}s (Attempt ${this.retryCount}/${this.config.maxRetries})...`);
                
                setTimeout(() => this.connect(this.messageHandler), delay);
            } else if (statusCode === DisconnectReason.loggedOut) {
                logger.warn('Logged out. You need to scan the QR code again.');
                // Reset auth state
                this.cleanAuthState(true);
                // Restart connection to get new QR
                setTimeout(() => this.connect(this.messageHandler), 3000);
            }
        }
        
        if (connection === 'open') {
            this.isConnecting = false;
            this.retryCount = 0;
            this.qrDisplayCount = 0;
            this.connectionState = 'connected';
            logger.info('Connected to WhatsApp!');
            
            // Create a credentials backup on successful connection
            this.backupCredentials();
        }
    }

    /**
     * Clean auth state directory to resolve credential issues
     * @param {boolean} complete Whether to completely remove all files
     */
    async cleanAuthState(complete = false) {
        try {
            const authDir = this.config.authDir;
            
            // Create backup before cleaning
            if (fs.existsSync(authDir)) {
                const backupDir = `${authDir}_backup_${Date.now()}`;
                fs.mkdirSync(backupDir, { recursive: true });
                
                fs.readdirSync(authDir).forEach(file => {
                    if (file !== 'creds.json' || complete) {
                        const sourcePath = path.join(authDir, file);
                        const targetPath = path.join(backupDir, file);
                        fs.copyFileSync(sourcePath, targetPath);
                        
                        if (complete) {
                            fs.unlinkSync(sourcePath);
                        }
                    }
                });
                
                logger.info(`Backed up auth info to: ${backupDir}`);
            }
            
            // If complete cleaning requested, remove all files
            if (complete) {
                if (fs.existsSync(authDir)) {
                    fs.rmdirSync(authDir, { recursive: true });
                }
                fs.mkdirSync(authDir, { recursive: true });
                logger.info('Created fresh auth directory');
            }
        } catch (error) {
            logger.error('Error during auth state cleanup:', error);
        }
    }

    /**
     * Backup credentials to multiple locations for redundancy
     */
    backupCredentials() {
        try {
            const credsPath = path.join(this.config.authDir, 'creds.json');
            if (!fs.existsSync(credsPath)) {
                return;
            }
            
            const timestamp = Date.now();
            const backupDirs = [
                './backups',
                './auth_info_baileys_backup',
                './data/session_backups'
            ];
            
            backupDirs.forEach(dir => {
                try {
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    
                    const backupPath = path.join(dir, `creds_backup_${timestamp}.json`);
                    fs.copyFileSync(credsPath, backupPath);
                    
                    // Create a 'latest' pointer
                    if (dir === './backups') {
                        fs.copyFileSync(credsPath, path.join(dir, 'latest_creds.json'));
                    }
                    
                    logger.info(`Backup saved to ${backupPath}`);
                } catch (error) {
                    logger.warn(`Failed to backup to ${dir}:`, error.message);
                }
            });
        } catch (error) {
            logger.error('Error creating credentials backup:', error);
        }
    }

    /**
     * Restore credentials from backup
     * @param {Object} state Auth state to update
     */
    async restoreFromBackup(state) {
        try {
            const latestBackup = path.join('./backups', 'latest_creds.json');
            
            if (fs.existsSync(latestBackup)) {
                const backupData = JSON.parse(fs.readFileSync(latestBackup, 'utf8'));
                
                if (backupData && typeof backupData === 'object') {
                    logger.info('Restored from backups/latest_creds.json');
                    
                    // Update state with backup data
                    state.creds = {
                        ...state.creds,
                        ...backupData
                    };
                    
                    // Save restored creds to auth directory
                    const credsPath = path.join(this.config.authDir, 'creds.json');
                    fs.writeFileSync(credsPath, JSON.stringify(state.creds, null, 2));
                    
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            logger.error('Error restoring from backup:', error);
            return false;
        }
    }

    /**
     * Get connection status
     * @returns {Object} Connection status information
     */
    getStatus() {
        return {
            state: this.connectionState,
            connected: this.connectionState === 'connected',
            retryCount: this.retryCount,
            qrCount: this.qrDisplayCount,
            uptime: Date.now() - this.startTime,
            botInfo: this.socket?.user || null
        };
    }

    /**
     * Close the connection
     */
    async disconnect() {
        if (this.socket) {
            try {
                this.socket.ev.removeAllListeners();
                await this.socket.logout();
                logger.info('Disconnected from WhatsApp');
            } catch (error) {
                logger.error('Error during disconnection:', error);
            }
            
            this.socket = null;
            this.connectionState = 'disconnected';
        }
    }
}

module.exports = ConnectionManager;