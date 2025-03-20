/**
 * QR Code Web Server
 * Provides a web interface for connecting to WhatsApp via QR code
 */

const express = require('express');
const http = require('http');
const QRCode = require('qrcode');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// Global variables
let qrCodeData = null;
let connectionStatus = 'disconnected';
let clientCount = 0;

/**
 * Set up the QR code web server
 * @param {number} port - Port to run the server on
 * @param {Object} sock - WhatsApp socket connection
 * @param {Object} connectionManager - Connection manager instance
 * @returns {Object} - The Express app and HTTP server
 */
function setupQRServer(port = 5000, sock, connectionManager) {
    // Create Express app
    const app = express();
    const server = http.createServer(app);
    const wss = new WebSocket.Server({ server });

    // Serve static files
    app.use(express.static(path.join(__dirname, '../public')));

    // Create public directory if it doesn't exist
    const publicDir = path.join(__dirname, '../public');
    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
    }

    // Create HTML file for QR code scanning
    createQRHTMLFile(publicDir);

    // Setup routes
    app.get('/', (req, res) => {
        res.sendFile(path.join(publicDir, 'index.html'));
    });

    app.get('/status', (req, res) => {
        res.json({
            connectionStatus,
            clientCount,
            qrAvailable: !!qrCodeData
        });
    });

    // WebSocket handling
    wss.on('connection', (ws) => {
        clientCount++;
        logger.info(`WebSocket client connected. Total clients: ${clientCount}`);

        // Send current QR code if available
        if (qrCodeData) {
            ws.send(JSON.stringify({ type: 'qr', data: qrCodeData }));
        }

        // Send current connection status
        ws.send(JSON.stringify({ type: 'status', data: connectionStatus }));

        ws.on('close', () => {
            clientCount--;
            logger.info(`WebSocket client disconnected. Total clients: ${clientCount}`);
        });
    });

    // Set up WhatsApp connection events
    if (sock) {
        sock.ev.on('connection.update', async (update) => {
            const { connection, qr } = update;

            // Handle QR code updates
            if (qr) {
                try {
                    // Convert QR to data URL
                    qrCodeData = await QRCode.toDataURL(qr);
                    broadcastToAll(wss, { type: 'qr', data: qrCodeData });
                    logger.info('New QR code sent to web clients');
                } catch (err) {
                    logger.error('Failed to generate QR code for web:', err);
                }
            }

            // Handle connection state changes
            if (connection) {
                connectionStatus = connection;
                broadcastToAll(wss, { type: 'status', data: connection });
                logger.info(`Connection status broadcast to web clients: ${connection}`);
            }
        });
    }

    // Start server
    server.listen(port, '0.0.0.0', () => {
        logger.info(`QR code server running on http://localhost:${port}`);
    });

    return { app, server };
}

/**
 * Broadcast a message to all connected WebSocket clients
 * @param {Object} wss - WebSocket server instance
 * @param {Object} data - Data to broadcast
 */
function broadcastToAll(wss, data) {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

/**
 * Create the HTML file for QR code scanning
 * @param {string} publicDir - Public directory path
 */
function createQRHTMLFile(publicDir) {
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp QR Code Scanner</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            text-align: center;
            background-color: #f0f0f0;
        }
        .container {
            max-width: 500px;
            margin: 0 auto;
            background-color: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        h1 {
            color: #128C7E;
        }
        #qrcode {
            margin: 30px auto;
            max-width: 300px;
        }
        #qrcode img {
            width: 100%;
            height: auto;
        }
        #status {
            margin: 20px 0;
            padding: 10px;
            border-radius: 5px;
            background-color: #e0e0e0;
        }
        .status-connected {
            background-color: #d4edda;
            color: #155724;
        }
        .status-disconnected {
            background-color: #f8d7da;
            color: #721c24;
        }
        .status-connecting {
            background-color: #fff3cd;
            color: #856404;
        }
        .instructions {
            margin-top: 20px;
            font-size: 14px;
            text-align: left;
            padding: 10px;
            background-color: #e9f5ff;
            border-left: 3px solid #128C7E;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>WhatsApp QR Code Scanner</h1>
        <div id="status">Connecting to WhatsApp...</div>
        <div id="qrcode">
            <p>Waiting for QR code...</p>
        </div>
        <div class="instructions">
            <p><strong>Instructions:</strong></p>
            <ol>
                <li>Open WhatsApp on your phone</li>
                <li>Tap Menu or Settings and select WhatsApp Web</li>
                <li>Scan the QR code above</li>
                <li>Stay connected to keep the session active</li>
            </ol>
        </div>
    </div>

    <script>
        // Connect to WebSocket server
        const ws = new WebSocket(\`ws://\${window.location.host}\`);
        const qrcodeEl = document.getElementById('qrcode');
        const statusEl = document.getElementById('status');

        // Connection opened
        ws.addEventListener('open', (event) => {
            console.log('Connected to server');
        });

        // Listen for messages
        ws.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
                case 'qr':
                    // Display QR code
                    qrcodeEl.innerHTML = \`<img src="\${message.data}" alt="WhatsApp QR Code">\`;
                    break;
                    
                case 'status':
                    // Update connection status
                    updateStatus(message.data);
                    break;
            }
        });

        // Handle connection status updates
        function updateStatus(status) {
            statusEl.className = ''; // Reset classes
            statusEl.classList.add('status-' + status);
            
            switch (status) {
                case 'open':
                    statusEl.textContent = 'Connected to WhatsApp!';
                    qrcodeEl.innerHTML = '<p>Successfully connected!</p>';
                    break;
                    
                case 'close':
                    statusEl.textContent = 'Disconnected from WhatsApp. Please refresh the page.';
                    break;
                    
                case 'connecting':
                    statusEl.textContent = 'Connecting to WhatsApp...';
                    break;
                    
                default:
                    statusEl.textContent = 'Status: ' + status;
            }
        }

        // Handle WebSocket errors and disconnections
        ws.addEventListener('error', (error) => {
            console.error('WebSocket error:', error);
            statusEl.textContent = 'Error connecting to server. Please refresh the page.';
            statusEl.className = 'status-disconnected';
        });

        ws.addEventListener('close', () => {
            console.log('Disconnected from server');
            statusEl.textContent = 'Disconnected from server. Please refresh the page.';
            statusEl.className = 'status-disconnected';
        });

        // Reconnect on page visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && ws.readyState !== WebSocket.OPEN) {
                window.location.reload();
            }
        });
    </script>
</body>
</html>
    `;

    fs.writeFileSync(path.join(publicDir, 'index.html'), htmlContent);
}

module.exports = {
    setupQRServer
};