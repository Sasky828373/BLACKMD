/**
 * BLACKSKY-MD WhatsApp Bot - Main Entry Point
 * Using @whiskeysockets/baileys with enhanced connection persistence
 * Enhanced for 24/7 operation on Heroku
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
const { checkMentionsForAfkUsers } = require('./utils/afkMentionHandler');
const { isHeroku, isRailway, isCloudPlatform, initializeAuthFromEnv } = require('./utils/herokuHelper');
const { startHerokuMonitoring, getHealthStatus } = require('./utils/herokuMonitor');

// Create required directories
function ensureDirectoriesExist() {
    // Determine the auth directory based on environment
    const authDir = process.env.AUTH_DIR || 'auth_info_baileys';
    
    const dirs = [
        path.join(process.cwd(), 'data'),
        path.join(process.cwd(), 'data', 'translations'),
        path.join(process.cwd(), 'data', 'reaction_gifs'),
        path.join(process.cwd(), 'logs'),
        path.join(process.cwd(), authDir),
        path.join(process.cwd(), authDir + '_backup')
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
                        
                        // Check if any mentioned users are AFK and notify the sender
                        if (!isFromSelf) {
                            try {
                                await checkMentionsForAfkUsers(sock, message);
                            } catch (afkError) {
                                logger.error('Error checking AFK mentions:', afkError);
                            }
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
    
    // Start HTTP server immediately for better platform detection
    setupHttpServer();
    logger.info('HTTP server started early in the boot process');
    
    // Check if running on a cloud platform
    if (isCloudPlatform()) {
        if (isHeroku()) {
            logger.info('Running on Heroku platform');
        } else if (isRailway()) {
            logger.info('Running on Railway platform');
        } else {
            logger.info('Running on a cloud platform');
        }
        
        // Initialize auth from environment variables if needed
        const initialized = await initializeAuthFromEnv();
        if (initialized) {
            logger.success('Successfully initialized auth from environment variables');
        } else {
            logger.warn('Could not initialize auth from environment variables, will attempt normal connection');
        }
    }
    
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
    
    // Start platform monitoring if on a cloud platform
    if (isCloudPlatform()) {
        if (isHeroku()) {
            startHerokuMonitoring(connectionManager);
        } else if (isRailway()) {
            // Railway has built-in monitoring, but we'll log platform info
            logger.info('Railway deployment detected - using built-in monitoring');
            // Log basic system information for Railway
            const os = require('os');
            logger.info(`System Information: ${os.platform()} ${os.arch()} with ${Math.round(os.totalmem() / (1024 * 1024))}MB RAM`);
            logger.info(`Railway Service ID: ${process.env.RAILWAY_SERVICE_ID || 'Not available'}`);
        }
    }
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

/**
 * Set up HTTP server for cloud platforms
 * This provides health checks and prevents idling on platforms like Heroku and Railway
 */
function setupHttpServer() {
    const express = require('express');
    const app = express();
    // Always use port 5000 for local development, but respect PORT env var for cloud platforms
    const PORT = process.env.PORT || 5000;
    
    // Set up status route
    app.get('/', (req, res) => {
        res.send('BLACKSKY-MD WhatsApp Bot is running');
    });
    
    // Set up health check route
    app.get('/health', (req, res) => {
        const healthStatus = getHealthStatus(connectionManager);
        res.json(healthStatus);
    });
    
    // QR code route for easy connection setup on cloud platforms
    app.get('/qr', (req, res) => {
        const status = connectionManager.getStatus();
        if (status.qr) {
            const qrCode = require('qrcode');
            res.setHeader('Content-Type', 'text/html');
            res.write('<html><head><title>WhatsApp QR Code</title>');
            res.write('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
            res.write('<style>body{font-family:Arial,sans-serif;text-align:center;margin-top:50px;background-color:#f5f5f5;}');
            res.write('h1{color:#075e54;}');
            res.write('.container{max-width:500px;margin:0 auto;padding:20px;background-color:white;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1);}');
            res.write('.qr-container{margin:20px 0;}');
            res.write('.refresh{margin-top:20px;color:#888;}');
            res.write('</style></head><body>');
            res.write('<div class="container">');
            res.write('<h1>BLACKSKY-MD WhatsApp QR Code</h1>');
            res.write('<p>Scan this QR code with your WhatsApp to connect the bot</p>');
            res.write('<div class="qr-container" id="qrcode"></div>');
            res.write('<p class="refresh">This page will refresh automatically every 30 seconds</p>');
            res.write('</div>');
            res.write('<script src="https://cdn.jsdelivr.net/npm/qrcode@1.4.4/build/qrcode.min.js"></script>');
            res.write('<script>');
            res.write(`QRCode.toCanvas(document.getElementById('qrcode'), '${status.qr}', function (error) {`);
            res.write('if (error) console.error(error);');
            res.write('});');
            res.write('setTimeout(function() { window.location.reload(); }, 30000);');
            res.write('</script>');
            res.write('</body></html>');
            res.end();
        } else if (status.isConnected) {
            res.setHeader('Content-Type', 'text/html');
            res.write('<html><head><title>WhatsApp Connected</title>');
            res.write('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
            res.write('<style>body{font-family:Arial,sans-serif;text-align:center;margin-top:50px;background-color:#f5f5f5;}');
            res.write('h1{color:#075e54;}');
            res.write('.container{max-width:500px;margin:0 auto;padding:20px;background-color:white;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1);}');
            res.write('.success{color:#25D366;font-size:24px;margin:20px 0;}');
            res.write('</style></head><body>');
            res.write('<div class="container">');
            res.write('<h1>BLACKSKY-MD WhatsApp Bot</h1>');
            res.write('<p class="success">✓ Connected to WhatsApp</p>');
            res.write('<p>The bot is up and running</p>');
            res.write('</div>');
            res.write('</body></html>');
            res.end();
        } else {
            res.setHeader('Content-Type', 'text/html');
            res.write('<html><head><title>WhatsApp Connecting</title>');
            res.write('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
            res.write('<meta http-equiv="refresh" content="5">');
            res.write('<style>body{font-family:Arial,sans-serif;text-align:center;margin-top:50px;background-color:#f5f5f5;}');
            res.write('h1{color:#075e54;}');
            res.write('.container{max-width:500px;margin:0 auto;padding:20px;background-color:white;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1);}');
            res.write('.connecting{color:#FFA500;font-size:20px;margin:20px 0;}');
            res.write('.loader{border:5px solid #f3f3f3;border-top:5px solid #075e54;border-radius:50%;width:50px;height:50px;animation:spin 1s linear infinite;margin:20px auto;}');
            res.write('@keyframes spin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}');
            res.write('</style></head><body>');
            res.write('<div class="container">');
            res.write('<h1>BLACKSKY-MD WhatsApp Bot</h1>');
            res.write('<p class="connecting">Connecting to WhatsApp...</p>');
            res.write('<div class="loader"></div>');
            res.write('<p>Waiting for QR code or connection. This page will refresh automatically.</p>');
            res.write('</div>');
            res.write('</body></html>');
            res.end();
        }
    });
    
    // Start server and bind to 0.0.0.0 to make it accessible from outside
    app.listen(PORT, '0.0.0.0', () => {
        logger.info(`HTTP server started on port ${PORT} (http://0.0.0.0:${PORT})`);
    });
    
    // Log server activity periodically to prevent dyno sleeping
    setInterval(() => {
        logger.debug('HTTP server activity ping to prevent dyno sleeping');
    }, 15 * 60 * 1000); // Every 15 minutes
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