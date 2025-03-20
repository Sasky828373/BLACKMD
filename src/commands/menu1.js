/**
 * Graphical Menu Command
 * Displays a menu with an image background
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const { safeSendMessage, safeSendImage } = require('../utils/jidHelper');
const { languageManager } = require('../utils/language');
const config = require('../config/config');

// Path to menu image
const MENU_IMAGE_PATH = path.join(process.cwd(), 'attached_assets/images (1).jpeg');

/**
 * Load all commands from command modules
 * @returns {Promise<{allCommands: Object, totalCommands: number}>}
 */
async function loadAllCommands() {
    try {
        const commandsDir = path.join(process.cwd(), 'src/commands');
        const files = await fs.readdir(commandsDir);
        
        const allCommands = {};
        let totalCommands = 0;

        for (const file of files) {
            if (file.endsWith('.js') && file !== 'index.js') {
                try {
                    const modulePath = path.join(commandsDir, file);
                    delete require.cache[require.resolve(modulePath)];
                    const moduleData = require(modulePath);
                    
                    // Normalize module data - either commands property or direct export
                    const commands = moduleData.commands || moduleData;
                    const category = moduleData.category || path.basename(file, '.js');
                    
                    if (!allCommands[category]) {
                        allCommands[category] = [];
                    }
                    
                    // Add command names to the category
                    for (const cmdName in commands) {
                        if (typeof commands[cmdName] === 'function') {
                            allCommands[category].push(cmdName);
                            totalCommands++;
                        }
                    }
                } catch (err) {
                    logger.error(`Error loading commands from ${file}:`, err);
                }
            }
        }
        
        return { allCommands, totalCommands };
    } catch (err) {
        logger.error('Error loading commands:', err);
        return { allCommands: {}, totalCommands: 0 };
    }
}

const menu1Commands = {
    async menu1(sock, message, args) {
        try {
            const startTime = process.hrtime.bigint();
            const jid = message.key.remoteJid;
            const isGroup = jid.includes('@g.us');
            
            // Get the actual sender in group chats
            const sender = isGroup && message.key.participant 
                ? message.key.participant 
                : jid;
                
            const prefix = config.bot.prefix || '.';
            
            // Send a loading message first for responsive feedback
            await safeSendMessage(sock, jid, { 
                text: '*🤖 BLACKSKY-MD BOT*\n\n_Loading graphical menu..._'
            });
            
            // Generate menu text
            const { menuText } = await generateMenuText(prefix, isGroup, sender);
            
            // Try to load the image
            try {
                const imageBuffer = await fs.readFile(MENU_IMAGE_PATH);
                
                // Send menu with image
                await safeSendImage(sock, jid, imageBuffer, menuText);
                
                const endTime = process.hrtime.bigint();
                const totalTimeMs = Number(endTime - startTime) / 1_000_000;
                logger.info(`Graphical menu sent in ${totalTimeMs.toFixed(2)}ms`);
            } catch (imageError) {
                logger.error('Error loading menu image:', imageError);
                
                // Fallback to text-only menu
                await safeSendMessage(sock, jid, { text: menuText });
                logger.info('Sent text-only menu (image fallback)');
            }
            
            return true;
        } catch (err) {
            logger.error('Menu1 command error:', err);
            safeSendMessage(sock, message.key.remoteJid, { 
                text: '❌ Error generating graphical menu. Please try again.'
            }).catch(() => {/* Silent catch */});
            return false;
        }
    }
};

/**
 * Generate menu text content
 */
async function generateMenuText(prefix, isGroup, sender) {
    try {
        // Load commands
        const { allCommands, totalCommands } = await loadAllCommands();
        
        // Create menu header
        let menuText = `*🤖 BLACKSKY-MD BOT*\n\n`;
        menuText += `✦ *Total Commands:* ${totalCommands}\n`;
        menuText += `✦ *Prefix:* ${prefix}\n`;
        menuText += `✦ *Version:* 2.1.0\n`;
        
        // Add user mention in groups
        if (isGroup) {
            const mention = `@${sender.split('@')[0]}`;
            menuText += `✦ *User:* ${mention}\n`;
        }
        
        menuText += `✦ *Chat Type:* ${isGroup ? 'Group' : 'Private'}\n\n`;
        
        // Categories to display (priority order)
        const priorityCategories = [
            'basic', 'utility', 'group', 'media', 
            'fun', 'reactions', 'nsfw', 'menu'
        ];
        
        // Emoji mapping for categories
        const categoryEmojis = {
            'basic': '🧩',
            'utility': '🛠️',
            'group': '👥',
            'media': '📽️',
            'fun': '🎮',
            'reactions': '💫',
            'nsfw': '🔞',
            'menu': '📋',
            'default': '📄'
        };
        
        // Pretty names for categories
        const categoryNames = {
            'basic': 'Basic',
            'utility': 'Utilities',
            'group': 'Group Management',
            'media': 'Media Tools',
            'fun': 'Fun & Games',
            'reactions': 'Reactions',
            'nsfw': 'NSFW',
            'menu': 'Menu System',
            'default': 'Misc'
        };
        
        // List commands by category
        for (const category of priorityCategories) {
            if (!allCommands[category] || allCommands[category].length === 0) continue;
            
            const emoji = categoryEmojis[category] || categoryEmojis.default;
            const categoryDisplayName = categoryNames[category] || category;
            
            menuText += `『 ${emoji} *${categoryDisplayName}* 』\n`;
            
            // Sort commands alphabetically
            const sortedCommands = [...allCommands[category]].sort();
            
            // List commands in each category
            for (const cmd of sortedCommands) {
                menuText += `➣ ${prefix}${cmd}\n`;
            }
            
            menuText += `\n`;
        }
        
        // Add footer
        menuText += `✦ Use *${prefix}help <command>* for details\n`;
        
        return { menuText };
    } catch (err) {
        logger.error('Error generating menu text:', err);
        return { 
            menuText: '*🤖 BLACKSKY-MD BOT*\n\n❌ Error generating menu content.\nPlease try again.' 
        };
    }
}

module.exports = {
    commands: menu1Commands,
    category: 'menu',
    async init(sock) {
        // Verify menu image exists
        try {
            await fs.access(MENU_IMAGE_PATH);
            const stats = await fs.stat(MENU_IMAGE_PATH);
            const sizeKB = Math.round(stats.size / 1024);
            logger.info(`Menu1 command initialized - Image found (${sizeKB}KB): ${MENU_IMAGE_PATH}`);
            console.log(`Menu1 command initialized - Image found (${sizeKB}KB): ${MENU_IMAGE_PATH}`);
        } catch (err) {
            logger.warn(`Menu1 command initialized - Image not found at ${MENU_IMAGE_PATH}. Using text-only fallback.`);
            console.warn(`Menu1 command initialized - Image not found at ${MENU_IMAGE_PATH}. Using text-only fallback.`);
        }
        
        return true;
    }
};