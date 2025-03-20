/**
 * QR Web Server
 * Provides a simple web interface for scanning WhatsApp QR codes
 */

const express = require('express');
const path = require('path');
const http = require('http');
const fs = require('fs');
const logger = require('../utils/logger');
const { connectionManager } = require('./connectionManager');

// Default port
const DEFAULT_PORT = 5000;

class QRWebServer {
    constructor(options = {}) {
        this.options = {
            port: options.port || DEFAULT_PORT,
            tempDir: options.tempDir || path.join(process.cwd(), 'temp'),
            autoStart: options.autoStart !== false
        };
        
        this.app = express();
        this.server = null;
        this.isRunning = false;
        this.currentQR = null;
    }
    
    /**
     * Initialize the QR web server
     */
    async initialize() {
        // Ensure temp directory exists
        if (!fs.existsSync(this.options.tempDir)) {
            fs.mkdirSync(this.options.tempDir, { recursive: true });
            logger.info(`Created temp directory: ${this.options.tempDir}`);
        }
        
        // Set up Express app
        this.app.use(express.static(path.join(__dirname, '..', '..', 'public')));
        
        // Configure routes
        this._setupRoutes();
        
        // Connect to WhatsApp events
        this._setupWhatsAppEvents();
        
        // Auto-start if configured
        if (this.options.autoStart) {
            await this.start();
        }
    }
    
    /**
     * Set up server routes
     * @private
     */
    _setupRoutes() {
        // Main route for QR scanning
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '..', '..', 'views', 'qr.html'));
        });
        
        // API routes
        this.app.get('/api/status', (req, res) => {
            const status = {
                connected: connectionManager.getState() === 'connected',
                state: connectionManager.getState(),
                hasQR: !!this.currentQR
            };
            
            res.json(status);
        });
        
        // QR code endpoint
        this.app.get('/api/qr', (req, res) => {
            const qrCode = connectionManager.getQRCode();
            
            if (qrCode) {
                res.json({ qr: qrCode });
            } else {
                res.status(404).json({ error: 'No QR code available' });
            }
        });
        
        // QR image endpoint (serve from file)
        this.app.get('/qr.png', (req, res) => {
            const qrImagePath = path.join(this.options.tempDir, 'latest_qr.png');
            
            if (fs.existsSync(qrImagePath)) {
                res.sendFile(qrImagePath);
            } else {
                res.status(404).send('QR image not available');
            }
        });
        
        // Connection status endpoint
        this.app.get('/api/reconnect', (req, res) => {
            connectionManager.forceReconnect()
                .then(() => {
                    res.json({ success: true, message: 'Reconnection initiated' });
                })
                .catch(err => {
                    res.status(500).json({ 
                        success: false, 
                        message: 'Reconnection failed', 
                        error: err.message 
                    });
                });
        });
    }
    
    /**
     * Set up WhatsApp connection events
     * @private
     */
    _setupWhatsAppEvents() {
        // QR code event
        connectionManager.on('qr', (qr) => {
            this.currentQR = qr;
        });
        
        // Connection event
        connectionManager.on('connected', () => {
            this.currentQR = null;
        });
        
        // Reconnecting event
        connectionManager.on('reconnecting', () => {
            // We could notify clients here
        });
        
        // Disconnected event
        connectionManager.on('disconnected', () => {
            // We could notify clients here
        });
    }
    
    /**
     * Create a simple HTML page for QR scanning
     * @private
     */
    _createQRHtml() {
        const htmlDir = path.join(process.cwd(), 'views');
        const htmlPath = path.join(htmlDir, 'qr.html');
        
        if (!fs.existsSync(htmlDir)) {
            fs.mkdirSync(htmlDir, { recursive: true });
        }
        
        // Only create if it doesn't exist
        if (!fs.existsSync(htmlPath)) {
            const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp QR Scanner</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f0f0f0;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            flex-direction: column;
        }
        .container {
            background-color: white;
            border-radius: 10px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            padding: 30px;
            text-align: center;
            max-width: 500px;
            width: 90%;
        }
        h1 {
            color: #075e54;
            margin-bottom: 20px;
        }
        .qr-container {
            margin: 30px 0;
            padding: 20px;
            background-color: #f8f8f8;
            border-radius: 8px;
            display: flex;
            justify-content: center;
        }
        .qr-container img {
            max-width: 100%;
            height: auto;
        }
        .status {
            margin-top: 20px;
            padding: 10px;
            border-radius: 5px;
            font-weight: bold;
        }
        .connected {
            background-color: #dcf8c6;
            color: #075e54;
        }
        .disconnected {
            background-color: #ffebee;
            color: #d32f2f;
        }
        .waiting {
            background-color: #fff9c4;
            color: #ff8f00;
        }
        button {
            background-color: #075e54;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            margin-top: 20px;
        }
        button:hover {
            background-color: #128c7e;
        }
        .instructions {
            margin-top: 20px;
            color: #666;
            font-size: 14px;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>WhatsApp QR Scanner</h1>
        <div class="qr-container" id="qrContainer">
            <img src="/qr.png" id="qrImage" alt="QR Code" />
        </div>
        <div class="status waiting" id="status">Waiting for connection...</div>
        <button id="refreshBtn">Refresh QR Code</button>
        <div class="instructions">
            <p>1. Open WhatsApp on your phone</p>
            <p>2. Tap Menu or Settings and select WhatsApp Web</p>
            <p>3. Point your phone to this screen to scan the QR code</p>
        </div>
    </div>

    <script>
        // Function to update status
        function updateStatus() {
            fetch('/api/status')
                .then(response => response.json())
                .then(data => {
                    const statusElement = document.getElementById('status');
                    if (data.connected) {
                        statusElement.className = 'status connected';
                        statusElement.textContent = 'Connected to WhatsApp!';
                        document.getElementById('qrContainer').style.display = 'none';
                        document.getElementById('refreshBtn').style.display = 'none';
                    } else if (data.hasQR) {
                        statusElement.className = 'status waiting';
                        statusElement.textContent = 'Waiting for you to scan the QR code...';
                        document.getElementById('qrContainer').style.display = 'flex';
                        document.getElementById('refreshBtn').style.display = 'block';
                        // Reload QR image
                        const qrImage = document.getElementById('qrImage');
                        qrImage.src = '/qr.png?t=' + new Date().getTime();
                    } else {
                        statusElement.className = 'status disconnected';
                        statusElement.textContent = 'Disconnected. Waiting for QR code...';
                        document.getElementById('qrContainer').style.display = 'none';
                        document.getElementById('refreshBtn').style.display = 'block';
                    }
                })
                .catch(err => {
                    console.error('Error checking status:', err);
                });
        }

        // Refresh QR code
        document.getElementById('refreshBtn').addEventListener('click', function() {
            fetch('/api/reconnect')
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        const statusElement = document.getElementById('status');
                        statusElement.className = 'status waiting';
                        statusElement.textContent = 'Reconnecting...please wait';
                        setTimeout(updateStatus, 3000);
                    }
                })
                .catch(err => {
                    console.error('Error reconnecting:', err);
                });
        });

        // Update status on load and every 5 seconds
        updateStatus();
        setInterval(updateStatus, 5000);
    </script>
