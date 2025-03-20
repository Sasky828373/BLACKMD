/**
 * WhatsApp Connection Manager
 * Manages connections with enhanced reliability and auto-recovery
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { ensureDirectoryExists } = require('../utils/fileUtils');

// Default connection settings
const DEFAULT_RECONNECT_INTERVAL = 3000; // 3 seconds
const MAX_RECONNECT_RETRIES = 10;
const RECONNECT_DECAY_FACTOR = 1.5; // Exponential backoff factor

/**
 * Connection manager for WhatsApp interactions
 */
class ConnectionManager {
    constructor(options = {}) {
        this.authDir = options.authDir || './auth_info_baileys';
        this.logLevel = options.logLevel || 'info';
        this.options = options;
        
        // Generate a unique but consistent instance ID to help with session conflicts
        // This format helps avoid session conflicts without generating a new ID on each restart
        const systemId = require('os').hostname().slice(0, 6);
        this.instanceId = `BLACKSKY-MD-${systemId}-${Math.random().toString(36).substr(2, 8)}`;
        
        // Store the instance ID in a file for consistency across restarts
        try {
            const instanceIdFile = path.join(process.cwd(), '.instance_id');
            if (fs.existsSync(instanceIdFile)) {
                this.instanceId = fs.readFileSync(instanceIdFile, 'utf8').trim();
                logger.info(`Using existing instance ID: ${this.instanceId}`);
            } else {
                fs.writeFileSync(instanceIdFile, this.instanceId);
                logger.info(`Created new instance ID: ${this.instanceId}`);
            }
        } catch (error) {
            logger.warn(`Could not persist instance ID: ${error.message}`);
        }
        
        this.sock = null;
        this.state = null;
        this.saveCreds = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.reconnectCount = 0;
        this.reconnectInterval = DEFAULT_RECONNECT_INTERVAL;
        this.connectionEventHandlers = [];
        this.messageHandlers = [];
        this.wasConnected = false;
        
        // Connection monitoring vars
        this.lastMessageTimestamp = Date.now();
        this.heartbeatInterval = null;
        this.connectionMonitorInterval = null;
        this.pingTimeout = null;
        this.lastHeartbeatAck = null;
        this.monitoringLog = path.join(process.cwd(), 'connection-monitor.log');
        
        // Connection health metrics
        this.consecutiveFailedPings = 0;
        this.socketErrors = 0;
        this.pingLatency = null;
        this.connectionHealth = 100; // Health score (0-100)
        this.reconnectSuccess = 0;
        this.reconnectFailure = 0;
        this.lastActivityTimestamp = Date.now();

        // Ensure auth directory exists
        ensureDirectoryExists(this.authDir);
        
        this.logger = pino({ 
            level: this.logLevel,
            transport: {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: true
                }
            }
        });
        
