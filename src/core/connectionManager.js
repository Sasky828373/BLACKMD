/**
 * Connection Manager
 * Handles WhatsApp connection lifecycle with reliable reconnection
 */

const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const QRCode = require('qrcode');
const logger = require('../utils/logger');
const commandHandler = require('./commandHandler');
const EventEmitter = require('events');

// Default paths and configuration
const AUTH_FOLDER = path.join(process.cwd(), 'auth_info_baileys');
const QR_PATH = path.join(process.cwd(), 'temp', 'latest_qr.png');

// Connection states
const CONNECTION_STATE = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    RECONNECTING: 'reconnecting',
    LOGGED_OUT: 'logged_out'
};

class ConnectionManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            authFolder: options.authFolder || AUTH_FOLDER,
            logLevel: options.logLevel || 'info',
            printQRInTerminal: options.printQRInTerminal !== false,
            generateQRFile: options.generateQRFile !== false,
            qrFilePath: options.qrFilePath || QR_PATH,
            browser: options.browser || ['WhatsApp-MD-Bot', 'Chrome', '4.0.0'],
            maxReconnectAttempts: options.maxReconnectAttempts || 10,
            reconnectInterval: options.reconnectInterval || 5000,
            commandPrefix: options.commandPrefix || '!'
        };
        
        this.sock = null;
        this.state = CONNECTION_STATE.DISCONNECTED;
        this.reconnectAttempts = 0;
        this.qrCode = null;
        this.reconnectTimer = null;
        this.connectionInfo = {};
        
        // Connection health monitoring
        this.isConnected = false;
        this.connectionHealth = 100; // Start with perfect health
        this.heartbeatErrors = 0;
        this.heartbeatSuccess = 0;
        this.lastHeartbeatTime = null;
        this.reconnectSuccess = 0;
        this.reconnectFailure = 0;
        this.lastRecoveryTime = 0;
        this.reconnectCount = 0;
        
        // Create a unique instance ID for this session
        this.instanceId = `BLACKSKY-MD-${Math.random().toString(36).substring(2, 8)}-${Date.now().toString(36).substring(-4)}`;
        this.monitoringLog = path.join(process.cwd(), 'connection-monitor.log');
        
        // Try to load existing instance ID for continuity
        try {
            const instanceFile = path.join(process.cwd(), '.instance_id');
            if (fs.existsSync(instanceFile)) {
                this.instanceId = fs.readFileSync(instanceFile, 'utf8').trim();
                logger.info(`Using existing instance ID: ${this.instanceId}`);
            } else {
                // Save the new instance ID
                fs.writeFileSync(instanceFile, this.instanceId);
            }
        } catch (error) {
            logger.warn(`Could not load/save instance ID: ${error.message}`);
        }
        
        logger.info(`Connection manager initialized with instance ID: ${this.instanceId}`);
    }
    
    /**
     * Initialize connection manager and create necessary directories
     */
    async initialize() {
        logger.info('Initializing connection manager...');
        
        // Ensure directories exist
        this._ensureDirectoriesExist();
        
        // Setup logger for Baileys
        this.baileysLogger = pino({
            level: this.options.logLevel,
            transport: {
                target: 'pino-pretty',
                options: {
                    translateTime: true,
                    ignore: 'hostname,pid'
                }
            }
        });
        
        logger.info('Connection manager initialized');
    }
    
    /**
     * Ensure all required directories exist
     * @private
     */
    _ensureDirectoriesExist() {
        const directories = [
            this.options.authFolder,
            path.dirname(this.options.qrFilePath),
            path.join(process.cwd(), 'data'),
            path.join(process.cwd(), 'data', 'translations'),
            path.join(process.cwd(), 'logs')
        ];
        
        for (const dir of directories) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                logger.info(`Created directory: ${dir}`);
            }
        }
    }
    
    /**
     * Connect to WhatsApp
     * @returns {Promise<Object>} WhatsApp socket connection
     */
    async connect() {
        try {
            this.state = CONNECTION_STATE.CONNECTING;
            this.emit('connecting');
            logger.info('Connecting to WhatsApp...');
            
            // Load auth state
            const { state, saveCreds } = await useMultiFileAuthState(this.options.authFolder);
            
            // Create WhatsApp socket connection
            this.sock = makeWASocket({
                auth: state,
                printQRInTerminal: this.options.printQRInTerminal,
                logger: this.baileysLogger,
                browser: this.options.browser,
                syncFullHistory: false,
                markOnlineOnConnect: true,
                defaultQueryTimeoutMs: 30000
            });
            
            // Handle connection events
            this.sock.ev.on('connection.update', this._handleConnectionUpdate.bind(this));
            
            // Handle credentials update
            this.sock.ev.on('creds.update', saveCreds);
            
            // Handle messages
            this.sock.ev.on('messages.upsert', this._handleMessages.bind(this));
            
            return this.sock;
        } catch (err) {
            logger.error('Error connecting to WhatsApp:', err);
            this.state = CONNECTION_STATE.DISCONNECTED;
            this.emit('connection_failed', err);
            
            // Try to reconnect
            this._scheduleReconnect();
            
            throw err;
        }
    }
    
    /**
     * Handle connection update events
     * @param {Object} update Connection update details
     * @private
     */
    async _handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr } = update;
        
        // Handle QR code
        if (qr) {
            this.qrCode = qr;
            logger.info('New QR code received');
            
            this.emit('qr', qr);
            
            // Generate QR code file if enabled
            if (this.options.generateQRFile) {
                try {
                    // Ensure directory exists
                    const qrDir = path.dirname(this.options.qrFilePath);
                    if (!fs.existsSync(qrDir)) {
                        fs.mkdirSync(qrDir, { recursive: true });
                    }
                    
                    // Generate QR code image
                    await QRCode.toFile(this.options.qrFilePath, qr, {
                        errorCorrectionLevel: 'H',
                        margin: 2,
                        scale: 8
                    });
                    
                    logger.info(`QR code saved to ${this.options.qrFilePath}`);
                } catch (err) {
                    logger.error('Error generating QR code file:', err);
                }
            }
        }
        
        // Handle connection state changes
        if (connection) {
            logger.info(`Connection state changed to: ${connection}`);
            
            if (connection === 'open') {
                this.state = CONNECTION_STATE.CONNECTED;
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.qrCode = null;
                this.connectionHealth = 100; // Reset health to perfect
                
                // Get connected user info
                if (this.sock.user) {
                    this.connectionInfo.user = this.sock.user;
                    logger.info(`Connected as: ${this.sock.user.name || this.sock.user.id || 'Unknown'}`);
                }
                
                logger.success('Connected to WhatsApp!');
                this.emit('connected', this.connectionInfo);
                
                // Create session backup
                this.backupSession();
                
                // Start connection monitoring with heartbeat
                logger.info('Starting connection monitoring with heartbeat...');
                this.setupHeartbeat();
                
                // Initialize command handler
                try {
                    await commandHandler.initialize(this.sock);
                } catch (err) {
                    logger.error('Error initializing command handler:', err);
                }
            } else if (connection === 'close') {
                // Handle disconnection
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = 
                    statusCode !== DisconnectReason.loggedOut && 
                    statusCode !== DisconnectReason.badSession;
                
                // Update connection status
                this.isConnected = false;
                this.updateConnectionHealth(-20); // Significant health penalty for disconnection
                
                // Stop any heartbeat and monitoring intervals
                this.cleanupIntervals();
                
                // Log reason for disconnection
                const reason = lastDisconnect?.error?.toString() || 'unknown reason';
                logger.warn(`Connection closed due to: ${reason} (Code: ${statusCode || 'Unknown status'})`);
                
                if (statusCode === DisconnectReason.loggedOut) {
                    this.state = CONNECTION_STATE.LOGGED_OUT;
                    logger.error('Connection closed permanently - possibly invalid credentials');
                    this.emit('logged_out');
                    
                    // Force reconnection anyway as emergency attempt
                    logger.info('Attempting emergency reconnection...');
                    this.initiateConnectionRecovery();
                } else if (shouldReconnect) {
                    this.state = CONNECTION_STATE.RECONNECTING;
                    logger.info('Reconnecting to WhatsApp...');
                    this.emit('reconnecting');
                    
                    // Schedule reconnect with smarter backoff
                    this._scheduleReconnect();
                } else {
                    this.state = CONNECTION_STATE.DISCONNECTED;
                    logger.error('Connection permanently closed.');
                    this.emit('disconnected', lastDisconnect?.error);
                    
                    // Create a final backup in case of permanent disconnection
                    this.backupSession();
                    
                    // Here we can still attempt recovery for certain cases
                    if (statusCode !== DisconnectReason.restartRequired) {
                        logger.info('Attempting advanced recovery despite permanent closure...');
                        setTimeout(() => this.attemptAdvancedRecovery(), 10000);
                    }
                }
            }
        }
    }
    
    /**
     * Schedule reconnection attempt
     * @private
     */
    _scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        
        // Calculate backoff time with exponential backoff
        const backoffTime = Math.min(
            this.options.reconnectInterval * Math.pow(1.5, this.reconnectAttempts),
            60000 // Max 1 minute
        );
        
        this.reconnectAttempts++;
        
        logger.info(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${Math.round(backoffTime / 1000)}s`);
        
        // Stop after max attempts
        if (this.reconnectAttempts > this.options.maxReconnectAttempts) {
            logger.error(`Maximum reconnect attempts (${this.options.maxReconnectAttempts}) reached`);
            this.state = CONNECTION_STATE.DISCONNECTED;
            this.emit('max_reconnect_attempts');
            return;
        }
        
        // Schedule reconnect
        this.reconnectTimer = setTimeout(async () => {
            try {
                await this.connect();
            } catch (err) {
                logger.error('Reconnect attempt failed:', err);
            }
        }, backoffTime);
    }
    
    /**
     * Handle incoming messages
     * @param {Object} param0 Message data
     * @private
     */
    async _handleMessages({ messages }) {
        if (!messages || !messages[0]) return;
        
        const msg = messages[0];
        
        // Skip processing if not message create event or from self
        if (msg.key?.remoteJid === 'status@broadcast' || !msg.message || msg.key.fromMe) {
            return;
        }
        
        try {
            // Process commands
            await commandHandler.processMessage(msg, this.options.commandPrefix);
        } catch (err) {
            logger.error('Error processing message:', err);
        }
    }
    
    /**
     * Get current connection state
     * @returns {string} Current connection state
     */
    getState() {
        return this.state;
    }
    
    /**
     * Get latest QR code
     * @returns {string|null} Latest QR code or null if not available
     */
    getQRCode() {
        return this.qrCode;
    }
    
    /**
     * Force reconnection
     */
    async forceReconnect() {
        logger.info('Forcing reconnection...');
        
        // Close existing connection if any
        if (this.sock) {
            try {
                await this.sock.logout();
            } catch (err) {
                logger.error('Error logging out:', err);
            }
        }
        
        this.state = CONNECTION_STATE.DISCONNECTED;
        this.reconnectAttempts = 0;
        
        // Connect again
        return this.connect();
    }
    
    /**
     * Set up heartbeat ping to validate connection
     */
    setupHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, 30000); // Every 30 seconds

        this.connectionCheckInterval = setInterval(() => {
            this.checkConnectionHealth();
        }, 60000); // Every minute
        
        // Set up deeper connection validation check
        this.deepValidationInterval = setInterval(() => {
            this.performDeepValidation();
        }, 300000); // Every 5 minutes
    }

    /**
     * Send a heartbeat ping to keep connection alive
     */
    async sendHeartbeat() {
        if (!this.isConnected) {
            this.heartbeatErrors++;
            logger.warn(`Heartbeat skipped: Not connected`);
            return;
        }

        if (!this.sock) {
            this.heartbeatErrors++;
            logger.warn(`Heartbeat skipped: Socket not initialized`);
            return;
        }

        try {
            // First try the WebSocket ping if available
            if (this.sock.ws && typeof this.sock.ws.ping === 'function') {
                this.sock.ws.ping();
                this.heartbeatSuccess++;
                this.updateConnectionHealth(+1); // Small health improvement
                this.lastHeartbeatTime = Date.now();
                return;
            }
            
            // If WebSocket ping not available, try to check connection state
            if (this.sock.ws && this.sock.ws.readyState === 1) {
                // ReadyState 1 means OPEN
                this.heartbeatSuccess++;
                this.updateConnectionHealth(+1); // Small health improvement
                this.lastHeartbeatTime = Date.now();
                return;
            }
            
            // If we get here, consider it a heartbeat failure
            this.heartbeatErrors++;
            logger.warn(`Heartbeat failed: WebSocket unavailable or not open`);
            logger.warn(`Heartbeat error (failure #${this.heartbeatErrors}): WebSocket state issue`);
        } catch (error) {
            this.heartbeatErrors++;
            logger.warn(`Error sending heartbeat: ${error.message}`);
            logger.warn(`Heartbeat error (failure #${this.heartbeatErrors}): ${error.message}`);
        }

        // If heartbeat fails too many times, check connection
        if (this.heartbeatErrors >= 3) {
            logger.warn(`Connection health check indicates potential issues, validating connection...`);
            const isValid = await this.validateConnection();
            
            if (!isValid) {
                logger.warn(`Connection validation failed, initiating recovery...`);
                this.initiateConnectionRecovery();
            } else {
                // Reset heartbeat errors if connection is valid
                this.heartbeatErrors = 0;
                logger.info(`Connection validation successful despite heartbeat issues`);
            }
        }
    }

    /**
     * Check connection health periodically
     */
    async checkConnectionHealth() {
        if (!this.isConnected || !this.sock) {
            return;
        }
        
        // Calculate time since last heartbeat
        const timeSinceHeartbeat = this.lastHeartbeatTime ? Date.now() - this.lastHeartbeatTime : null;
        
        if (timeSinceHeartbeat && timeSinceHeartbeat > 60000) { // 1 minute
            // Haven't received a heartbeat in a while, penalize health
            this.updateConnectionHealth(-5);
            logger.warn(`No heartbeat received in ${Math.round(timeSinceHeartbeat/1000)}s`);
            
            // If connection health drops too low, validate and potentially recover
            if (this.connectionHealth < 50) {
                logger.warn(`Low connection health (${this.connectionHealth}%), validating connection...`);
                const isValid = await this.validateConnection();
                
                if (!isValid) {
                    logger.warn(`Connection validation failed, initiating recovery...`);
                    this.initiateConnectionRecovery();
                }
            }
        }
        
        // Log current connection health for monitoring
        logger.debug(`Connection health: ${this.connectionHealth}%`);
    }
    
    /**
     * Perform a deeper validation of the connection
     * This checks multiple aspects of the connection beyond basic heartbeat
     */
    async performDeepValidation() {
        if (!this.isConnected || !this.sock) {
            logger.debug('Skipping deep validation: not connected');
            return;
        }
        
        logger.debug('Performing deep connection validation check...');
        
        let validationScore = 0;
        const maxScore = 4;
        
        // Check 1: Basic connection validation
        try {
            if (await this.validateConnection()) {
                validationScore++;
                logger.debug('Validation check passed: Basic connection is valid');
            }
        } catch (error) {
            logger.debug(`Basic validation check failed: ${error.message}`);
        }
        
        // Check 2: Verify user object
        try {
            if (this.sock.user && this.sock.user.id) {
                validationScore++;
                logger.debug('Validation check passed: User object is valid');
            }
        } catch (error) {
            logger.debug(`User validation check failed: ${error.message}`);
        }
        
        // Check 3: Check WebSocket state
        try {
            if (this.sock.ws && this.sock.ws.readyState === 1) {
                validationScore++;
                logger.debug('Validation check passed: WebSocket is in OPEN state');
            }
        } catch (error) {
            logger.debug(`WebSocket validation check failed: ${error.message}`);
        }
        
        // Check 4: Verify auth state
        try {
            if (this.sock.authState && this.sock.authState.creds) {
                validationScore++;
                logger.debug('Validation check passed: Auth state is valid');
            }
        } catch (error) {
            logger.debug(`Auth validation check failed: ${error.message}`);
        }
        
        // Calculate validation percentage
        const validationPercentage = (validationScore / maxScore) * 100;
        
        logger.info(`Deep connection validation complete: ${validationScore}/${maxScore} checks passed (${validationPercentage}%)`);
        
        // Update connection health based on validation
        this.updateConnectionHealth(validationPercentage >= 75 ? +5 : -10);
        
        // If validation score is too low, consider recovery
        if (validationPercentage < 50) {
            logger.warn(`Deep validation indicates poor connection health (${validationPercentage}%), considering recovery`);
            
            // Only recover if we haven't recently tried
            const timeSinceLastRecovery = Date.now() - (this.lastRecoveryTime || 0);
            if (timeSinceLastRecovery > 600000) { // 10 minutes
                logger.warn('Initiating connection recovery due to failed deep validation');
                this.initiateConnectionRecovery();
            } else {
                logger.warn(`Skipping recovery - last attempt was ${Math.floor(timeSinceLastRecovery/1000)}s ago`);
            }
        }
    }

    /**
     * Validate the connection with a definitive check
     * @returns {Promise<boolean>} Whether the connection is valid
     */
    async validateConnection() {
        if (!this.sock) {
            return false;
        }
        
        try {
            // Try multiple validation methods
            let connectionValid = false;
            
            // Method 1: Check if we have a valid user ID
            if (this.sock.user && this.sock.user.id) {
                logger.debug('User ID present, connection appears valid');
                connectionValid = true;
            }
            
            // Method 2: Try to get own profile picture (light API call)
            try {
                await this.sock.profilePictureUrl(this.sock.user.id);
                logger.debug('Successfully fetched profile picture, connection is valid');
                connectionValid = true;
            } catch (profileError) {
                logger.debug(`Failed to fetch profile picture: ${profileError.message}`);
            }
            
            // Method 3: Try to get connection state from WA state
            try {
                const connected = this.sock.ws && this.sock.ws.readyState === 1;
                if (connected) {
                    logger.debug('WebSocket connection is in OPEN state');
                    connectionValid = true;
                }
            } catch (wsError) {
                logger.debug(`WebSocket check failed: ${wsError.message}`);
            }
            
            if (connectionValid) {
                logger.info('Connection validation successful');
                return true;
            } else {
                logger.warn('Connection validation failed: No validation methods succeeded');
                return false;
            }
        } catch (error) {
            logger.warn(`Connection validation failed: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Initiate connection recovery procedure
     */
    async initiateConnectionRecovery() {
        logger.warn('Initiating connection recovery procedure...');
        this.lastRecoveryTime = Date.now();
        
        // Check if we're still in a valid state for reconnection
        const wasConnected = this.isConnected;
        this.isConnected = false;
        
        try {
            // Attempt to gracefully close connection if it exists
            if (this.sock) {
                try {
                    logger.info('Gracefully closing existing connection...');
                    this.sock.end();
                } catch (error) {
                    logger.warn(`Error closing connection: ${error.message}`);
                }
                this.sock = null;
            }
            
            // Wait a moment before reconnecting
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Make a reconnection attempt
            logger.info('Attempting to reestablish connection...');
            const result = await this.connect();
            
            if (result) {
                this.reconnectSuccess++;
                logger.success('Connection recovery successful');
                this.updateConnectionHealth(+30); // Significant health improvement
            } else {
                this.reconnectFailure++;
                logger.error('Connection recovery failed');
                
                // If we've tried too many times, reset the connection state completely
                if (this.reconnectFailure >= 3) {
                    logger.warn('Multiple recovery failures, will attempt advanced recovery');
                    this.attemptAdvancedRecovery();
                }
            }
        } catch (error) {
            this.reconnectFailure++;
            logger.error(`Error during connection recovery: ${error.message}`);
        }
    }
    
    /**
     * Attempt advanced recovery in case of persistent connection issues
     * This is a more aggressive recovery approach that recreates auth state
     */
    async attemptAdvancedRecovery() {
        logger.warn('Attempting advanced connection recovery...');
        
        try {
            // First create a backup
            this.backupSession();
            
            // Reset the reconnect counter
            this.reconnectCount = 0;
            
            // Delay before reconnection
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Try connecting again
            const result = await this.connect();
            
            if (result) {
                logger.success('Advanced recovery successful');
                this.updateConnectionHealth(+50); // Major health improvement
            } else {
                logger.error('Advanced recovery failed');
            }
        } catch (error) {
            logger.error(`Error during advanced recovery: ${error.message}`);
        }
    }
    
    /**
     * Create a backup of the current session
     */
    async backupSession() {
        try {
            const backupDir = path.join(process.cwd(), 'auth_info_baileys_backup');
            
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            
            const timestamp = Date.now();
            const backupPath = path.join(backupDir, `backup_${timestamp}`);
            
            if (!fs.existsSync(backupPath)) {
                fs.mkdirSync(backupPath, { recursive: true });
            }
            
            // Copy auth files to backup directory
            const authFiles = fs.readdirSync(AUTH_FOLDER);
            let copiedCount = 0;
            
            for (const file of authFiles) {
                const sourcePath = path.join(AUTH_FOLDER, file);
                const destPath = path.join(backupPath, file);
                
                try {
                    if (fs.statSync(sourcePath).isFile()) {
                        fs.copyFileSync(sourcePath, destPath);
                        copiedCount++;
                    }
                } catch (error) {
                    logger.error(`Error backing up ${file}: ${error.message}`);
                }
            }
            
            logger.info(`Backup created successfully (${copiedCount} files) at ${backupPath}`);
            
            // Clean up old backups (keep latest 5)
            this.cleanupOldBackups(5);
            
            return true;
        } catch (error) {
            logger.error(`Error creating backup: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Clean up old backup folders
     * @param {number} keepCount Number of latest backups to keep
     */
    cleanupOldBackups(keepCount = 5) {
        try {
            const backupDir = path.join(process.cwd(), 'auth_info_baileys_backup');
            
            if (!fs.existsSync(backupDir)) {
                return;
            }
            
            const backups = fs.readdirSync(backupDir)
                .filter(dir => dir.startsWith('backup_'))
                .map(dir => ({
                    path: path.join(backupDir, dir),
                    timestamp: parseInt(dir.split('_')[1] || '0')
                }))
                .sort((a, b) => b.timestamp - a.timestamp); // Sort newest first
            
            // Keep the latest 'keepCount' backups, delete the rest
            const toDelete = backups.slice(keepCount);
            
            for (const backup of toDelete) {
                try {
                    this.removeDirectory(backup.path);
                } catch (error) {
                    logger.error(`Error deleting old backup ${backup.path}: ${error.message}`);
                }
            }
            
            logger.info(`Cleaned up ${toDelete.length} old backup(s)`);
        } catch (error) {
            logger.error(`Error cleaning up old backups: ${error.message}`);
        }
    }
    
    /**
     * Recursively remove a directory
     * @param {string} dirPath Directory path to remove
     */
    removeDirectory(dirPath) {
        if (fs.existsSync(dirPath)) {
            fs.readdirSync(dirPath).forEach(file => {
                const curPath = path.join(dirPath, file);
                if (fs.lstatSync(curPath).isDirectory()) {
                    this.removeDirectory(curPath);
                } else {
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(dirPath);
        }
    }
    
    /**
     * Update connection health score
     * @param {number} change Change to apply to health score
     */
    updateConnectionHealth(change) {
        this.connectionHealth = Math.max(0, Math.min(100, this.connectionHealth + change));
    }
    
    /**
     * Clean up all interval timers on disconnect
     */
    cleanupIntervals() {
        // Clear all monitoring intervals
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }
        
        if (this.deepValidationInterval) {
            clearInterval(this.deepValidationInterval);
            this.deepValidationInterval = null;
        }
        
        logger.debug('Cleared all connection monitoring intervals');
    }
}

// Create singleton instance
const connectionManager = new ConnectionManager();

module.exports = {
    ConnectionManager,
    connectionManager,
    CONNECTION_STATE
};