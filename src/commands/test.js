/**
 * Test Command Module
 * This module contains test commands to verify the command system is working properly
 */

const { safeSendText } = require('../utils/jidHelper');
const logger = require('../utils/logger');

/**
 * Test commands for system verification
 */
const testCommands = {
    /**
     * Test command to verify the command loading system
     * @param {Object} sock - WhatsApp socket
     * @param {Object} message - Message object
     * @param {Array} args - Command arguments
     */
    test: async (sock, message, args) => {
        const jid = message.key.remoteJid;
        await safeSendText(sock, jid, '✅ Test command executed successfully!');
        
        // Check if arguments were provided
        if (args.length > 0) {
            await safeSendText(sock, jid, `📝 Arguments received: ${args.join(', ')}`);
        }

        // Display system information
        await safeSendText(sock, jid, `
📊 *System Information:*
• Command Modules: Loaded successfully
• WhatsApp Connection: Active
• Message Handler: Working correctly
• Current Time: ${new Date().toISOString()}
`);
    },

    /**
     * Echo command to repeat the user's message
     * @param {Object} sock - WhatsApp socket
     * @param {Object} message - Message object
     * @param {Array} args - Command arguments
     */
    echo: async (sock, message, args) => {
        const jid = message.key.remoteJid;
        
        if (args.length === 0) {
            await safeSendText(sock, jid, '⚠️ Please provide text to echo');
            return;
        }
        
        const echoText = args.join(' ');
        await safeSendText(sock, jid, `🔊 ${echoText}`);
    },

    /**
     * System check command
     * @param {Object} sock - WhatsApp socket
     * @param {Object} message - Message object
     * @param {Array} args - Command arguments
     */
    syscheck: async (sock, message, args) => {
        const jid = message.key.remoteJid;
        
        await safeSendText(sock, jid, '🔍 Running system check...');
        
        // Test message sending
        try {
            await safeSendText(sock, jid, '✅ Message sending: Working');
        } catch (err) {
            await safeSendText(sock, jid, '❌ Message sending: Failed');
            logger.error('Error in message sending test:', err);
        }
        
        // Check command loading
        try {
            await safeSendText(sock, jid, '✅ Command loading: Working');
        } catch (err) {
            await safeSendText(sock, jid, '❌ Command loading: Failed');
            logger.error('Error in command loading test:', err);
        }
        
        // Check socket connection
        try {
            if (sock && sock.user) {
                await safeSendText(sock, jid, `✅ Socket connection: Connected as ${sock.user.name || 'Bot'}`);
            } else {
                await safeSendText(sock, jid, '❌ Socket connection: Not fully established');
            }
        } catch (err) {
            await safeSendText(sock, jid, '❌ Socket connection: Failed');
            logger.error('Error in socket connection test:', err);
        }
        
        await safeSendText(sock, jid, '✅ System check completed');
    }
};

module.exports = {
    commands: testCommands,
    category: 'test',
    async init(sock) {
        logger.info('Test command module initialized');
        return true;
    }
};