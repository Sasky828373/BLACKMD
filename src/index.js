/**
 * BLACKSKY-MD WhatsApp Bot - Main Entry Point
 * Using @whiskeysockets/baileys with enhanced connection persistence
 */

const { connectionManager } = require('./core/connection');
const { commandRegistry } = require('./core/commandRegistry');
const { sessionManager } = require('./core/sessionManager');
const logger = require('./utils/logger');
const fs = require('fs');
const path = require('path');
const { ensureDirectoryExists } = require('./utils/fileUtils');
const { addErrorHandlingToAll } = require('./utils/errorHandler');
const { verifyStartupRequirements, displayVerificationReport } = require('./utils/startupVerification');

// Create required directories
function ensureDirectoriesExist() {
    const dirs = [
        path.join(process.cwd(), 'data'),
        path.join(process.cwd(), 'data', 'translations'),
        path.join(process.cwd(), 'data', 'reaction_gifs'),
        path.join(process.cwd(), 'logs'),
        path.join(process.cwd(), 'auth_info_baileys'),
        path.join(process.cwd(), 'auth_info_baileys_backup')
    ];
    
    for (const dir of dirs) {
        ensureDirectoryExists(dir);
    }
}

// Set up message handler with error handling
async function setupMessageHandler(sock) {
    const commandsDir = path.join(__dirname, 'commands');
    logger.info('Loading commands from:', commandsDir);
    
    await commandRegistry.loadCommands(commandsDir);
    logger.info(`Loaded ${commandRegistry.getStats().totalCommands} commands in ${commandRegistry.getStats().totalModules} modules`);
    
    await commandRegistry.initializeModules(sock);
    
    logger.info('Setting up message handler with error handling...');
    
    // Configuration option: set to true to allow processing the bot's own messages
    const processOwnMessages = true;
    
    connectionManager.onMessage(async (update, sock) => {
        try {
            logger.info(`Message handler received update of type: ${update.type}`);
            
            if (update.type !== 'notify') {
                logger.info(`Skipping non-notify update type: ${update.type}`);
                return;
            }
            
            logger.info(`Processing ${update.messages.length} messages`);
            
            for (const message of update.messages) {
                try {
                    logger.info(`Message key: ${JSON.stringify(message.key)}`);
                    
                    // Check if message is from the bot itself
                    const isFromSelf = message.key.fromMe;
                    
                    // Process messages based on configuration
                    if (!isFromSelf || processOwnMessages) {
                        if (isFromSelf) {
                            logger.info(`Processing message from self to ${message.key.remoteJid}`);
                        } else {
                            logger.info(`Processing message from ${message.key.remoteJid}`);
                        }
                        
                        // Log message content for debugging
                        if (message.message) {
                            const types = Object.keys(message.message);
                            logger.info(`Message types: ${types.join(', ')}`);
                            
                            if (message.message.conversation) {
                                logger.info(`Message text: ${message.message.conversation}`);
                            } else if (message.message.extendedTextMessage?.text) {
                                logger.info(`Extended message text: ${message.message.extendedTextMessage.text}`);
                            }
                        } else {
                            logger.info('Message has no content');
                        }
                        
                        const result = await commandRegistry.processMessage(sock, message);
                        logger.info(`Command processing result: ${result ? 'Command executed' : 'No command found'}`);
                    } else {
                        logger.info('Skipping message from self (processOwnMessages is disabled)');
                    }
                } catch (msgError) {
                    logger.error('Error processing message:', msgError);
                }
            }
        } catch (error) {
            logger.error('Error in message handler:', error);
        }
    });
    
    logger.success('Message handler set up successfully');
}

// Main function to start the bot
async function startBot() {
    logger.info('Starting BLACKSKY-MD WhatsApp Bot...');
    
    // Ensure required directories exist
    ensureDirectoriesExist();
    
    // Run startup verification checks
    logger.info('Performing startup verification checks...');
    const verificationResults = await verifyStartupRequirements();
    displayVerificationReport(verificationResults);
    
    if (!verificationResults.success) {
        logger.warn('Some startup verification checks failed, but continuing anyway...');
    }
    
    // Initialize session manager
    await sessionManager.initialize();
    
    // Connect to WhatsApp
    const sock = await connectionManager.connect();
    
    if (!sock) {
        logger.error('Failed to create WhatsApp connection');
        return;
    }
    
    // Set up message handler immediately
    logger.info('Setting up message handler...');
    await setupMessageHandler(sock);
    
    // Set up connection event handler for QR code and connection status
    connectionManager.onConnectionUpdate(async (update) => {
        const { connection, qr } = update;
        
        if (qr) {
            logger.info('QR Code received, scan it using your WhatsApp app');
            
            // You can implement QR code display here if needed
            // For example:
            // displayQrInTerminal(qr);
        }
        
        if (connection === 'open') {
            logger.success('Connected to WhatsApp');
            
            // Create a backup of the session
            await sessionManager.backupSession();
        }
    });
    
    // Set up automatic reconnection
    connectionManager.onConnectionUpdate((update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            // Schedule reconnection if needed
            setTimeout(async () => {
                const status = connectionManager.getStatus();
                if (!status.isConnected && !status.isConnecting) {
                    logger.info('Attempting reconnection...');
                    await connectionManager.connect();
                }
            }, 5000); // Wait 5 seconds before attempting reconnect
        }
    });
    
    // Log connection status periodically
    setInterval(() => {
        const status = connectionManager.getStatus();
        if (status.isConnected) {
            logger.debug('Connection status: Connected');
        } else if (status.isConnecting) {
            logger.debug('Connection status: Connecting...');
        } else {
            logger.debug('Connection status: Disconnected');
        }
    }, 60000); // Check every minute
    
    // Set up graceful shutdown
    setupGracefulShutdown();
    
    // Set up connection diagnostics logging
    setupConnectionDiagnostics();
}

/**
 * Set up periodic connection diagnostics logging
 */
function setupConnectionDiagnostics() {
    // Log comprehensive connection diagnostics every 15 minutes
    setInterval(() => {
        const diagnostics = connectionManager.getDiagnostics();
        logger.info('Connection Diagnostics Report:', JSON.stringify(diagnostics, null, 2));
        
        // If there are issues, log more details
        if (diagnostics.connectionHealth < 70) {
            logger.warn('Connection health is suboptimal:', diagnostics.connectionHealth);
            
            if (diagnostics.consecutiveFailedPings > 0) {
                logger.warn(`Failed heartbeat pings: ${diagnostics.consecutiveFailedPings}`);
            }
            
            if (diagnostics.reconnectFailure > 0) {
                logger.warn(`Failed reconnection attempts: ${diagnostics.reconnectFailure}`);
            }
        }
    }, 15 * 60 * 1000); // Every 15 minutes
}

// Handle graceful shutdown
function setupGracefulShutdown() {
    const shutdown = async (signal) => {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        
        // Stop the session manager backups
        sessionManager.stopScheduledBackups();
        
        // Create a final backup before exit
        await sessionManager.backupSession();
        
        // Disconnect from WhatsApp if connected
        await connectionManager.disconnect();
        
        logger.info('Shutdown complete, exiting now');
        process.exit(0);
    };
    
    // Handle termination signals
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Handle uncaught exceptions to prevent crashes
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the bot
startBot().catch(err => {
    logger.error('Error starting bot:', err);
});