        logger.info(`Connection manager initialized with instance ID: ${this.instanceId}`);
    }

    /**
     * Initialize connection
     * @returns {Promise<Object>} WhatsApp socket connection
     */
    async connect() {
        if (this.isConnecting) {
            logger.warn('Connection attempt already in progress');
            return null;
        }

        this.isConnecting = true;
        logger.info('Initializing WhatsApp connection...');

        try {
            // Get latest Baileys version
            const { version } = await fetchLatestBaileysVersion();
            logger.info(`Using Baileys version: ${version.join('.')}`);

            // Load auth state
            const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
            this.state = state;
            this.saveCreds = saveCreds;

            // Create socket connection with unique instance id in browser info
            this.sock = makeWASocket({
                version,
                auth: state,
                printQRInTerminal: true,
                markOnlineOnConnect: this.options.markOnlineOnConnect !== false,
                logger: this.logger,
                browser: this.options.browser || [this.instanceId, 'Chrome', '4.0.0']
            });

            // Set up event handlers
            this.setupSocketHandlers();
            this.isConnecting = false;
            
            return this.sock;
        } catch (error) {
            logger.error('Failed to initialize connection:', error);
            this.isConnecting = false;
            
            if (this.reconnectCount < MAX_RECONNECT_RETRIES) {
                this.scheduleReconnect();
            } else {
                logger.error('Max reconnection attempts reached');
            }
            
            return null;
        }
    }

    /**
     * Set up event handlers for the socket
     */
    setupSocketHandlers() {
        if (!this.sock) return;

        // Handle connection events
        this.sock.ev.on('connection.update', async (update) => {
            try {
                await this.handleConnectionUpdate(update);
            } catch (error) {
                logger.error('Error in connection update handler:', error);
            }
        });

        // Save credentials on update
        this.sock.ev.on('creds.update', this.saveCreds);

        // Handle messages
        this.sock.ev.on('messages.upsert', (messages) => {
            this.handleIncomingMessages(messages);
        });
    }

    /**
     * Handle connection updates
     * @param {Object} update Connection update event
     * @returns {Promise<void>}
     */
    async handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr } = update;
        
        // Notify all registered event handlers
        this.notifyEventHandlers(update);

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom && 
                lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut);
            
            const errorMessage = lastDisconnect?.error?.message || 'Unknown error';
            const statusCode = lastDisconnect?.error?.output?.statusCode || 'Unknown status';
            
            logger.warn(`Connection closed due to: ${errorMessage} (Code: ${statusCode})`);
            this.isConnected = false;
            
            // Check for session conflict specifically
            const isConflict = lastDisconnect?.error?.output?.payload?.error === 'conflict' ||
                              errorMessage.includes('conflict') ||
                              statusCode === 440;
                              
            if (isConflict) {
                logger.warn('Session conflict detected - another client is using this session');
                // Add a longer delay for conflict resolution to allow other session to stabilize
                setTimeout(() => {
                    if (!this.isConnected && !this.isConnecting) {
                        logger.info('Attempting to reconnect after session conflict...');
                        this.connect();
                    }
                }, 10000); // Wait 10 seconds before trying to reconnect
                return;
            }
            
            // Special handling for logout cases
            if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
                logger.warn('Account logged out - attempting one-time auth repair');
                
                // Try to repair auth by creating a fresh backup and reconnecting
                try {
                    await this.backupSession();
                    logger.info('Created auth backup before repair attempt');
                    
                    // Force a reconnection attempt with a longer delay
                    setTimeout(() => {
                        this.reconnectCount = 0; // Reset counter for fresh start
                        logger.info('Attempting reconnection after logout with fresh session...');
                        this.connect();
                    }, 5000);
                } catch (error) {
                    logger.error('Failed to repair auth after logout:', error);
                }
            } 
            // Standard reconnection for other cases
            else if (shouldReconnect) {
                if (this.reconnectCount < MAX_RECONNECT_RETRIES) {
                    this.scheduleReconnect();
                } else {
                    logger.error('Max reconnection attempts reached');
                }
            } else {
                logger.error('Connection closed permanently - possibly invalid credentials');
                
                // Last resort attempt for persistent connection issues
                if (this.wasConnected && this.reconnectCount < 3) {
                    logger.info('Attempting emergency reconnection...');
                    setTimeout(() => this.connect(), 10000);
                }
            }
        } else if (connection === 'open') {
            logger.success('WhatsApp connection established successfully');
            this.isConnected = true;
            this.wasConnected = true;
            this.reconnectCount = 0;
            this.reconnectInterval = DEFAULT_RECONNECT_INTERVAL;
            
            // Reset health metrics on successful connection
            this.connectionHealth = 100;
            this.consecutiveFailedPings = 0;
            this.lastActivityTimestamp = Date.now();
            this.lastMessageTimestamp = Date.now();
            
            // Start connection monitoring
            this.startConnectionMonitoring();
            
            // Log connection status
            this.logConnectionStatus('Connection established');
        }
    }

    /**
     * Handle incoming messages
     * @param {Object} messages Message update event
     */
    handleIncomingMessages(messages) {
        // Log incoming messages for debugging
        logger.info(`Received messages update with type: ${messages.type}`);
        logger.info(`Messages count: ${messages.messages ? messages.messages.length : 0}`);
        
        // Process messages through all registered handlers
        this.messageHandlers.forEach(handler => {
            try {
                logger.debug('Calling message handler...');
                handler(messages, this.sock);
            } catch (error) {
                logger.error('Error in message handler:', error);
            }
        });
    }

    /**
     * Schedule reconnection with exponential backoff
     */
    scheduleReconnect() {
        this.reconnectCount++;
        
        // Apply exponential backoff
        const delay = this.reconnectInterval * Math.pow(RECONNECT_DECAY_FACTOR, this.reconnectCount - 1);
        const maxDelay = 60000; // Cap at 1 minute
        const reconnectDelay = Math.min(delay, maxDelay);
        
        logger.info(`Reconnecting in ${Math.round(reconnectDelay / 1000)}s (attempt ${this.reconnectCount}/${MAX_RECONNECT_RETRIES})`);
        
        setTimeout(() => {
            if (!this.isConnected && !this.isConnecting) {
                this.connect();
            }
        }, reconnectDelay);
    }

    /**
     * Register a connection event handler
     * @param {Function} handler Event handler function
     */
    onConnectionUpdate(handler) {
        if (typeof handler === 'function') {
            this.connectionEventHandlers.push(handler);
        }
    }

    /**
     * Register a message handler
     * @param {Function} handler Message handler function
     */
    onMessage(handler) {
        if (typeof handler === 'function') {
            this.messageHandlers.push(handler);
        }
    }

    /**
     * Notify all registered event handlers
     * @param {Object} update Connection update event
     */
    notifyEventHandlers(update) {
        this.connectionEventHandlers.forEach(handler => {
            try {
                handler(update, this.sock);
            } catch (error) {
                logger.error('Error in connection event handler:', error);
            }
        });
    }

    /**
     * Disconnect from WhatsApp
     */
    async disconnect() {
        // Stop connection monitoring first
        this.stopConnectionMonitoring();
        
        if (this.sock) {
            logger.info('Disconnecting from WhatsApp...');
            this.sock.end();
            this.sock = null;
            this.isConnected = false;
            this.logConnectionStatus('Disconnected');
        }
    }

    /**
     * Create a backup of the current session
     * @returns {Promise<boolean>} Success status
     */
    async backupSession() {
        try {
            const backupDir = path.join(this.authDir + '_backup_' + Date.now());
            ensureDirectoryExists(backupDir);
            
            const files = fs.readdirSync(this.authDir);
            let copyCount = 0;
            
            for (const file of files) {
                const srcPath = path.join(this.authDir, file);
                const destPath = path.join(backupDir, file);
                
                if (fs.statSync(srcPath).isFile()) {
                    fs.copyFileSync(srcPath, destPath);
                    copyCount++;
                }
            }
            
            logger.info(`Session backup created with ${copyCount} files at ${backupDir}`);
            return true;
        } catch (error) {
            logger.error('Error creating session backup:', error);
            return false;
        }
    }

    /**
     * Get connection status
     * @returns {Object} Connection status
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            isConnecting: this.isConnecting,
            reconnectCount: this.reconnectCount,
            wasEverConnected: this.wasConnected,
            connectionHealth: this.connectionHealth,
            lastPingLatency: this.pingLatency,
            lastActivity: this.lastActivityTimestamp
        };
    }
    
    /**
     * Get detailed connection diagnostics
     * @returns {Object} Detailed connection diagnostics
     */
    getDiagnostics() {
        return {
            isConnected: this.isConnected,
            isConnecting: this.isConnecting,
            reconnectCount: this.reconnectCount,
            wasEverConnected: this.wasConnected,
            reconnectSuccess: this.reconnectSuccess,
            reconnectFailure: this.reconnectFailure,
            socketErrors: this.socketErrors,
            consecutiveFailedPings: this.consecutiveFailedPings,
            connectionHealth: this.connectionHealth,
            pingLatency: this.pingLatency,
            lastMessageTimestamp: this.lastMessageTimestamp,
            lastActivityTimestamp: this.lastActivityTimestamp,
            instanceId: this.instanceId
        };
    }
    
    /**
     * Start connection monitoring with heartbeat mechanism
     */
    startConnectionMonitoring() {
        if (this.heartbeatInterval || this.connectionMonitorInterval) {
            // Already monitoring
            return;
        }
        
        logger.info('Starting connection monitoring with heartbeat...');
        
        // Start heartbeat to detect connection issues early (every 30 seconds)
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, 30000);
        
        // Monitor connection and trigger recovery if needed (check every minute)
        this.connectionMonitorInterval = setInterval(() => {
            this.checkConnectionHealth();
        }, 60000);
        
        // Update activity timestamp when messages are received
        const originalHandler = this.handleIncomingMessages.bind(this);
        this.handleIncomingMessages = (messages) => {
            this.lastActivityTimestamp = Date.now();
            this.lastMessageTimestamp = Date.now();
            // Update connection health based on activity
            this.updateConnectionHealth(+10); // Activity is a good sign
            
            // Call the original handler
            originalHandler(messages);
        };
        
        // Log start of monitoring
        this.logConnectionStatus('Connection monitoring started');
    }
    
    /**
     * Stop connection monitoring
     */
    stopConnectionMonitoring() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        if (this.connectionMonitorInterval) {
            clearInterval(this.connectionMonitorInterval);
            this.connectionMonitorInterval = null;
        }
        
        if (this.pingTimeout) {
            clearTimeout(this.pingTimeout);
            this.pingTimeout = null;
        }
        
        logger.info('Connection monitoring stopped');
        this.logConnectionStatus('Connection monitoring stopped');
    }
    
    /**
     * Send a heartbeat ping to verify connection
     */
    async sendHeartbeat() {
        if (!this.sock || !this.isConnected) {
            logger.debug('Cannot send heartbeat: not connected');
            return;
        }
        
        try {
            logger.debug('Sending connection heartbeat...');
            
            const pingStart = Date.now();
            
            // Set a timeout for ping response
            this.pingTimeout = setTimeout(() => {
                logger.warn('Heartbeat ping timed out after 10s');
                this.handlePingTimeout();
            }, 10000);
            
            // Use a reliable API call to check connection
            // Attempt to get user profile - this is a light operation that will succeed if the connection is active
            // We don't actually need the user profile info, just whether the call succeeds
            try {
                // Try getting a simple API response from the server
                await this.sock.profilePictureUrl(this.sock.user.id);
                const latency = Date.now() - pingStart;
                this.handlePingResponse(latency);
            } catch (apiError) {
                // Fallback to a more reliable but simpler test
                if (this.sock.user && this.sock.user.id) {
                    // Connection is still valid if we have user info
                    const latency = Date.now() - pingStart;
                    this.handlePingResponse(latency);
                } else {
                    // Can't determine user ID, connection may be broken
                    throw new Error("Cannot verify connection state: user ID unavailable");
                }
            }
        } catch (error) {
            logger.warn('Error sending heartbeat:', error.message);
            this.handlePingError(error);
        }
    }
    
    /**
     * Handle ping response (successful heartbeat)
     * @param {number} latency Ping latency in milliseconds
     */
    handlePingResponse(latency) {
        if (this.pingTimeout) {
            clearTimeout(this.pingTimeout);
            this.pingTimeout = null;
        }
        
        this.pingLatency = latency;
        this.lastHeartbeatAck = Date.now();
        this.consecutiveFailedPings = 0;
        
        // Update connection health
        let healthChange = 0;
        
        // Adjust health based on latency
        if (latency < 300) {
            healthChange = +5; // Fast connection
        } else if (latency < 1000) {
            healthChange = +2; // Average connection
        } else if (latency > 5000) {
            healthChange = -5; // Slow connection
        }
        
        this.updateConnectionHealth(healthChange);
        
        logger.debug(`Heartbeat acknowledged (latency: ${latency}ms)`);
        this.logConnectionStatus(`Heartbeat OK, latency: ${latency}ms`);
    }
    
    /**
     * Handle ping timeout (failed heartbeat)
     */
    handlePingTimeout() {
        this.pingTimeout = null;
        this.consecutiveFailedPings++;
        
        // Update health metrics
        this.socketErrors++;
        this.updateConnectionHealth(-15); // Ping timeout is a bad sign
        
        logger.warn(`Heartbeat ping timed out (failure #${this.consecutiveFailedPings})`);
        this.logConnectionStatus(`Heartbeat timed out (failure #${this.consecutiveFailedPings})`);
        
        // If we have consecutive failures, take action
        if (this.consecutiveFailedPings >= 3) {
            logger.warn('Multiple heartbeat failures, checking connection state...');
            
            // Force connection check
            this.checkConnectionHealth(true);
        }
    }
    
    /**
     * Handle ping error
     * @param {Error} error Error object
     */
    handlePingError(error) {
        this.consecutiveFailedPings++;
        this.socketErrors++;
        
        // Update health metrics
        this.updateConnectionHealth(-10);
        
        logger.warn(`Heartbeat error (failure #${this.consecutiveFailedPings}): ${error.message}`);
        this.logConnectionStatus(`Heartbeat error: ${error.message}`);
        
        // If we have multiple failures, check connection state
        if (this.consecutiveFailedPings >= 2) {
            this.checkConnectionHealth(true);
        }
    }
    
    /**
     * Check overall connection health and take action if needed
     * @param {boolean} forced Whether this is a forced check
     */
    async checkConnectionHealth(forced = false) {
        const now = Date.now();
        const inactivityTime = now - this.lastActivityTimestamp;
        const messageInactivityTime = now - this.lastMessageTimestamp;
        
        // Log current status
        const statusMsg = `Connection health: ${this.connectionHealth}%, ` +
            `Last activity: ${Math.round(inactivityTime / 1000)}s ago, ` +
            `Last message: ${Math.round(messageInactivityTime / 60000)}min ago`;
        
        logger.debug(statusMsg);
        this.logConnectionStatus(statusMsg);
        
        // Check if we need to take action
        const needsAction = forced || 
            this.connectionHealth < 50 || // Health below threshold
            inactivityTime > 300000 || // No activity for 5+ minutes
            (this.isConnected && this.consecutiveFailedPings >= 3); // Multiple ping failures
        
        if (needsAction) {
            logger.warn('Connection health check indicates potential issues, validating connection...');
            
            // Attempt to validate the connection with a more thorough check
            const isValid = await this.validateConnection();
            
            if (!isValid && this.isConnected) {
                logger.warn('Connection validation failed, initiating recovery...');
                this.initiateConnectionRecovery();
            } else if (!isValid && !this.isConnected) {
                logger.warn('Connection is already marked as disconnected, attempting reconnect...');
                this.initiateConnectionRecovery();
            } else {
                logger.info('Connection validated successfully despite health metrics');
                this.updateConnectionHealth(+20); // Restore some health on successful validation
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
        this.logConnectionStatus('Initiating recovery');
        
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
                this.logConnectionStatus('Recovery successful');
                this.updateConnectionHealth(+30); // Significant health improvement
            } else {
                this.reconnectFailure++;
                logger.error('Connection recovery failed');
                this.logConnectionStatus('Recovery failed');
                
                // If we've tried too many times, reset the connection state completely
                if (this.reconnectFailure >= 3) {
                    logger.warn('Multiple recovery failures, will attempt advanced recovery');
                    this.attemptAdvancedRecovery();
                }
            }
        } catch (error) {
            this.reconnectFailure++;
            logger.error(`Error during connection recovery: ${error.message}`);
            this.logConnectionStatus(`Recovery error: ${error.message}`);
        }
    }
    
    /**
     * Attempt advanced recovery in case of persistent connection issues
     * This is a more aggressive recovery approach that recreates auth state
     */
    async attemptAdvancedRecovery() {
        logger.warn('Attempting advanced connection recovery...');
        this.logConnectionStatus('Attempting advanced recovery');
        
        try {
            // First create a backup
            await this.backupSession();
            
            // Reset the reconnect counter
            this.reconnectCount = 0;
            
            // Delay before reconnection
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Try connecting again
            const result = await this.connect();
            
            if (result) {
                logger.success('Advanced recovery successful');
                this.logConnectionStatus('Advanced recovery successful');
                this.updateConnectionHealth(+50); // Major health improvement
            } else {
                logger.error('Advanced recovery failed');
                this.logConnectionStatus('Advanced recovery failed');
            }
        } catch (error) {
            logger.error(`Error during advanced recovery: ${error.message}`);
            this.logConnectionStatus(`Advanced recovery error: ${error.message}`);
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
     * Log connection status for monitoring
     * @param {string} message Status message
     */
    logConnectionStatus(message) {
        try {
            const timestamp = new Date().toISOString();
            const logEntry = `${timestamp} [${this.instanceId}] ${message}\n`;
            
            fs.appendFileSync(this.monitoringLog, logEntry);
        } catch (error) {
            logger.warn(`Could not write to connection monitoring log: ${error.message}`);
        }
    }
}

// Create singleton instance
const connectionManager = new ConnectionManager();

module.exports = {
    ConnectionManager,
    connectionManager
};