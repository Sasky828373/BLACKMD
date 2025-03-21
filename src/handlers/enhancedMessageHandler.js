/**
 * Enhanced Message Handler
 * Processes incoming WhatsApp messages and routes them to appropriate commands
 */

const logger = require('../utils/logger');
const { standardCommandLoader } = require('../utils/standardCommandLoader');
const { isJidGroup, isJidUser, safeSendMessage, safeSendText } = require('../utils/jidHelper');

class EnhancedMessageHandler {
    constructor(config = {}) {
        this.config = {
            prefix: process.env.BOT_PREFIX || '!',
            owner: process.env.OWNER_NUMBER || '4915563151347',
            cooldowns: new Map(),
            defaultCooldown: 3,
            ...config
        };
        
        this.initialized = false;
        this.setupMessageFilters();
        this.setupMessageQueue();
    }
    
    /**
     * Set up message filters
     */
    setupMessageFilters() {
        this.filters = {
            // Check if message is a command
            isCommand: (message) => {
                if (!message?.message) return false;
                
                // Get message content
                const content = this.getMessageContent(message);
                if (!content) return false;
                
                // Check if content starts with prefix
                return content.startsWith(this.config.prefix);
            },
            
            // Check if sender is owner
            isOwner: (message) => {
                if (!message?.key?.remoteJid) return false;
                
                const senderNumber = message.key.remoteJid.split('@')[0];
                return senderNumber === this.config.owner;
            }
        };
    }
    
    /**
     * Set up message queue for better performance
     */
    setupMessageQueue() {
        this.messageQueue = [];
        this.isProcessing = false;
        
        // Process message queue at regular intervals
        setInterval(() => this.processMessageQueue(), 50);
    }
    
    /**
     * Initialize the message handler
     * @returns {Promise<boolean>} Success status
     */
    async initialize() {
        try {
            if (this.initialized) {
                return true;
            }
            
            logger.info('Initializing enhanced message handler...');
            
            // Initialize command loader
            const success = await standardCommandLoader.initialize();
            
            if (!success) {
                logger.error('Failed to initialize command loader');
                return false;
            }
            
            // Get command stats
            const stats = standardCommandLoader.getStats();
            logger.info(`Loaded ${stats.loadedCommands} of ${stats.totalCommands} commands`);
            
            this.initialized = true;
            return true;
            
        } catch (error) {
            logger.error('Error initializing message handler:', error);
            return false;
        }
    }
    
    /**
     * Handle an incoming message
     * @param {Object} sock WhatsApp socket connection
     * @param {Object} message Message object
     * @returns {Promise<boolean>} Success status
     */
    async handleMessage(sock, message) {
        try {
            // Add message to queue
            this.messageQueue.push({ sock, message });
            return true;
        } catch (error) {
            logger.error('Error queueing message:', error);
            return false;
        }
    }
    
    /**
     * Process the message queue
     */
    async processMessageQueue() {
        if (this.isProcessing || this.messageQueue.length === 0) {
            return;
        }
        
        this.isProcessing = true;
        
        try {
            // Get next message
            const { sock, message } = this.messageQueue.shift();
            
            // Process message
            await this.processMessage(sock, message);
        } catch (error) {
            logger.error('Error processing message queue:', error);
        } finally {
            this.isProcessing = false;
        }
    }
    
    /**
     * Process a message
     * @param {Object} sock WhatsApp socket connection
     * @param {Object} message Message object
     */
    async processMessage(sock, message) {
        try {
            // Skip if no message content
            if (!message?.message) return;
            
            // Skip if no remote JID
            if (!message?.key?.remoteJid) return;
            
            // Get message content
            const messageContent = this.getMessageContent(message);
            if (!messageContent) return;
            
            // Check if message is a command
            if (this.filters.isCommand(message)) {
                await this.handleCommand(sock, message, messageContent);
            }
            
        } catch (error) {
            logger.error('Error processing message:', error);
        }
    }
    
    /**
     * Handle a command
     * @param {Object} sock WhatsApp socket connection
     * @param {Object} message Message object
     * @param {string} content Message content
     */
    async handleCommand(sock, message, content) {
        try {
            // Extract command name and arguments
            const commandText = content.slice(this.config.prefix.length).trim();
            if (!commandText) return;
            
            const [commandName, ...args] = commandText.split(' ');
            if (!commandName) return;
            
            // Get command from loader
            const command = standardCommandLoader.getCommand(commandName.toLowerCase());
            
            // Check if command exists
            if (!command) {
                // Send unknown command message
                await this.sendUnknownCommandMessage(sock, message);
                return;
            }
            
            // Check if command is on cooldown
            if (await this.isOnCooldown(message, command)) {
                return;
            }
            
            // Check permissions
            const hasPermission = await standardCommandLoader.hasPermission(
                message.key.remoteJid,
                command.config.permissions,
                { number: this.config.owner }
            );
            
            if (!hasPermission) {
                await this.sendNoPermissionMessage(sock, message);
                return;
            }
            
            // Execute command
            logger.info(`Executing command: ${commandName} from ${message.key.remoteJid}`);
            await command.execute(sock, message, args);
            
            // Set cooldown
            this.setCooldown(message, command);
            
        } catch (error) {
            logger.error(`Error handling command: ${error.message}`, error);
            
            // Send error message
            await this.sendErrorMessage(sock, message, error);
        }
    }
    
    /**
     * Check if a command is on cooldown
     * @param {Object} message Message object
     * @param {Object} command Command object
     * @returns {Promise<boolean>} Whether the command is on cooldown
     */
    async isOnCooldown(message, command) {
        // Cooldowns are disabled
        return false;
    }
    
    /**
     * Set cooldown for a command
     * @param {Object} message Message object
     * @param {Object} command Command object
     */
    setCooldown(message, command) {
        // Cooldowns are disabled - do nothing
        return;
    }
    
    /**
     * Get content from a message
     * @param {Object} message Message object
     * @returns {string|null} Message content
     */
    getMessageContent(message) {
        return message.message?.conversation ||
               message.message?.extendedTextMessage?.text ||
               message.message?.imageMessage?.caption ||
               message.message?.videoMessage?.caption ||
               null;
    }
    
    /**
     * Send unknown command message
     * @param {Object} sock WhatsApp socket connection
     * @param {Object} message Message object
     */
    async sendUnknownCommandMessage(sock, message) {
        await safeSendText(sock, message.key.remoteJid, 
            `❌ Unknown command. Use ${this.config.prefix}help to see available commands.`
        );
    }
    
    /**
     * Send no permission message
     * @param {Object} sock WhatsApp socket connection
     * @param {Object} message Message object
     */
    async sendNoPermissionMessage(sock, message) {
        await safeSendText(sock, message.key.remoteJid,
            '❌ You do not have permission to use this command.'
        );
    }
    
    /**
     * Send error message
     * @param {Object} sock WhatsApp socket connection
     * @param {Object} message Message object
     * @param {Error} error Error object
     */
    async sendErrorMessage(sock, message, error) {
        await safeSendText(sock, message.key.remoteJid,
            `❌ Error executing command: ${error.message}`
        );
    }
    
    /**
     * Get status of the message handler
     * @returns {Object} Status object
     */
    getStatus() {
        return {
            initialized: this.initialized,
            queueSize: this.messageQueue.length,
            commandsLoaded: standardCommandLoader.getStats().loadedCommands,
            totalCommands: standardCommandLoader.getStats().totalCommands
        };
    }
}

// Export a singleton instance
const enhancedMessageHandler = new EnhancedMessageHandler();

module.exports = {
    enhancedMessageHandler,
    EnhancedMessageHandler
};