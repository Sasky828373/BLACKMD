/**
 * Modern WhatsApp MD Bot Menu System
 */

const { languageManager } = require('../utils/language');
const config = require('../config/config');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

// Emoji mapping for categories
const categoryEmojis = {
    'owner': '👑',
    'basic': '🧩',
    'educational': '📚',
    'fun': '🎮',
    'group': '👥',
    'media': '📽️',
    'nsfw': '🔞',
    'reactions': '💫',
    'user': '👤',
    'user_extended': '👨‍💼',
    'utility': '🛠️',
    'group_new': '👥',
    'menu': '📋',
    'default': '📄'
};

// Pretty names for categories
const categoryNames = {
    'owner': 'Owner',
    'basic': 'Basic',
    'educational': 'Educational',
    'fun': 'Fun & Games',
    'group': 'Group Management',
    'media': 'Media Tools',
    'nsfw': 'NSFW',
    'reactions': 'Reactions',
    'user': 'User Profile',
    'user_extended': 'Extended Profile',
    'utility': 'Utilities',
    'group_new': 'Group Advanced',
    'menu': 'Menu System',
    'default': 'Misc'
};

// Import necessary utilities
const { safeSendText, safeSendMessage, safeSendImage, safeSendGroupMessage } = require('../utils/jidHelper');

// Symbols for menu formatting
const symbols = {
    arrow: "➣",
    bullet: "•",
    star: "✦",
    dot: "·"
};

