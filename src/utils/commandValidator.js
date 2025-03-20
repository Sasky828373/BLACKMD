/**
 * Command Module Validator
 * Validates command modules against standardized requirements
 */

const fs = require('fs').promises;
const path = require('path');

// Load logger
let logger;
try {
    logger = require('./logger');
} catch (err) {
    // Fallback to console if logger isn't available
    logger = {
        info: console.log,
        error: console.error,
        warn: console.warn,
        debug: console.log
    };
}

/**
 * Validates a command module against its JSON configuration
 * @param {Object} module The command module to validate
 * @param {string} moduleName The name of the module
 * @param {Array} requiredCommands List of command names that must be present
 * @returns {Array} List of missing commands
 */
async function validateCommandModule(module, moduleName, requiredCommands) {
    if (!module) {
        logger.error(`Module ${moduleName} is undefined or null`);
        return requiredCommands || [];
    }
    
    const missingCommands = [];
    
    if (!requiredCommands || requiredCommands.length === 0) {
        // If no required commands specified, just validate the structure
        if (!module.commands) {
            logger.warn(`Module ${moduleName} does not have a commands object`);
        }
        return missingCommands;
    }
    
    // Check for required commands
    requiredCommands.forEach(cmdName => {
        const commands = module.commands || module;
        
        if (!commands[cmdName] || typeof commands[cmdName] !== 'function') {
            missingCommands.push(cmdName);
            logger.warn(`Required command '${cmdName}' missing in module ${moduleName}`);
        }
    });
    
    return missingCommands;
}

/**
 * Load commands from JSON configuration file
 * @param {string} category The category/name of the command file
 * @returns {Promise<Array>} Array of command names
 */
async function loadCommandsFromConfig(category) {
    try {
        // Try different possible paths for the configuration
        const possiblePaths = [
            path.join(__dirname, '..', 'config', 'commands', `${category}.json`),
            path.join(__dirname, '..', '..', 'config', 'commands', `${category}.json`),
            path.join(__dirname, '..', 'commands', `${category}.config.json`)
        ];
        
        for (const configPath of possiblePaths) {
            try {
                // Check if file exists
                await fs.access(configPath);
                
                // Read and parse the file
                const data = await fs.readFile(configPath, 'utf8');
                const config = JSON.parse(data);
                
                // If commands property exists, return it
                if (config.commands && Array.isArray(config.commands)) {
                    logger.info(`Loaded ${config.commands.length} commands from ${configPath}`);
                    return config.commands;
                }
                
                // If no commands property but is an array, return it
                if (Array.isArray(config)) {
                    logger.info(`Loaded ${config.length} commands from ${configPath}`);
                    return config;
                }
                
                logger.warn(`Config file ${configPath} does not contain a valid commands list`);
                return [];
            } catch (err) {
                // If file doesn't exist or can't be parsed, try next path
                continue;
            }
        }
        
        logger.warn(`Could not find config file for ${category} commands`);
        return [];
    } catch (err) {
        logger.error(`Error loading command config for ${category}:`, err.message);
        return [];
    }
}

/**
 * Validates core group command functionality
 * @param {Object} sock The WhatsApp socket connection
 * @param {string} groupJid The group JID to test
 */
async function validateGroupCommands(sock, groupJid) {
    if (!sock) {
        logger.error('Socket is null, cannot validate group commands');
        return false;
    }
    
    if (!groupJid) {
        logger.error('Group JID is required to validate group commands');
        return false;
    }
    
    try {
        // First check if the group exists
        const groupMetadata = await sock.groupMetadata(groupJid);
        if (!groupMetadata) {
            logger.error(`Could not fetch metadata for group ${groupJid}`);
            return false;
        }
        
        logger.info(`Successfully validated group access for ${groupMetadata.subject}`);
        return true;
    } catch (err) {
        logger.error(`Error validating group commands:`, err.message);
        return false;
    }
}

/**
 * Validates media command functionality
 * @param {Object} sock The WhatsApp socket connection
 */
async function validateMediaCommands(sock) {
    if (!sock) {
        logger.error('Socket is null, cannot validate media commands');
        return false;
    }
    
    try {
        // Check if required modules for media processing are available
        let missingModules = [];
        
        try {
            require('sharp');
        } catch (err) {
            missingModules.push('sharp');
        }
        
        try {
            require('jimp');
        } catch (err) {
            missingModules.push('jimp');
        }
        
        if (missingModules.length > 0) {
            logger.warn(`Missing modules for media commands: ${missingModules.join(', ')}`);
            return false;
        }
        
        logger.info('Successfully validated media command dependencies');
        return true;
    } catch (err) {
        logger.error(`Error validating media commands:`, err.message);
        return false;
    }
}

/**
 * Validates educational command functionality
 * @param {Object} sock The WhatsApp socket connection
 */
async function validateEducationalCommands(sock) {
    if (!sock) {
        logger.error('Socket is null, cannot validate educational commands');
        return false;
    }
    
    try {
        // Check if required modules for educational commands are available
        try {
            require('mathjs');
            logger.info('Math.js module is available for educational commands');
        } catch (err) {
            logger.warn('Math.js module not available, some educational commands may not work');
            return false;
        }
        
        return true;
    } catch (err) {
        logger.error(`Error validating educational commands:`, err.message);
        return false;
    }
}

module.exports = {
    validateCommandModule,
    loadCommandsFromConfig,
    validateGroupCommands,
    validateMediaCommands,
    validateEducationalCommands
};