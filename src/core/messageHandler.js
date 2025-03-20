/**
 * Enhanced Message Handler for WhatsApp Bot
 * Provides improved message processing with queue management and error handling
 */

const logger = require('../utils/logger');
const commandRegistry = require('./commandRegistry');

class MessageHandler {
    constructor() {
        this.initialized = false;
        this.messageQueue = [];
        this.isProcessing = false;
        this.prefix = '!';
        this.maxQueueSize = 50;
        this.defaultErrorMessage = 'Sorry, an error occurred while processing your command.';
    }

    /**
     * Initialize the message handler
     * @param {Object} options Configuration options
     * @returns {Promise<boolean>} Whether initialization was successful
     */
    async initialize(options = {}) {
        try {
            // Apply configuration
            if (options.prefix) this.prefix = options.prefix;
            if (options.maxQueueSize) this.maxQueueSize = options.maxQueueSize;
            if (options.defaultErrorMessage) this.defaultErrorMessage = options.defaultErrorMessage;
            
            // Initialize command registry
            await commandRegistry.initialize();
            
            this.initialized = true;
            logger.info('Message handler initialized successfully');
            
            // Start the queue processor
            this.startQueueProcessor();
            
            return true;
        } catch (error) {
            logger.error('Failed to initialize message handler:', error);
            return false;
        }
    }

    /**
     * Handle an incoming message
     * @param {Object} sock The WhatsApp socket
     * @param {Object} message The message object
     * @returns {Promise<boolean>} Whether the message was handled
     */
    async handleMessage(sock, message) {
        if (!this.initialized) {
            logger.warn('Message handler not initialized');
            return false;
        }

        try {
            // Check if the message is a command
            if (!this.isCommand(message)) {
                return false;
            }

            // Extract command and arguments
            const { commandName, args } = this.parseCommand(message);

            // Queue the command for execution
            this.queueCommand(sock, message, commandName, args);
            return true;
        } catch (error) {
            logger.error('Error handling message:', error);
            return false;
        }
    }

    /**
     * Check if a message is a command
     * @param {Object} message The message object
     * @returns {boolean} Whether the message is a command
     */
    isCommand(message) {
        try {
            if (!message.message) return false;
            
            const conversation = message.message.conversation;
            const extendedText = message.message.extendedTextMessage?.text;
            const text = conversation || extendedText;
            
            if (!text) return false;
            
            return text.trim().startsWith(this.prefix);
        } catch (error) {
            logger.error('Error checking if message is command:', error);
            return false;
        }
    }

    /**
     * Parse a command message into command name and arguments
     * @param {Object} message The message object
     * @returns {Object} Object containing commandName and args
     */
    parseCommand(message) {
        try {
            const conversation = message.message.conversation;
            const extendedText = message.message.extendedTextMessage?.text;
            const text = conversation || extendedText;
            
            if (!text) {
                return { commandName: '', args: [] };
            }
            
            const [rawCommandName, ...args] = text.trim().slice(this.prefix.length).split(' ');
            const commandName = rawCommandName.toLowerCase();
            
            return { commandName, args };
        } catch (error) {
            logger.error('Error parsing command:', error);
            return { commandName: '', args: [] };
        }
    }

    /**
     * Queue a command for execution
     * @param {Object} sock The WhatsApp socket
     * @param {Object} message The message object
     * @param {string} commandName The name of the command
     * @param {Array} args Command arguments
     */
    queueCommand(sock, message, commandName, args) {
        if (this.messageQueue.length >= this.maxQueueSize) {
            logger.warn(`Message queue full, dropping command: ${commandName}`);
            return;
        }
        
        this.messageQueue.push({
            sock,
            message,
            commandName,
            args,
            timestamp: Date.now()
        });
        
        logger.info(`Queued command: ${commandName} (Queue size: ${this.messageQueue.length})`);
    }

    /**
     * Start the queue processor
     */
    startQueueProcessor() {
        setInterval(() => this.processNextInQueue(), 100);
    }

    /**
     * Process the next command in the queue
     */
    async processNextInQueue() {
        if (this.isProcessing || this.messageQueue.length === 0) {
            return;
        }
        
        this.isProcessing = true;
        
        try {
            const { sock, message, commandName, args } = this.messageQueue.shift();
            
            // Check if command exists
            if (!commandRegistry.getCommand(commandName)) {
                logger.info(`Command not found: ${commandName}`);
                this.isProcessing = false;
                return;
            }
            
            logger.info(`Executing command: ${commandName}`);
            
            try {
                await commandRegistry.executeCommand(commandName, sock, message, args);
            } catch (error) {
                logger.error(`Error executing command ${commandName}:`, error);
                await this.sendErrorMessage(sock, message, error);
            }
        } catch (error) {
            logger.error('Error processing message from queue:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Send an error message to the user
     * @param {Object} sock The WhatsApp socket
     * @param {Object} message The original message
     * @param {Error} error The error that occurred
     */
    async sendErrorMessage(sock, message, error) {
        try {
            const jid = message.key.remoteJid;
            const errorMessage = this.formatErrorMessage(error);
            
            await sock.sendMessage(jid, { text: errorMessage });
        } catch (sendError) {
            logger.error('Failed to send error message:', sendError);
        }
    }

    /**
     * Format an error message for display to the user
     * @param {Error} error The error that occurred
     * @returns {string} Formatted error message
     */
    formatErrorMessage(error) {
        if (!error) {
            return this.defaultErrorMessage;
        }
        
        // Return a user-friendly message
        return `${this.defaultErrorMessage}\n\nDetails: ${error.message || 'Unknown error'}`;
    }

    /**
     * Get statistics about the message handler
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            initialized: this.initialized,
            queueSize: this.messageQueue.length,
            commandsRegistered: commandRegistry.getAllCommands().size,
            prefix: this.prefix
        };
    }
}

module.exports = new MessageHandler();