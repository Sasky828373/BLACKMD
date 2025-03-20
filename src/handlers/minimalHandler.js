/**
 * Minimal Message Handler for WhatsApp Bot
 * Used when other handlers fail to initialize
 */

// Import essential utilities
const { safeSendText, safeSendMessage, safeSendImage } = require('../utils/jidHelper');

// No external dependencies to minimize failure risk
const commands = new Map();

// Add ping command
commands.set('ping', async (sock, message) => {
    try {
        const sender = message.key.remoteJid;
        await safeSendText(sock, sender, '🏓 Pong! Bot is running (minimal handler).' );
    } catch (err) {
        console.error('Error in ping command:', err);
    }
});

// Add help command
commands.set('help', async (sock, message) => {
    try {
        const sender = message.key.remoteJid;
        await safeSendText(sock, sender, '*Available Commands:*\n.ping - Check if bot is running\n.help - Show this help message' 
        );
    } catch (err) {
        console.error('Error in help command:', err);
    }
});

/**
 * Process incoming messages
 */
async function messageHandler(sock, message) {
    try {
        // Skip if no message
        if (!message?.message || !message.key?.remoteJid) {
            return;
        }

        // Get message data
        const sender = message.key.remoteJid;
        const content = message.message?.conversation || 
                       message.message?.extendedTextMessage?.text ||
                       message.message?.imageMessage?.caption || 
                       message.message?.videoMessage?.caption;

        // Skip if no content
        if (!content) {
            return;
        }

        // Process commands (using . as prefix)
        if (content.startsWith('.')) {
            const commandName = content.slice(1).trim().split(' ')[0].toLowerCase();
            const command = commands.get(commandName);
            
            if (command) {
                await command(sock, message);
                console.log(`Executed command: ${commandName}`);
            } else {
                await safeSendMessage(sock, sender, { 
                    text: `Unknown command: ${commandName}. Use .help for available commands.` 
                });
            }
        }
    } catch (error) {
        console.error('Error in minimal message handler:', error);
    }
}

/**
 * Initialize handler (nothing complex to initialize)
 */
async function init() {
    console.log('Minimal message handler initialized with', commands.size, 'commands');
    return true;
}

// Export module
module.exports = {
    messageHandler,
    init,
    commands
};