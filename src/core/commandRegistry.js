/**
 * Command Registry
 * Manages command loading, initialization, and execution
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { loadCommandModule, isValidCommandModule, initializeModule } = require('../utils/moduleAdapter');
const { safeSendText } = require('../utils/jidHelper');
const { languageManager } = require('../utils/language');
const { normalizeUserIdForBanSystem } = require('../utils/userDatabase');

/**
 * Command registry for managing bot commands
 */
class CommandRegistry {
    constructor() {
        this.commands = new Map();
        this.modules = new Map();
        this.categories = new Map();
        this.initialized = false;
        this.loadingPromise = null;
        this.prefixes = ['!', '.', '#']; // Default command prefixes
        this.defaultPrefix = '!';
        this.cooldowns = new Map();
    }

    /**
     * Load commands from a directory
     * @param {string} dirPath Directory containing command modules
     * @returns {Promise<boolean>} Whether loading was successful
     */
    async loadCommands(dirPath) {
        if (this.loadingPromise) {
            logger.info('Command loading already in progress, waiting...');
            return this.loadingPromise;
        }

        this.loadingPromise = this._loadCommandsInternal(dirPath);
        const result = await this.loadingPromise;
        this.loadingPromise = null;
        return result;
    }

    /**
     * Internal implementation of command loading
     * @param {string} dirPath Directory containing command modules
     * @returns {Promise<boolean>} Whether loading was successful
     * @private
     */
    async _loadCommandsInternal(dirPath) {
        logger.info(`Loading commands from: ${dirPath}`);
        
        if (!fs.existsSync(dirPath)) {
            logger.warn(`Command directory does not exist: ${dirPath}`);
            return false;
        }
        
        try {
            // Clear existing commands
            this.commands.clear();
            this.modules.clear();
            this.categories.clear();
            
            // Get all .js files in the directory and subdirectories
            const files = this.getCommandFiles(dirPath);
            
            // Load each module
            for (const file of files) {
                await this.loadModule(file);
            }
            
            logger.info(`Loaded ${this.commands.size} commands from ${this.modules.size} modules`);
            this.initialized = true;
            return true;
        } catch (error) {
            logger.error('Error loading commands:', error);
            return false;
        }
    }

