/**
 * Main Bot Class
 * Integrates all components and provides high-level bot functionality
 */

const ConnectionHandler = require('./connection');
const MessageHandler = require('./messageHandler');
const SessionHandler = require('./sessionHandler');
const ResponseHandler = require('./responseHandler');
const logger = require('../utils/logger');
const { DisconnectReason } = require('@whiskeysockets/baileys');

class Bot {
    constructor(config = {}) {
        this.config = {
            name: 'BLACKSKY-MD',
            prefix: '!',
            owner: [],
            ...config
        };

        // Initialize connection with QR code display enabled
        const connectionConfig = {
            ...config.connection,
            printQR: true, // Force QR display
            browser: ['BLACKSKY-MD', 'Chrome', '1.0.0']
        };

        this.connection = new ConnectionHandler(connectionConfig);
        this.messageHandler = new MessageHandler(config.message);
        this.sessionHandler = new SessionHandler(config.session);
        this.responseHandler = new ResponseHandler(config.response);

        this.setupMessageHandler();
        this.isStarting = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.startTime = Date.now();
    }

    setupMessageHandler() {
        // Add core middleware
        this.messageHandler.use(async (ctx) => {
            // Add response methods to context
            ctx.reply = async (content, options = {}) => {
                return this.responseHandler.replyToMessage(ctx.socket, ctx.raw, content, options);
            };

            ctx.send = async (content, options = {}) => {
                return this.responseHandler.sendResponse(ctx.socket, ctx.sender, content, options);
            };

            ctx.typing = async (duration) => {
                return this.responseHandler.sendTyping(ctx.socket, ctx.sender, duration);
            };

            return ctx;
        });
    }

    async start() {
        try {
            if (this.isStarting) {
                logger.warn('Bot is already starting...');
                return null;
            }

            this.isStarting = true;
            logger.info(`Starting ${this.config.name}...`);

            // Set message handler in connection
            this.connection.setMessageHandler(this.messageHandler);

            // Connect to WhatsApp with enhanced error handling
            const socket = await this.connection.connect().catch(error => {
                this.isStarting = false;
                logger.error('Connection failed:', error);
                throw error;
            });

            if (!socket) {
                this.isStarting = false;
                throw new Error('Failed to initialize WhatsApp connection');
            }

            // Setup event listeners for the session
            socket.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'open') {
                    logger.success(`${this.config.name} is ready!`);
                    this.isStarting = false;
                    this.reconnectAttempts = 0;
                } else if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;

                    if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
                        logger.info(`Connection closed. Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay/1000}s`);

                        setTimeout(() => {
                            if (!this.isStarting) {
                                this.start();
                            }
                        }, delay);
                    } else if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
                        logger.warn('Session logged out. Please scan QR code to reconnect.');
                        await this.sessionHandler.deleteSession('default');
                        this.isStarting = false;
                        // Force new QR code generation
                        this.connection.resetQRCount();
                        this.start();
                    }
                }
            });

            return socket;

        } catch (error) {
            this.isStarting = false;
            logger.error('Error starting bot:', error);
            throw error;
        }
    }

    async stop() {
        try {
            await this.connection.disconnect();
            logger.info('Bot stopped');
        } catch (error) {
            logger.error('Error stopping bot:', error);
            throw error;
        }
    }

    command(name, handler, options = {}) {
        this.messageHandler.registerCommand(name, handler, options);
        return this;
    }

    use(middleware) {
        this.messageHandler.use(middleware);
        return this;
    }

    template(name, template) {
        this.responseHandler.registerTemplate(name, template);
        return this;
    }

    getStatus() {
        return {
            connected: this.connection.isConnected,
            activeSessions: this.sessionHandler.getActiveSessions(),
            activeProcesses: this.messageHandler.getActiveProcesses(),
            messageQueue: this.responseHandler.getQueueStatus(),
            startupState: this.isStarting,
            reconnectAttempts: this.reconnectAttempts,
            startTime: this.startTime,
            uptime: Date.now() - this.startTime
        };
    }
}

module.exports = Bot;