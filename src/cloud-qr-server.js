/**
 * Cloud-Optimized WhatsApp QR Web Server
 * Provides a web interface for scanning QR codes and restores connection automatically
 */

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs').promises;
const logger = require('./utils/logger');
const cloudConnection = require('./cloud-optimized-connection');
const messageHandlerModule = require('./handlers/messageHandler');

// Web server components
let app = null;
let server = null;
let wss = null;
let wsClients = [];

// Connection state
let sock = null;
let reconnectTimer = null;

/**
 * Initialize the Express web server and WebSocket server
 */
async function initServer(port = 5000) {
    try {
        // Create Express app
        app = express();
        app.use(express.static(path.join(__dirname, '..', 'public')));
        
        // Main route for QR code display
        app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '..', 'public', 'qr.html'));
        });
        
        // API route for connection status
        app.get('/status', (req, res) => {
            res.json({
                connected: cloudConnection.isConnected(),
                qrGenerated: cloudConnection.qrGenerated(),
                uptime: process.uptime()
            });
        });
        
        // Create HTTP server
        server = http.createServer(app);
        
        // Create WebSocket server
        wss = new WebSocketServer({ server });
        
        // Handle WebSocket connections
        wss.on('connection', (ws) => {
            wsClients.push(ws);
            
            // Send current status
            ws.send(JSON.stringify({
                type: 'status',
                connected: cloudConnection.isConnected(),
                message: cloudConnection.isConnected() ? 'WhatsApp is connected' : 'Waiting for connection'
            }));
            
            // Handle client disconnect
            ws.on('close', () => {
                wsClients = wsClients.filter(client => client !== ws);
            });
        });
        
        // Register QR code callback
        cloudConnection.onQR((qrImage) => {
            wsClients.forEach(client => {
                if (client.readyState === 1) { // OPEN
                    client.send(JSON.stringify({
                        type: 'qr',
                        qr: qrImage
                    }));
                }
            });
        });
        
        // Start server
        server.listen(port, '0.0.0.0', () => {
            logger.info(`\n✅ QR Web Server running at http://localhost:${port}`);
            logger.info(`✅ Use this URL to access the WhatsApp QR code scanning interface`);
        });
        
        return true;
    } catch (err) {
        logger.error(`Server initialization error: ${err.message}`);
        return false;
    }
}

/**
 * Set up message handler for WhatsApp
 * @param {Object} socket - WhatsApp connection socket
 */
async function setupMessageHandler(socket) {
    try {
        // Initialize message handler
        await messageHandlerModule.init();
        
        // Set up messages.upsert event handler
        socket.ev.on('messages.upsert', async (m) => {
            if (m.type === 'notify') {
                try {
                    for (const msg of m.messages) {
                        if (messageHandlerModule.isInitialized && messageHandlerModule.isInitialized()) {
                            await messageHandlerModule.messageHandler(socket, msg);
                        } else {
                            // Basic command prefix detection as fallback
                            const msgType = Object.keys(msg.message || {})[0];
                            const msgText = msgType === 'conversation' ? msg.message.conversation :
                                msgType === 'extendedTextMessage' ? msg.message.extendedTextMessage.text : '';
                            
                            if (msgText && msgText.startsWith('.')) {
                                logger.info(`Received command: ${msgText}`);
                                // Simply respond that the bot is starting up
                                const sender = msg.key.remoteJid;
                                await socket.sendMessage(sender, { text: '⚙️ Bot is starting up. Please try again in a moment.' });
                            }
                        }
                    }
                } catch (err) {
                    logger.error(`Error handling message: ${err.message}`);
                }
            }
        });
        
        // Broadcast connection status to all WebSocket clients
        wsClients.forEach(client => {
            if (client.readyState === 1) { // OPEN
                client.send(JSON.stringify({
                    type: 'status',
                    connected: true,
                    message: 'WhatsApp connection active and message handler initialized'
                }));
            }
        });
        
    } catch (err) {
        logger.error(`Error setting up message handler: ${err.message}`);
    }
}

/**
 * Start the WhatsApp connection
 */
async function startConnection() {
    try {
        // Clear any existing reconnect timer
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        
        // Connect to WhatsApp
        sock = await cloudConnection.connect();
        
        // Set up message handler if connection successful
        if (sock) {
            await setupMessageHandler(sock);
        }
        
        return sock;
    } catch (err) {
        logger.error(`Error starting connection: ${err.message}`);
        
        // Set up automatic reconnect
        reconnectTimer = setTimeout(() => {
            startConnection().catch(e => {
                logger.error(`Reconnection failed: ${e.message}`);
            });
        }, 10000);
        
        return null;
    }
}

/**
 * Start the QR web server and WhatsApp connection
 */
async function startServer() {
    try {
        // Initialize web server
        await initServer();
        
        // Start WhatsApp connection
        sock = await startConnection();
        
        // Set up process exit handler
        process.on('SIGINT', async () => {
            logger.info('Received SIGINT, cleaning up...');
            
            // Close any active connection
            if (sock) {
                try {
                    await sock.logout();
                } catch (err) {
                    // Ignore errors during logout
                }
            }
            
            process.exit(0);
        });
        
        return sock;
    } catch (err) {
        logger.error(`Fatal error starting server: ${err.stack}`);
        return null;
    }
}

// Start the server
startServer().catch(err => {
    logger.error(`Fatal error starting server: ${err.message}`);
});

module.exports = { startServer };