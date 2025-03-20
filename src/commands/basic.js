/**
 * Basic Command Module
 * Contains essential commands for basic bot functionality
 */

const logger = require('../utils/logger');
const os = require('os');
const { proto } = require('@whiskeysockets/baileys');
const { safeSendText, safeSendMessage, formatJidForLogging } = require('../utils/jidHelper');
const { languageManager } = require('../utils/language');

// Basic bot commands
const basicCommands = {
    /**
     * Ping command to check bot responsiveness
     * @param {Object} sock WhatsApp socket
     * @param {Object} message Message object
     * @returns {Promise<void>}
     */
    ping: async (sock, message) => {
        const start = Date.now();
        const reply = await safeSendText(sock, message.key.remoteJid, 'Pinging...');
        const responseTime = Date.now() - start;
        
        await safeSendText(
            sock, 
            message.key.remoteJid, 
            languageManager.getText('basic.ping_response', null, responseTime)
        );
    },
    
    /**
     * Help command to show available commands
     * @param {Object} sock WhatsApp socket
     * @param {Object} message Message object
     * @param {Array} args Command arguments
     * @returns {Promise<void>}
     */
    help: async (sock, message, args) => {
        const commandRequested = args[0];
        const jid = message.key.remoteJid;
        
        if (commandRequested) {
            // Help for specific command
            await safeSendText(sock, jid, `Help for command: ${commandRequested}\nThis feature is still under development.`);
        } else {
            // General help
            const helpText = `${languageManager.getText('basic.help_title')}\n\n` +
                `${languageManager.getText('basic.help_description')}\n\n` +
                `• !ping - ${languageManager.getText('basic.ping_response', null, '')}\n` +
                `• !help - ${languageManager.getText('basic.help_title')}\n` +
                `• !info - ${languageManager.getText('basic.info_title')}\n\n` +
                `${languageManager.getText('menu.footer')}`;
            
            await safeSendText(sock, jid, helpText);
        }
    },
    
    /**
     * Info command to display bot information
     * @param {Object} sock WhatsApp socket
     * @param {Object} message Message object
     * @returns {Promise<void>}
     */
    info: async (sock, message) => {
        const jid = message.key.remoteJid;
        
        // Calculate uptime
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;
        
        // Calculate memory usage
        const memoryUsage = process.memoryUsage();
        const memoryUsageMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        
        // Format info text
        const infoText = `*${languageManager.getText('basic.info_title')}*\n\n` +
            `*${languageManager.getText('basic.info_uptime', null, uptimeStr)}*\n` +
            `*${languageManager.getText('basic.info_memory', null, memoryUsageMB)}*\n` +
            `*Version:* 1.0.0\n` +
            `*Platform:* ${os.platform()} ${os.release()}\n` +
            `*Node.js:* ${process.version}\n`;
        
        await safeSendText(sock, jid, infoText);
    }
};

module.exports = {
    commands: basicCommands,
    category: 'basic',
    async init() {
        try {
            logger.info('Initializing basic command handler...');

            if (!proto) {
                throw new Error('Baileys proto not initialized');
            }

            logger.info('Basic command handler initialized successfully');
            return true;
        } catch (err) {
            logger.error('Error initializing basic command handler:', err);
            throw err;
        }
    }
};