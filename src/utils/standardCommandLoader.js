/**
 * Standardized Command Loader
 * Provides a consistent interface for loading commands from different module formats
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class StandardCommandLoader {
    constructor() {
        this.commands = new Map();
        this.categories = new Map();
        this.initialized = false;
        this.commandsDir = path.join(process.cwd(), 'src', 'commands');
        this.stats = {
            totalCommands: 0,
            loadedCommands: 0,
            failedCommands: 0,
            byCategory: {}
        };
    }

    /**
     * Initialize the command loader
     * @returns {Promise<boolean>} Success status
     */
    async initialize() {
        try {
            if (this.initialized) {
                return true;
            }

            logger.info('Initializing standardized command loader...');
            
            // Clear existing commands
            this.commands.clear();
            this.categories.clear();
            
            // Reset stats
            this.stats = {
                totalCommands: 0,
                loadedCommands: 0,
                failedCommands: 0,
                byCategory: {}
            };
            
            // Load commands from directory
            const success = await this.loadCommandsFromDirectory(this.commandsDir);
            
            if (success) {
                logger.info(`Command loading complete. Loaded ${this.stats.loadedCommands} of ${this.stats.totalCommands} commands.`);
                if (this.stats.failedCommands > 0) {
                    logger.warn(`Failed to load ${this.stats.failedCommands} commands.`);
                }
            } else {
                logger.error('Failed to load commands.');
                return false;
            }
            
            this.initialized = true;
            return true;
        } catch (error) {
            logger.error('Error initializing command loader:', error);
            return false;
        }
    }

    /**
     * Load commands from a directory
     * @param {string} directory Directory to load commands from
     * @param {string} category Category for commands in this directory
     * @returns {Promise<boolean>} Success status
     */
    async loadCommandsFromDirectory(directory, category = '') {
        try {
            logger.info(`Loading commands from directory: ${directory}`);
            
            // Check if directory exists
            if (!fs.existsSync(directory)) {
                logger.warn(`Directory does not exist: ${directory}`);
                return false;
            }
            
            // Get all files in directory
            const files = fs.readdirSync(directory, { withFileTypes: true });
            
            // Process each file/directory
            for (const file of files) {
                const fullPath = path.join(directory, file.name);
                
                // If directory, load commands recursively
                if (file.isDirectory()) {
                    const subCategory = category ? `${category}.${file.name}` : file.name;
                    await this.loadCommandsFromDirectory(fullPath, subCategory);
                    continue;
                }
                
                // Only process JavaScript files
                if (!file.name.endsWith('.js')) {
                    continue;
                }
                
                // Skip backup files
                if (file.name.endsWith('.bak.js') || file.name.endsWith('.js.bak')) {
                    continue;
                }
                
                // Determine category from filename if not provided
                const fileCategory = category || path.basename(file.name, '.js');
                
                // Load commands from file
                try {
                    // Clear require cache to ensure fresh module
                    delete require.cache[require.resolve(fullPath)];
                    
                    // Load module
                    const module = require(fullPath);
                    
                    // Skip if module is not valid
                    if (!module) {
                        logger.warn(`Invalid module: ${fullPath}`);
                        continue;
                    }
                    
                    // Check if the module has a standard format
                    if (module.commands && typeof module.commands === 'object') {
                        await this.loadStandardCommands(module, fileCategory, fullPath);
                    } else if (typeof module === 'object') {
                        // Try to load as a direct object of commands
                        await this.loadDirectCommands(module, fileCategory, fullPath);
                    }
                } catch (error) {
                    logger.error(`Error loading commands from file: ${fullPath}`, error);
                    this.stats.failedCommands++;
                }
            }
            
            return true;
        } catch (error) {
            logger.error(`Error loading commands from directory: ${directory}`, error);
            return false;
        }
    }

    /**
     * Load commands from a standard module format ({ commands: { ... } })
     * @param {Object} module Module to load commands from
     * @param {string} category Category for commands in this module
     * @param {string} sourcePath Source file path
     */
    async loadStandardCommands(module, category, sourcePath) {
        try {
            // Get module properties
            const moduleCategory = module.category || category;
            
            // Update category stats
            if (!this.stats.byCategory[moduleCategory]) {
                this.stats.byCategory[moduleCategory] = {
                    total: 0,
                    loaded: 0,
                    failed: 0
                };
            }
            
            // Register category
            if (!this.categories.has(moduleCategory)) {
                this.categories.set(moduleCategory, {
                    name: moduleCategory,
                    description: module.description || `Commands in the ${moduleCategory} category`,
                    commands: []
                });
            }
            
            // Load each command
            for (const [commandName, handler] of Object.entries(module.commands)) {
                this.stats.totalCommands++;
                this.stats.byCategory[moduleCategory].total++;
                
                // Skip non-function commands
                if (typeof handler !== 'function') {
                    logger.warn(`Skipping non-function command: ${commandName} in ${sourcePath}`);
                    this.stats.failedCommands++;
                    this.stats.byCategory[moduleCategory].failed++;
                    continue;
                }
                
                // Create command config
                const config = {
                    name: commandName,
                    description: `Command: ${commandName}`,
                    usage: `!${commandName}`,
                    aliases: [],
                    cooldown: 3,
                    category: moduleCategory,
                    enabled: true,
                    permissions: ['user'],
                    // Add additional configuration from module
                    ...(module.config && module.config[commandName] ? module.config[commandName] : {})
                };
                
                // Register command
                this.commands.set(commandName, {
                    execute: handler,
                    config,
                    source: sourcePath
                });
                
                // Add command to category
                const categoryData = this.categories.get(moduleCategory);
                categoryData.commands.push(commandName);
                
                // Update stats
                this.stats.loadedCommands++;
                this.stats.byCategory[moduleCategory].loaded++;
                
                logger.debug(`Loaded command: ${commandName} (${moduleCategory})`);
            }
        } catch (error) {
            logger.error(`Error loading standard commands from: ${sourcePath}`, error);
        }
    }

    /**
     * Load commands from a direct object format
     * @param {Object} module Module to load commands from
     * @param {string} category Category for commands in this module
     * @param {string} sourcePath Source file path
     */
    async loadDirectCommands(module, category, sourcePath) {
        try {
            // Update category stats
            if (!this.stats.byCategory[category]) {
                this.stats.byCategory[category] = {
                    total: 0,
                    loaded: 0,
                    failed: 0
                };
            }
            
            // Register category
            if (!this.categories.has(category)) {
                this.categories.set(category, {
                    name: category,
                    description: `Commands in the ${category} category`,
                    commands: []
                });
            }
            
            // Check each property to see if it's a function
            for (const [key, value] of Object.entries(module)) {
                // Skip non-functions and internal properties (starting with _)
                if (typeof value !== 'function' || key.startsWith('_') || key === 'init') {
                    continue;
                }
                
                this.stats.totalCommands++;
                this.stats.byCategory[category].total++;
                
                // Create command config
                const config = {
                    name: key,
                    description: `Command: ${key}`,
                    usage: `!${key}`,
                    aliases: [],
                    cooldown: 3,
                    category: category,
                    enabled: true,
                    permissions: ['user']
                };
                
                // Register command
                this.commands.set(key, {
                    execute: value,
                    config,
                    source: sourcePath
                });
                
                // Add command to category
                const categoryData = this.categories.get(category);
                categoryData.commands.push(key);
                
                // Update stats
                this.stats.loadedCommands++;
                this.stats.byCategory[category].loaded++;
                
                logger.debug(`Loaded direct command: ${key} (${category})`);
            }
        } catch (error) {
            logger.error(`Error loading direct commands from: ${sourcePath}`, error);
        }
    }

    /**
     * Get a command by name
     * @param {string} name Command name
     * @returns {Object|null} Command object or null if not found
     */
    getCommand(name) {
        return this.commands.get(name) || null;
    }

    /**
     * Check if a user has permission to execute a command
     * @param {string} sender Sender's JID
     * @param {Array<string>} requiredPermissions Required permissions
     * @param {Object} ownerSettings Owner settings
     * @returns {Promise<boolean>} Whether the user has permission
     */
    async hasPermission(sender, requiredPermissions, ownerSettings = {}) {
        try {
            // Import the permission helpers - use require inside function to avoid circular dependencies
            const { isBotOwner } = require('./permissions');
            
            // If no specific permissions required or user permission is enough
            if (!requiredPermissions?.length || requiredPermissions.includes('user')) {
                return true;
            }
            
            // Check for owner permission
            if (requiredPermissions.includes('owner')) {
                // Use the centralized isBotOwner function for consistent owner checking
                return isBotOwner(sender);
            }
            
            // Admin permissions would be checked here
            
            return false;
        } catch (error) {
            logger.error('Error checking permission:', error);
            return false;
        }
    }

    /**
     * Get all commands
     * @returns {Map<string, Object>} Map of commands
     */
    getAllCommands() {
        return this.commands;
    }

    /**
     * Get all categories
     * @returns {Map<string, Object>} Map of categories
     */
    getAllCategories() {
        return this.categories;
    }

    /**
     * Get loader statistics
     * @returns {Object} Loader statistics
     */
    getStats() {
        return this.stats;
    }

    /**
     * Reload all commands
     * @returns {Promise<boolean>} Success status
     */
    async reload() {
        this.initialized = false;
        return await this.initialize();
    }
}

// Export a singleton instance
const standardCommandLoader = new StandardCommandLoader();

module.exports = {
    standardCommandLoader,
    StandardCommandLoader
};