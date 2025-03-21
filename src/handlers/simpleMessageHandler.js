/**
 * Simple Message Handler for WhatsApp Bot - Optimized for Speed
 */

const { commandLoader } = require('../utils/commandLoader');
const { safeSendMessage, safeSendText, safeSendImage } = require('../utils/jidHelper');
const logger = require('../utils/logger');

// Bot configuration
const config = {
    prefix: process.env.BOT_PREFIX || '.',
    owner: process.env.OWNER_NUMBER || '4915563151347'
};

/**
 * Process incoming messages
 */
async function messageHandler(sock, message) {
    try {
        if (!message?.message || !message.key?.remoteJid) return;

        const messageContent = message.message?.conversation ||
                           message.message?.extendedTextMessage?.text ||
                           message.message?.imageMessage?.caption ||
                           message.message?.videoMessage?.caption;

        if (!messageContent) return;

        // Process commands
        if (messageContent.startsWith(config.prefix)) {
            const commandText = messageContent.slice(config.prefix.length).trim();
            if (!commandText) return;

            const [commandName, ...args] = commandText.split(' ');
            const command = await commandLoader.getCommand(commandName.toLowerCase());

            if (!command) {
                const sender = message.key.remoteJid;
                await safeSendMessage(sock, sender, {
                    text: `❌ Unknown command. Use ${config.prefix}help to see available commands.`
                });
                return;
            }

            // Check permissions before executing command
            const sender = message.key.remoteJid;
            const hasPermission = await commandLoader.hasPermission(sender, command.config.permissions);

            if (!hasPermission) {
                await safeSendText(sock, sender, '❌ You do not have permission to use this command.'
                );
                return;
            }

            try {
                await command.execute(sock, message, args);
            } catch (err) {
                logger.error(`Error executing command ${commandName}:`, err);
                await safeSendText(sock, sender, '❌ Error executing command. Please try again.'
                );
            }
        }
    } catch (err) {
        logger.error('Error in message handler:', err);
    }
}

/**
 * Initialize the handler
 */
async function init() {
    try {
        // Load all commands using the command loader
        const success = await commandLoader.loadCommandHandlers();
        if (!success) {
            throw new Error('Failed to load commands');
        }

        const stats = commandLoader.getCommandStats();
        logger.info('Command loading statistics:', stats);
        logger.info(`Simple message handler initialized with ${stats.totalCommands} commands`);
        return true;
    } catch (err) {
        logger.error('Handler initialization error:', err);
        return false;
    }
}

// Export handler functions
module.exports = {
    messageHandler,
    init,
    config
};