/**
 * Command Module Template
 * This is a standardized template for all command modules
 * Follow this structure for all new command modules
 */

const logger = require('../utils/logger');

/**
 * Command implementations
 * Each command is a function with standard parameters:
 * @param {Object} sock - WhatsApp socket connection
 * @param {Object} message - Message object from WhatsApp
 * @param {Array} args - Command arguments (words after the command name)
 * @param {Object} options - Additional options (isGroup, etc.)
 */
const commands = {
    // Example command
    examplecommand: async (sock, message, args, options = {}) => {
        try {
            const sender = message.key.remoteJid;
            await sock.sendMessage(sender, { 
                text: 'This is an example command' 
            });
        } catch (err) {
            logger.error(`Error in examplecommand: ${err.message}`);
        }
    },
    
    // Add more commands here...
};

/**
 * Initialize function called during bot startup
 * @param {Object} sock - WhatsApp socket connection
 * @returns {boolean} - Whether initialization was successful
 */
async function init(sock) {
    try {
        logger.info('Initializing template module...');
        // Add any initialization logic here
        return true;
    } catch (err) {
        logger.error(`Error initializing template module: ${err.message}`);
        return false;
    }
}

// Export in the standard format
module.exports = {
    commands,
    init,
    category: 'template' // Change this to your actual category
};