</body>
</html>`;
            
            fs.writeFileSync(htmlPath, html);
            logger.info(`Created QR HTML page at ${htmlPath}`);
        }
    }
    
    /**
     * Start the web server
     * @returns {Promise<void>}
     */
    async start() {
        if (this.isRunning) {
            logger.warn('QR Web Server is already running');
            return;
        }
        
        try {
            // Create HTML file if needed
            this._createQRHtml();
            
            // Create HTTP server
            this.server = http.createServer(this.app);
            
            // Start listening
            await new Promise((resolve, reject) => {
                this.server.listen(this.options.port, '0.0.0.0', err => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    this.isRunning = true;
                    logger.success(`QR Web Server running at http://localhost:${this.options.port}`);
                    resolve();
                });
            });
        } catch (err) {
            logger.error('Error starting QR Web Server:', err);
            throw err;
        }
    }
    
    /**
     * Stop the web server
     * @returns {Promise<void>}
     */
    async stop() {
        if (!this.isRunning || !this.server) {
            logger.warn('QR Web Server is not running');
            return;
        }
        
        try {
            // Close the HTTP server
            await new Promise((resolve, reject) => {
                this.server.close(err => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    this.isRunning = false;
                    logger.info('QR Web Server stopped');
                    resolve();
                });
            });
        } catch (err) {
            logger.error('Error stopping QR Web Server:', err);
            throw err;
        }
    }
}

// Create singleton instance
const qrWebServer = new QRWebServer();

module.exports = {
    QRWebServer,
    qrWebServer
};