// Menu command handlers
const menuCommands = {
    async menu(sock, message, args) {
        try {
            const startTime = process.hrtime.bigint();
            const jid = message.key.remoteJid;
            const isGroup = jid.includes('@g.us');
            
            // Get the actual sender in group chats
            const sender = isGroup && message.key.participant 
                ? message.key.participant 
                : jid;
                
            const prefix = config.bot.prefix || '.';
            
            // ULTRA-FAST PATH: Start generating a basic header immediately
            // This allows us to start sending a response in <5ms
            const basicHeader = `*🤖 BLACKSKY-MD BOT MENU*\n\n`;
            
            // Prepare options for group or private chat
            const messageOptions = {};
            
            // Add mention for group chats to get user's attention
            if (isGroup && message.key.participant) {
                messageOptions.mentions = [message.key.participant];
                messageOptions.quoted = message;
            }
            
            // Fire off an immediate "Menu loading..." message to provide instant feedback
            // This ensures the user sees a response in under 5ms
            const loadingPromise = isGroup && typeof safeSendGroupMessage === 'function'
                ? safeSendGroupMessage(sock, jid, { text: `${basicHeader}*Loading menu...*` }, messageOptions)
                    .catch(() => {/* Silent catch for fire-and-forget */})
                : safeSendText(sock, jid, `${basicHeader}*Loading menu...*`)
                    .catch(() => {/* Silent catch for fire-and-forget */});
            
            // STAGE 1: BACKGROUND PROCESSING
            // Perform the slower operations in the background
            const generateFullMenu = async () => {
                try {
                    // Load commands (cached if available)
                    const { allCommands, totalCommands } = await loadAllCommands();
                    const userLang = config.bot.language || 'en';
                    
                    // Create modern menu header with special handling for group context
                    let menuText = `┏━━━❮ *🤖 BLACKSKY-MD* ❯━━━┓\n`;
                    
                    // Add personalized greeting in groups
                    if (isGroup) {
                        const mention = `@${sender.split('@')[0]}`;
                        menuText += `┃ ✦ *User:* ${mention}\n`;
                    }
                    
                    menuText += `┃ ✦ *Total Commands:* ${totalCommands}\n`;
                    menuText += `┃ ✦ *Prefix:* ${prefix}\n`;
                    
                    // Show chat type (private/group) for better context
                    menuText += `┃ ✦ *Chat Type:* ${isGroup ? 'Group' : 'Private'}\n`;
                    menuText += `┗━━━━━━━━━━━━━━━━━┛\n\n`;
                    
                    // Fast path for categories - predefined order with no dynamic filtering
                    const orderedCategories = [
                        'basic', 'utility', 'group', 'media', 'fun',
                        'reactions', 'user', 'user_extended', 'educational',
                        'nsfw', 'menu'
                    ];
                    
                    // Only process categories that actually have commands
                    for (const category of orderedCategories) {
                        if (!allCommands[category] || allCommands[category].length === 0) continue;
                        
                        const emoji = categoryEmojis[category] || categoryEmojis.default;
                        const commands = allCommands[category];
                        
                        // Simplified category name lookup - minimal translation overhead
                        let categoryDisplayName = categoryNames[category] || category;
                        
                        menuText += `┌──『 ${emoji} *${categoryDisplayName}* 』\n`;
                        
                        // Use pre-sorted arrays when possible
                        const sortedCommands = commands.sort();
                        
                        // Fast string concatenation for commands
                        for (const cmd of sortedCommands) {
                            menuText += `│ ➣ ${prefix}${cmd}\n`;
                        }
                        
                        menuText += `└──────────────\n`;
                    }
                    
                    // Add footer with tips
                    menuText += `\n✦ Use *${prefix}help <command>* for detailed info\n`;
                    menuText += `✦ Example: *${prefix}help sticker*\n`;
                    
                    return menuText;
                } catch (err) {
                    logger.error('Menu generation error:', err);
                    return null;
                }
            };
            
            // Start the background processing
            generateFullMenu().then(async (fullMenuText) => {
                if (fullMenuText) {
                    // Wait a moment to ensure the loading message was seen
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    // Send the full menu with appropriate method based on chat type
                    if (isGroup && typeof safeSendGroupMessage === 'function') {
                        // For groups, use the group-optimized method with mentions
                        await safeSendGroupMessage(sock, jid, {
                            text: fullMenuText
                        }, messageOptions);
                    } else {
                        // For private chats, use the regular method
                        await safeSendMessage(sock, jid, {
                            text: fullMenuText
                        });
                    }
                    
                    const endTime = process.hrtime.bigint();
                    const totalTimeMs = Number(endTime - startTime) / 1_000_000;
                    logger.info(`Full menu sent in ${totalTimeMs.toFixed(2)}ms (initial response <5ms)`);
                }
            }).catch(err => {
                logger.error('Error sending full menu:', err);
            });
            
            // Calculate time for initial response
            const initialResponseTime = Number(process.hrtime.bigint() - startTime) / 1_000_000;
            if (initialResponseTime > 5) {
                logger.warn(`Initial menu response time exceeded target: ${initialResponseTime.toFixed(2)}ms`);
            }
            
            return true; // Return immediately to unblock the main thread
        } catch (err) {
            logger.error('Menu command error:', err);
            safeSendText(sock, message.key.remoteJid, 
                `❌ Error generating menu. Please try again.`
            ).catch(() => {/* Silent catch */});
            return false;
        }
    },
    async help(sock, message, args) {
        try {
            const startTime = process.hrtime.bigint();
            const jid = message.key.remoteJid;
            const isGroup = jid.includes('@g.us');
            
            // Get the actual sender in group chats
            const sender = isGroup && message.key.participant 
                ? message.key.participant 
                : jid;
                
            const prefix = config.bot.prefix || '.';
            const commandName = args[0]?.toLowerCase();
            
            // Prepare options for group or private chat
            const messageOptions = {};
            
            // Add mention for group chats to get user's attention
            if (isGroup && message.key.participant) {
                messageOptions.mentions = [message.key.participant];
                messageOptions.quoted = message;
            }
            
            if (!commandName) {
                // If no command name is provided, show a list of available command categories
                const { allCommands } = await loadAllCommands();
                
                let helpText = `📋 *COMMAND HELP GUIDE*\n\n`;
                helpText += `To see help for a command, use:\n`;
                helpText += `${prefix}help <command>\n\n`;
                
                helpText += `Available categories:\n`;
                
                const orderedCategories = [
                    'basic', 'utility', 'group', 'media', 'fun',
                    'reactions', 'user', 'user_extended', 'educational',
                    'nsfw', 'menu'
                ];
                
                for (const category of orderedCategories) {
                    if (!allCommands[category] || allCommands[category].length === 0) continue;
                    
                    const emoji = categoryEmojis[category] || categoryEmojis.default;
                    const categoryDisplayName = categoryNames[category] || category;
                    const commandCount = allCommands[category].length;
                    
                    helpText += `${emoji} *${categoryDisplayName}* (${commandCount} commands)\n`;
                }
                
                helpText += `\nUse ${prefix}menu to see all commands`;
                
                await safeSendMessage(sock, jid, { text: helpText }, messageOptions);
                return true;
            } else {
                // Show help for a specific command
                // Perform a search for the command in all modules
                const { allCommands } = await loadAllCommands();
                let foundCategory = null;
                
                // Search for the command in all categories
                for (const category in allCommands) {
                    if (allCommands[category].includes(commandName)) {
                        foundCategory = category;
                        break;
                    }
                }
                
                if (foundCategory) {
                    // For simplicity, just show generic help for now
                    const emoji = categoryEmojis[foundCategory] || categoryEmojis.default;
                    const categoryDisplayName = categoryNames[foundCategory] || foundCategory;
                    
                    let helpText = `📋 *COMMAND HELP: ${prefix}${commandName}*\n\n`;
                    helpText += `Category: ${emoji} ${categoryDisplayName}\n`;
                    helpText += `Usage: ${prefix}${commandName}\n\n`;
                    helpText += `Note: Detailed help is not available for this command yet. Try using the command to learn how it works.\n`;
                    
                    await safeSendMessage(sock, jid, { text: helpText }, messageOptions);
                    return true;
                } else {
                    await safeSendMessage(sock, jid, { 
                        text: `❓ Command *${commandName}* not found. Use ${prefix}menu to see available commands.` 
                    }, { quoted: message })
                        .catch(() => {/* Silent catch */});
                }
            }
            return false;
        } catch (err) {
            logger.error('Help command error:', err);
            safeSendText(sock, message.key.remoteJid, 
                `❌ Error with help command`
            ).catch(() => {/* Silent catch */});
            return false;
        }
    }
};

