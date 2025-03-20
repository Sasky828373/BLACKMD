/**
 * BLACKSKY-MD WhatsApp Bot - Main Entry Point
 * Using @whiskeysockets/baileys with enhanced connection persistence
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const logger = require('../utils/logger');
const messageHandler = require('./messageHandler');
const ConnectionManager = require('./connectionManager');
const SessionManager = require('./sessionManager');
const commandRegistry = require('./commandRegistry');
const { setupQRServer } = require('./qrServer');

// Global variables
let connectionManager;
let sessionManager;
let connectionRetryCount = 0;
const MAX_RETRIES = 10;
const QR_SERVER_PORT = process.env.PORT || 5000;

/**
 * Initialize command modules and message handler
 */
async function initializeBot() {
    try {
        logger.info('Initializing WhatsApp bot...');

        // Initialize session manager
        sessionManager = new SessionManager();
        await sessionManager.initialize();

        // Initialize message handler with command prefix
        await messageHandler.initialize({
            prefix: '!',
            maxQueueSize: 100
        });

        // Set up connection manager
        connectionManager = new ConnectionManager({
            printQRInTerminal: true,
            maxReconnectAttempts: MAX_RETRIES,
            onQRUpdate: handleQRUpdate
        });
        await connectionManager.initialize();

        // Start connection
        const sock = await connectionManager.connect();

        // Set up message handler for events
        setupMessageHandler(sock);

        // Setup QR web server for easier connection
        if (process.env.ENABLE_QR_SERVER !== 'false') {
            setupQRServer(QR_SERVER_PORT, sock, connectionManager);
        }

        // Add reconnection event listener
        connectionManager.onConnectionEvent((event) => {
            if (event === 'connected') {
                connectionRetryCount = 0;
                logger.info('Connection established successfully');
            } else if (event === 'reconnect_error') {
                connectionRetryCount++;
                logger.warn(`Reconnection attempt ${connectionRetryCount} failed`);
            } else if (event === 'max_retries_reached') {
                logger.error('Maximum reconnection attempts reached. Bot stopped.');
                process.exit(1);
            }
        });

        logger.info('Bot initialization complete');
    } catch (err) {
        logger.error('Error during bot initialization:', err);
    }
}

/**
 * Set up message handler for WhatsApp
 * @param {Object} sock - WhatsApp connection socket
 */
async function setupMessageHandler(sock) {
    if (!sock) return;

    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
        if (!messages || !messages[0]) return;

        try {
            const msg = messages[0];
            
            // Filter out status broadcast messages and messages from self
            if (msg.key.remoteJid === 'status@broadcast') return;
            if (msg.key.fromMe) return;

            // Handle message via message handler
            await messageHandler.handleMessage(sock, msg);
        } catch (err) {
            logger.error('Error handling message:', err);
        }
    });

    // Handle connection updates
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            logger.info(`Connection closed with status: ${statusCode}`);
        } else if (connection === 'open') {
            logger.info('Connection opened');
        }
    });
}

/**
 * Handle QR code updates
 * @param {string} qr - QR code data
 */
async function handleQRUpdate(qr) {
    if (!qr) return;
    
    try {
        logger.info('New QR code received. Scan with WhatsApp to connect.');
        
        // Generate QR code as ASCII in terminal
        if (process.env.DISABLE_QR_TERMINAL !== 'true') {
            QRCode.toString(qr, { type: 'terminal', small: true }, (err, url) => {
                if (err) return logger.error('QR generation error:', err);
                console.log(url);
            });
        }
        
        // Save QR code as an image file
        if (process.env.SAVE_QR_IMAGE === 'true') {
            const qrImagePath = path.join(__dirname, '../../qrcode.png');
            await QRCode.toFile(qrImagePath, qr);
            logger.info(`QR code saved to ${qrImagePath}`);
        }
    } catch (err) {
        logger.error('Error handling QR update:', err);
    }
}

/**
 * Get status information about the bot
 * @returns {Object} Status information
 */
function getStatusInformation() {
    return {
        connection: connectionManager ? connectionManager.getStatus() : null,
        session: sessionManager ? sessionManager.getStats() : null,
        commands: {
            total: commandRegistry.getAllCommands().size,
            categories: commandRegistry.getAllCategories()
        },
        messageHandler: messageHandler.getStats(),
        system: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            node: process.version
        }
    };
}

// Start the bot
initializeBot().catch(err => {
    logger.error('Failed to start bot:', err);
    process.exit(1);
});

// Handle process termination
process.on('SIGINT', async () => {
    logger.info('Received SIGINT. Shutting down...');
    
    if (connectionManager) {
        await connectionManager.disconnect();
    }
    
    process.exit(0);
});

module.exports = {
    getStatusInformation
};