    /**
     * Get all command files in a directory
     * @param {string} dirPath Directory to scan
     * @param {Array} result Accumulator for recursive calls
     * @returns {Array} List of command files
     * @private
     */
    getCommandFiles(dirPath, result = []) {
        if (!fs.existsSync(dirPath)) return result;
        
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory()) {
                // Recursively process subdirectories
                this.getCommandFiles(fullPath, result);
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                result.push(fullPath);
            }
        }
        
        return result;
    }

    /**
     * Load a command module
     * @param {string} filePath Path to the module file
     * @returns {Promise<boolean>} Whether loading was successful
     * @private
     */
    async loadModule(filePath) {
        try {
            const module = loadCommandModule(filePath);
            
            if (!isValidCommandModule(module)) {
                logger.warn(`Invalid module format: ${filePath}`);
                return false;
            }
            
            const moduleName = path.basename(filePath, '.js');
            const category = module.category || path.basename(path.dirname(filePath));
            
            // Add module to registry
            this.modules.set(moduleName, {
                path: filePath,
                module: module,
                loaded: true,
                initialized: false
            });
            
            // Add category
            if (!this.categories.has(category)) {
                this.categories.set(category, []);
            }
            this.categories.get(category).push(moduleName);
            
            // Register individual commands
            for (const [cmdName, cmdFunc] of Object.entries(module.commands)) {
                if (typeof cmdFunc === 'function') {
                    this.commands.set(cmdName.toLowerCase(), {
                        name: cmdName,
                        module: moduleName,
                        category: category,
                        handler: cmdFunc
                    });
                }
            }
            
            logger.info(`Loaded module: ${moduleName} (${Object.keys(module.commands).length} commands)`);
            return true;
        } catch (error) {
            logger.error(`Error loading module ${filePath}:`, error);
            return false;
        }
    }

    /**
     * Initialize all modules with WhatsApp socket
     * @param {Object} sock WhatsApp socket connection
     * @returns {Promise<number>} Number of successfully initialized modules
     */
    async initializeModules(sock) {
        if (!sock) {
            logger.error('Cannot initialize modules: no socket provided');
            return 0;
        }
        
        logger.info('Initializing command modules...');
        let successCount = 0;
        
        for (const [moduleName, moduleInfo] of this.modules.entries()) {
            if (!moduleInfo.loaded) continue;
            
            try {
                const success = await initializeModule(moduleInfo.module, sock);
                moduleInfo.initialized = success;
                
                if (success) {
                    logger.info(`Initialized module: ${moduleName}`);
                    successCount++;
                } else {
                    logger.warn(`Failed to initialize module: ${moduleName}`);
                }
            } catch (error) {
                logger.error(`Error initializing module ${moduleName}:`, error);
                moduleInfo.initialized = false;
            }
        }
        
        logger.info(`Successfully initialized ${successCount}/${this.modules.size} modules`);
        return successCount;
    }

    /**
     * Check if a message contains a command
     * @param {string} text Message text
     * @returns {Object|null} Command information or null if not a command
     */
    parseCommand(text) {
        if (!text || typeof text !== 'string') return null;
        
        // Check each prefix
        for (const prefix of this.prefixes) {
            if (text.startsWith(prefix)) {
                // Extract command name and args
                const args = text.slice(prefix.length).trim().split(/\s+/);
                const commandName = args.shift().toLowerCase();
                
                if (commandName) {
                    return {
                        prefix,
                        command: commandName,
                        args
                    };
                }
            }
        }
        
        return null;
    }

    /**
     * Execute a command
     * @param {Object} sock WhatsApp socket connection
     * @param {Object} message Message object
     * @param {string} commandName Name of the command
     * @param {Array} args Command arguments
     * @returns {Promise<boolean>} Whether execution was successful
     */
    async executeCommand(sock, message, commandName, args) {
        const commandInfo = this.commands.get(commandName.toLowerCase());
        
        if (!commandInfo) {
            logger.debug(`Command not found: ${commandName}`);
            return false;
        }
        
        // Check cooldowns
        const cooldown = this.checkCooldown(message.key.remoteJid, commandName);
        if (cooldown > 0) {
            try {
                await safeSendText(
                    sock, 
                    message.key.remoteJid, 
                    languageManager.getText('system.command_on_cooldown', null, cooldown)
                );
            } catch (error) {
                logger.error('Error sending cooldown message:', error);
            }
            return false;
        }
        
        // Execute the command
        try {
            logger.debug(`Executing command: ${commandName}`);
            await commandInfo.handler(sock, message, args);
            
            // Set cooldown
            this.setCooldown(message.key.remoteJid, commandName);
            
            return true;
        } catch (error) {
            logger.error(`Error executing command ${commandName}:`, error);
            
            try {
                await safeSendText(
                    sock, 
                    message.key.remoteJid, 
                    languageManager.getText('system.error', null, error.message)
                );
            } catch (sendError) {
                logger.error('Error sending error message:', sendError);
            }
            
            return false;
        }
    }
    
    /**
     * Check if a command is on cooldown
     * @param {string} jid Chat JID
     * @param {string} commandName Command name
     * @returns {number} Remaining cooldown in seconds, or 0 if not on cooldown
     */
    checkCooldown(jid, commandName) {
        // Cooldowns are disabled
        return 0;
    }
    
    /**
     * Set cooldown for a command
     * @param {string} jid Chat JID
     * @param {string} commandName Command name
     * @param {number} duration Cooldown duration in milliseconds (default: 3000)
     */
    setCooldown(jid, commandName, duration = 3000) {
        // Cooldowns are disabled - do nothing
        return;
    }

    /**
     * Track recently processed messages to prevent loops
     * Using a Map with message IDs as keys and timestamps as values
     * @type {Map<string, number>}
     */
    recentlyProcessedMessages = new Map();
    
    /**
     * Max number of recent messages to track (for memory management)
     * @type {number}
     */
    maxRecentMessages = 100;
    
    /**
     * Check if a message was recently processed (to prevent loops)
     * @param {string} messageId Message ID
     * @returns {boolean} Whether the message was recently processed
     */
    wasRecentlyProcessed(messageId) {
        return this.recentlyProcessedMessages.has(messageId);
    }
    
    /**
     * Mark a message as processed
     * @param {string} messageId Message ID
     */
    markAsProcessed(messageId) {
        // Add to recent messages
        this.recentlyProcessedMessages.set(messageId, Date.now());
        
        // Clean up old entries if we have too many
        if (this.recentlyProcessedMessages.size > this.maxRecentMessages) {
            // Sort by timestamp and keep only the most recent ones
            const entries = [...this.recentlyProcessedMessages.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, this.maxRecentMessages);
            
            this.recentlyProcessedMessages = new Map(entries);
        }
    }

    /**
     * Process a message for commands
     * @param {Object} sock WhatsApp socket connection
     * @param {Object} message Message object
     * @returns {Promise<boolean>} Whether a command was executed
     */
    async processMessage(sock, message) {
        if (!this.initialized) {
            logger.warn('Command registry not initialized');
            return false;
        }
        
        if (!message || !message.message) {
            return false;
        }
        
        const messageId = message.key.id;
        
        // Anti-loop protection: Check if we've already processed this message
        if (this.wasRecentlyProcessed(messageId)) {
            logger.warn(`Anti-loop protection: Message ${messageId} was already processed, skipping`);
            return false;
        }
        
        // Get sender's JID (participant for groups, remoteJid for direct messages)
        const senderJid = message.key.participant || message.key.remoteJid;
        
        // Check if the sender is banned (unless it's a message from the bot itself)
        if (!message.key.fromMe && senderJid) {
            // Normalize the JID for consistent ban checking across different JID formats
            const normalizedUserId = normalizeUserIdForBanSystem(senderJid);
            
            // Check global banned users list with normalized ID
            if (global.bannedUsers && global.bannedUsers.has(normalizedUserId)) {
                logger.info(`Blocked command from banned user: ${normalizedUserId} (JID: ${senderJid})`);
                // Send a message with proper WhatsApp-style mentions telling the user they are banned
                try {
                    // Create mention text using the original userId format for WhatsApp mentions
                    const userId = senderJid.split('@')[0]; // Original format for display
                    const mentionText = `@${userId}`;
                    const fullText = `⛔ ${mentionText} you are banned from using the bot.`;
                    
                    // Send with full WhatsApp mention formatting
                    await sock.sendMessage(
                        message.key.remoteJid, 
                        { 
                            text: fullText, 
                            mentions: [senderJid],
                            // Include WhatsApp's required mention formatting
                            extendedTextMessage: {
                                text: fullText,
                                contextInfo: {
                                    mentionedJid: [senderJid]
                                }
                            }
                        }
                    );
                } catch (error) {
                    logger.error('Error sending banned user message:', error);
                }
                return false;
            }
        }
        
        // Special handling for self-messages to prevent command loops
        if (message.key.fromMe) {
            // If this is a self-message with a command prefix
            const anyText = message.message.conversation || 
                           message.message.extendedTextMessage?.text || '';
            
            const hasCommandPrefix = this.prefixes.some(prefix => anyText.startsWith(prefix));
            
            // We still allow self-messages, but we'll track them for logging
            if (hasCommandPrefix) {
                logger.info(`Processing self-command: ${anyText}`);
                // No cooldown applied - cooldowns disabled
            }
        }
        
        // Extract text from different message types
        let text = '';
        
        if (message.message.conversation) {
            text = message.message.conversation;
        } else if (message.message.extendedTextMessage?.text) {
            text = message.message.extendedTextMessage.text;
        } else {
            // No text content to process
            return false;
        }
        
        // Parse command
        const parsedCommand = this.parseCommand(text);
        if (!parsedCommand) {
            return false;
        }
        
        // Mark this message as processed to prevent loops
        this.markAsProcessed(messageId);
        
        // Execute command
        return await this.executeCommand(
            sock, 
            message, 
            parsedCommand.command, 
            parsedCommand.args
        );
    }

    /**
     * Get a list of all commands
     * @returns {Array} List of command details
     */
    getAllCommands() {
        const result = [];
        
        for (const [name, info] of this.commands.entries()) {
            result.push({
                name,
                module: info.module,
                category: info.category
            });
        }
        
        return result;
    }

    /**
     * Get command by name
     * @param {string} name Command name
     * @returns {Object|null} Command info or null if not found
     */
    getCommand(name) {
        return this.commands.get(name.toLowerCase()) || null;
    }

    /**
     * Get commands by category
     * @param {string} category Category name
     * @returns {Array} List of commands in the category
     */
    getCommandsByCategory(category) {
        const result = [];
        
        for (const [name, info] of this.commands.entries()) {
            if (info.category.toLowerCase() === category.toLowerCase()) {
                result.push({
                    name,
                    module: info.module,
                    category: info.category
                });
            }
        }
        
        return result;
    }

    /**
     * Get command categories
     * @returns {Array} List of categories
     */
    getCategories() {
        return Array.from(this.categories.keys());
    }

    /**
     * Get command statistics
     * @returns {Object} Command statistics
     */
    getStats() {
        return {
            totalCommands: this.commands.size,
            totalModules: this.modules.size,
            totalCategories: this.categories.size,
            initialized: this.initialized,
            categories: Object.fromEntries(this.categories)
        };
    }

    /**
     * Set command prefixes
     * @param {Array} prefixes Array of prefix strings
     */
    setPrefixes(prefixes) {
        if (Array.isArray(prefixes) && prefixes.length > 0) {
            this.prefixes = prefixes;
            this.defaultPrefix = prefixes[0];
        }
    }

    /**
     * Add a prefix
     * @param {string} prefix Prefix to add
     */
    addPrefix(prefix) {
        if (!this.prefixes.includes(prefix)) {
            this.prefixes.push(prefix);
        }
    }

    /**
     * Remove a prefix
     * @param {string} prefix Prefix to remove
     */
    removePrefix(prefix) {
        const index = this.prefixes.indexOf(prefix);
        if (index !== -1) {
            this.prefixes.splice(index, 1);
            
            // Update default prefix if needed
            if (prefix === this.defaultPrefix && this.prefixes.length > 0) {
                this.defaultPrefix = this.prefixes[0];
            }
        }
    }
}

// Create singleton instance
const commandRegistry = new CommandRegistry();

module.exports = {
    CommandRegistry,
    commandRegistry
};