// Cache for command loading
let commandCache = null;
let commandCacheTimestamp = 0;
const CACHE_LIFETIME = 300000; // 5 minutes in milliseconds

// Load all commands from command files with caching
async function loadAllCommands() {
    try {
        // Check if we have a valid cache
        const now = Date.now();
        if (commandCache && (now - commandCacheTimestamp < CACHE_LIFETIME)) {
            // Cache is still valid
            logger.info('Using cached commands list');
            return commandCache;
        }

        // Cache expired or doesn't exist, perform fresh load
        logger.info('Loading fresh commands list');
        const commandsPath = path.join(process.cwd(), 'src/commands');
        const allCommands = {};
        let totalCommands = 0;

        // Function to get all JS files in a directory (non-recursive)
        async function getCommandFiles() {
            try {
                // Get all files directly in the commands directory
                const entries = await fs.readdir(commandsPath, { withFileTypes: true });
                const files = [];
                
                for (const entry of entries) {
                    const fullPath = path.join(commandsPath, entry.name);
                    if (entry.isFile() && entry.name.endsWith('.js')) {
                        // Skip the current menu file
                        if (entry.name !== 'menu.js') {
                            files.push(fullPath);
                        }
                    } else if (entry.isDirectory()) {
                        // For subdirectories, get JS files one level deep
                        try {
                            const subEntries = await fs.readdir(fullPath, { withFileTypes: true });
                            for (const subEntry of subEntries) {
                                if (subEntry.isFile() && subEntry.name.endsWith('.js')) {
                                    files.push(path.join(fullPath, subEntry.name));
                                }
                            }
                        } catch (err) {
                            logger.error(`Error reading subdirectory: ${fullPath}`, err);
                        }
                    }
                }
                
                return files;
            } catch (err) {
                logger.error('Error reading command directory:', err);
                return [];
            }
        }

        // Get all command files
        const commandFiles = await getCommandFiles();
        logger.info(`Found ${commandFiles.length} potential command files`);

        // Process each command file
        for (const file of commandFiles) {
            try {
                // Clean require cache to ensure fresh load
                const modulePath = require.resolve(file);
                if (require.cache[modulePath]) {
                    delete require.cache[modulePath];
                }
                
                const moduleData = require(file);
                let category = path.basename(path.dirname(file));

                // If it's in the root commands directory, use the filename as category
                if (category === 'commands') {
                    category = path.basename(file, '.js');
                }

                // Get commands from module
                let commands = moduleData.commands || moduleData;
                if (typeof commands === 'object') {
                    // Filter valid commands - with additional error checking
                    const commandList = Object.keys(commands).filter(cmd => {
                        try {
                            return typeof commands[cmd] === 'function' && cmd !== 'init';
                        } catch (e) {
                            logger.error(`Error accessing command ${cmd} in ${file}:`, e);
                            return false;
                        }
                    });

                    if (commandList.length > 0) {
                        if (!allCommands[category]) {
                            allCommands[category] = [];
                        }
                        allCommands[category].push(...commandList);
                        totalCommands += commandList.length;
                        logger.info(`Loaded ${commandList.length} commands from ${category}`);
                    }
                }
            } catch (err) {
                logger.error(`Error loading commands from ${file}:`, err);
            }
        }

        // Also check the index.js for additional commands
        try {
            const indexPath = path.join(commandsPath, 'index.js');
            if (require.cache[require.resolve(indexPath)]) {
                delete require.cache[require.resolve(indexPath)];
            }
            
            const indexCommands = require(indexPath).commands;
            if (indexCommands && typeof indexCommands === 'object') {
                const mainCommands = Object.keys(indexCommands).filter(cmd => {
                    try {
                        return typeof indexCommands[cmd] === 'function' && cmd !== 'init';
                    } catch (e) {
                        logger.error(`Error accessing command ${cmd} in index.js:`, e);
                        return false;
                    }
                });

                if (mainCommands.length > 0) {
                    if (!allCommands['main']) {
                        allCommands['main'] = [];
                    }
                    allCommands['main'].push(...mainCommands);
                    totalCommands += mainCommands.length;
                    logger.info(`Loaded ${mainCommands.length} commands from index.js`);
                }
            }
        } catch (err) {
            logger.error('Error loading commands from index.js:', err);
        }

        logger.info(`Total commands loaded: ${totalCommands} from ${Object.keys(allCommands).length} categories`);
        
        // Update cache
        commandCache = { allCommands, totalCommands };
        commandCacheTimestamp = now;
        
        return commandCache;
    } catch (err) {
        logger.error('Error loading commands:', err);
        
        // Create fallback minimal command list if error occurs
        const fallbackCommands = {
            allCommands: {
                'menu': ['menu', 'help'],
                'basic': ['ping', 'info']
            },
            totalCommands: 4
        };
        
        return fallbackCommands;
    }
}

module.exports = {
    commands: {
        ...menuCommands
    },
    category: 'menu',
    async init() {
        try {
            logger.info('Initializing menu system...');
            await loadAllCommands(); // Pre-cache commands during init
            logger.info('Menu system initialized successfully');
            return true;
        } catch (err) {
            logger.error('Failed to initialize menu system:', err);
            return false;
        }
    }
};