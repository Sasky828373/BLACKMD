/**
 * Basic Commands Module - Simplified Version
 * Provides essential utility commands for the bot
 */

// Basic ping command to check if the bot is active
const ping = async (sock, msg) => {
    const jid = msg.key.remoteJid;
    await sock.sendMessage(jid, { text: 'Pong! 🏓 Bot is active!' });
};

// Echo command to repeat a message
const echo = async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const text = args.join(' ') || 'You did not provide any text to echo!';
    await sock.sendMessage(jid, { text });
};

// Info command to show bot information
const info = async (sock, msg) => {
    const jid = msg.key.remoteJid;
    
    const infoText = `*BLACKSKY-MD WhatsApp Bot*
• Version: 1.0.0
• Framework: Baileys MD
• Language: JavaScript
• Uptime: ${Math.floor(process.uptime())} seconds
• Platform: ${process.platform}
• Node Version: ${process.version}
• Memory Usage: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB
• Command Prefix: !

Type !help to see available commands.`;
    
    await sock.sendMessage(jid, { text: infoText });
};

// List available commands
const help = async (sock, msg) => {
    const jid = msg.key.remoteJid;
    
    const helpText = `*Available Commands*
• !ping - Check if bot is active
• !echo [text] - Repeat your message back to you
• !info - Show bot information
• !help - Display this help message

*Other Command Groups*
There are additional commands available. Try these:
• !reactions - Show available reaction commands

*Command Usage*
Commands start with ! followed by the command name. For example: !ping
Some commands take arguments, like !echo hello world`;
    
    await sock.sendMessage(jid, { text: helpText });
};

// Export commands
module.exports = {
    commands: {
        ping,
        echo,
        info,
        help
    },
    descriptions: {
        ping: 'Check if bot is active',
        echo: 'Repeat your message back to you',
        info: 'Show bot information',
        help: 'Display available commands'
    }
};