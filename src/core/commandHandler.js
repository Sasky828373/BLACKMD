/**
 * Command Handler
 * Manages command loading, execution, and error handling
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { safeSendText } = require('../utils/jidHelper');

class CommandHandler {
    constructor() {
        this.commands = {};
        this.aliases = {};
        this.categories = new Set();
        this.moduleHelpTexts = {};
        this.initialized = false;
        this.commandsDir = path.join(process.cwd(), 'src', 'commands');
    }

    /**
     * Initialize the command handler and load all commands
     * @param {Object} sock - WhatsApp socket connection
     */
    async initialize(sock) {
        if (this.initialized) {
            return;
        }

        this.sock = sock;
        logger.info('Initializing command handler...');

        try {
            // Create commands directory if it doesn't exist
            if (!fs.existsSync(this.commandsDir)) {
                fs.mkdirSync(this.commandsDir, { recursive: true });
                logger.info(`Created commands directory: ${this.commandsDir}`);
            }

            await this.loadCommands();
            this.initialized = true;
            logger.success(`Command handler initialized with ${Object.keys(this.commands).length} commands`);
        } catch (err) {
            logger.error('Error initializing command handler:', err);
            throw err;
        }
    }

    /**
     * Load all command modules from the commands directory
     */
    async loadCommands() {
        try {
            const files = fs.readdirSync(this.commandsDir).filter(file => file.endsWith('.js'));
            
            if (files.length === 0) {
                logger.warn('No command files found');
                return;
            }
            
            for (const file of files) {
                try {
                    const filePath = path.join(this.commandsDir, file);
                    // Clear require cache to ensure fresh load
                    delete require.cache[require.resolve(filePath)];
                    
                    const module = require(filePath);
                    const category = module.category || path.basename(file, '.js');
                    
                    // Add category to set
                    this.categories.add(category);
                    
                    // Initialize module if needed
                    if (typeof module.init === 'function') {
                        await module.init(this.sock);
                    }
                    
                    // Register module help text if available
                    if (module.helpText) {
                        this.moduleHelpTexts[category] = module.helpText;
                    }
                    
                    // Register all commands from this module
                    if (module.commands && typeof module.commands === 'object') {
                        Object.entries(module.commands).forEach(([name, handler]) => {
                            // Skip if not a function
                            if (typeof handler !== 'function') return;
                            
                            // Register command
                            this.commands[name] = {
                                handler,
                                category,
                                module: path.basename(file, '.js')
                            };
                            
                            logger.info(`Registered command: ${name} (${category})`);
                        });
                    }
                    
                    // Register aliases if available
                    if (module.aliases && typeof module.aliases === 'object') {
                        Object.entries(module.aliases).forEach(([alias, command]) => {
                            if (this.commands[command]) {
                                this.aliases[alias] = command;
                                logger.info(`Registered alias: ${alias} -> ${command}`);
                            }
                        });
                    }
                } catch (err) {
                    logger.error(`Error loading command file ${file}:`, err);
                }
            }
            
            logger.info(`Loaded ${Object.keys(this.commands).length} commands from ${files.length} files`);
        } catch (err) {
            logger.error('Error loading commands:', err);
            throw err;
        }
    }

    /**
     * Execute a command
     * @param {string} name - Command name
     * @param {Object} message - Message object
     * @param {Array} args - Command arguments
     * @returns {Promise<boolean>} - Whether the command was executed
     */
    async executeCommand(name, message, args = []) {
        try {
            // Check if command exists directly
            let commandObj = this.commands[name];
            
            // Try to find by alias if not found directly
            if (!commandObj && this.aliases[name]) {
                commandObj = this.commands[this.aliases[name]];
            }
            
            if (!commandObj) {
                logger.info(`Command not found: ${name}`);
                return false;
            }
            
            const { handler, category, module } = commandObj;
            
            logger.info(`Executing command: ${name} (${category}) with args: ${args.join(' ')}`);
            
            // Execute command
            await handler(this.sock, message, args);
            logger.info(`Command ${name} executed successfully`);
            
            return true;
        } catch (err) {
            logger.error(`Error executing command ${name}:`, err);
            
            // Send error message to user
            try {
                await safeSendText(
                    this.sock, 
                    message.key.remoteJid, 
                    `❌ Error executing command: ${name}\n${err.message}`
                );
            } catch (sendErr) {
                logger.error('Error sending error message:', sendErr);
            }
            
            return false;
        }
    }

    /**
     * Process a message to check for commands
     * @param {Object} message - Message object
     * @param {string} prefix - Command prefix (default: !)
     * @returns {Promise<boolean>} - Whether a command was executed
     */
    async processMessage(message, prefix = '!') {
        if (!this.initialized) {
            logger.warn('Command handler not initialized');
            return false;
        }
        
        // Get message text
        const body = message.message?.conversation || 
                      message.message?.imageMessage?.caption || 
                      message.message?.videoMessage?.caption || 
                      message.message?.extendedTextMessage?.text || '';
        
        // Check if it's a command
        if (!body.startsWith(prefix)) {
            return false;
        }
        
        // Parse command and arguments
        const [commandName, ...args] = body.slice(prefix.length).trim().split(' ');
        
        if (!commandName) {
            return false;
        }
        
        // Execute command
        return await this.executeCommand(commandName.toLowerCase(), message, args);
    }

    /**
     * Get a list of all commands
     * @returns {Object} - Commands organized by category
     */
    getCommandList() {
        const commandsByCategory = {};
        
        // Initialize categories
        for (const category of this.categories) {
            commandsByCategory[category] = [];
        }
        
        // Group commands by category
        Object.entries(this.commands).forEach(([name, { category }]) => {
            if (!commandsByCategory[category]) {
                commandsByCategory[category] = [];
            }
            
            commandsByCategory[category].push(name);
        });
        
        return commandsByCategory;
    }

    /**
     * Get command information
     * @param {string} name - Command name
     * @returns {Object|null} - Command information or null if not found
     */
    getCommandInfo(name) {
        // Check if command exists directly
        let commandObj = this.commands[name];
        
        // Try to find by alias if not found directly
        if (!commandObj && this.aliases[name]) {
            commandObj = this.commands[this.aliases[name]];
        }
        
        return commandObj || null;
    }

    /**
     * Reload all commands
     * @returns {Promise<boolean>} - Whether reload was successful
     */
    async reloadCommands() {
        try {
            logger.info('Reloading commands...');
            
            // Clear current commands
            this.commands = {};
            this.aliases = {};
            this.categories = new Set();
            this.moduleHelpTexts = {};
            
            // Load commands again
            await this.loadCommands();
            
            logger.success('Commands reloaded successfully');
            return true;
        } catch (err) {
            logger.error('Error reloading commands:', err);
            return false;
        }
    }
}

// Create singleton instance
const commandHandler = new CommandHandler();

module.exports = commandHandler;