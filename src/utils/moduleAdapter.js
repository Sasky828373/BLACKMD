/**
 * Module Adapter for Command Files
 * Provides backwards compatibility for existing command modules
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Load a command module with error handling and dependency injection
 * @param {string} filePath - Path to the command module
 * @returns {Object|null} - The loaded module or null if it failed
 */
function loadCommandModule(filePath) {
    try {
        // Clear require cache to ensure fresh loading
        delete require.cache[require.resolve(filePath)];
        
        // Load the module
        const module = require(filePath);
        
        // Check if it's a valid module
        if (!module) {
            logger.error(`Module at ${filePath} is empty`);
            return null;
        }
        
        // Determine module format
        if (typeof module.commands === 'object' && module.commands !== null) {
            // Standard format (already has .commands)
            return module;
        } else if (typeof module === 'object' && Object.keys(module).length > 0) {
            // Legacy format - entire module is commands object
            const moduleName = path.basename(filePath, '.js');
            const category = path.basename(path.dirname(filePath));
            
            // Create a standardized module object
            return {
                commands: module,
                category: category !== 'commands' ? category : 'general',
                info: {
                    name: moduleName,
                    format: 'legacy'
                },
                async init() {
                    logger.info(`Initializing legacy module: ${moduleName}`);
                    return true;
                }
            };
        }
        
        // Unknown format, return a minimal mock
        logger.warn(`Unknown module format for ${filePath}, using basic mock`);
        return createBasicCommandMock();
    } catch (error) {
        logger.error(`Error loading module ${filePath}:`, error);
        return null;
    }
}

/**
 * Create a basic command module mock for compatibility
 * @returns {Object} - Mock basic command module
 */
function createBasicCommandMock() {
    return {
        commands: {
            ping: async (sock, message) => {
                try {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: 'Pong!'
                    });
                } catch (err) {
                    logger.error('Error in ping command:', err);
                }
            }
        },
        category: 'basic',
        async init() {
            logger.info('Initializing basic command mock');
            return true;
        }
    };
}

/**
 * Create a minimal mock module with the given category
 * @param {string} category - The module category
 * @returns {Object} - Mock module
 */
function createMinimalMock(category) {
    return {
        commands: {},
        category,
        async init() {
            logger.info(`Initializing minimal ${category} mock`);
            return true;
        }
    };
}

/**
 * Check if a module has a valid command structure
 * @param {Object} module - The module to check
 * @returns {boolean} - Whether the module has a valid structure
 */
function isValidCommandModule(module) {
    return (
        module !== null &&
        typeof module === 'object' &&
        typeof module.commands === 'object' &&
        module.commands !== null &&
        Object.keys(module.commands).length > 0
    );
}

/**
 * Check if a module has an initialization function
 * @param {Object} module - The module to check
 * @returns {boolean} - Whether the module has an init function
 */
function hasInitFunction(module) {
    return (
        module !== null &&
        typeof module === 'object' &&
        typeof module.init === 'function'
    );
}

/**
 * Initialize a command module
 * @param {Object} module - The module to initialize
 * @param {Object} sock - The WhatsApp socket
 * @returns {Promise<boolean>} - Whether initialization was successful
 */
async function initializeModule(module, sock) {
    if (!hasInitFunction(module)) {
        return true; // No init function, consider success
    }
    
    try {
        const result = await module.init(sock);
        return result !== false; // Consider success unless explicitly false
    } catch (error) {
        logger.error(`Error initializing module:`, error);
        return false;
    }
}

/**
 * Get all command modules from a directory
 * @param {string} dir - Directory to scan
 * @returns {Promise<Array>} - Array of loaded modules
 */
async function getAllCommandModules(dir) {
    try {
        if (!fs.existsSync(dir)) {
            logger.warn(`Command directory does not exist: ${dir}`);
            return [];
        }
        
        const modules = [];
        const files = fs.readdirSync(dir);
        
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isFile() && file.endsWith('.js')) {
                const module = loadCommandModule(filePath);
                if (isValidCommandModule(module)) {
                    modules.push({
                        path: filePath,
                        module
                    });
                }
            } else if (stat.isDirectory()) {
                // Recursively process subdirectories
                const subdirPath = path.join(dir, file);
                const subdirFiles = fs.readdirSync(subdirPath);
                
                for (const subdirFile of subdirFiles) {
                    if (subdirFile.endsWith('.js')) {
                        const filePath = path.join(subdirPath, subdirFile);
                        const module = loadCommandModule(filePath);
                        if (isValidCommandModule(module)) {
                            modules.push({
                                path: filePath,
                                module
                            });
                        }
                    }
                }
            }
        }
        
        return modules;
    } catch (error) {
        logger.error(`Error scanning command directory ${dir}:`, error);
        return [];
    }
}

module.exports = {
    loadCommandModule,
    createBasicCommandMock,
    createMinimalMock,
    isValidCommandModule,
    hasInitFunction,
    initializeModule,
    getAllCommandModules
};