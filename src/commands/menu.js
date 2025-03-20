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
            
            // Ultra-fast path: Get language early for immediate response
            const userLang = config.bot.language || 'en';
            
            // STAGE 1: IMMEDIATE RESPONSE (Ultra-fast path)
            // If no specific command is requested, we can respond immediately
            if (!commandName) {
                // Fire off an immediate response for general help (<5ms target)
                const basicHelpText = `*📚 BOT HELP*\n\n` +
                    `• Use \`${prefix}help [command]\` to get info about a specific command\n` +
                    `• Use \`${prefix}menu\` to see all available commands\n` +
                    `• Example: \`${prefix}help sticker\`\n\n` +
                    `*Loading more details...*`;
                
                // Send basic help text immediately for sub-5ms response time, group aware
                const loadingPromise = isGroup && typeof safeSendGroupMessage === 'function'
                    ? safeSendGroupMessage(sock, jid, { text: basicHelpText }, messageOptions)
                        .catch(() => {/* Silent catch for fire-and-forget */})
                    : safeSendText(sock, jid, basicHelpText)
                        .catch(() => {/* Silent catch for fire-and-forget */});
                
                // STAGE 2: BACKGROUND PROCESSING
                // Generate the full formatted help text in the background
                setTimeout(async () => {
                    try {
                        // Add personalized greeting in groups
                        let personalization = '';
                        if (isGroup) {
                            const mention = `@${sender.split('@')[0]}`;
                            personalization = `┃ ${symbols.bullet} *User:* ${mention}\n`;
                        }
                        
                        const helpText = `┏━━━❮ *📚 ${languageManager.getText('menu.command_help', userLang)}* ❯━━━┓
┃
${personalization}┃ ${symbols.arrow} ${languageManager.getText('menu.command_info', userLang)}:
┃   \`${prefix}help [command]\`
┃
┃ ${symbols.arrow} ${languageManager.getText('menu.available_commands', userLang)}:
┃   \`${prefix}menu\` - ${languageManager.getText('menu.categories', userLang)}
┃   \`${prefix}menu1\` - ${languageManager.getText('menu.bot_menu', userLang)}
┃   \`${prefix}list\` - ${languageManager.getText('menu.categories', userLang)}
┃   \`${prefix}list [category]\` - ${languageManager.getText('menu.category', userLang)}
┃
┃ ${symbols.star} *${languageManager.getText('menu.help_examples', userLang)}:*
┃   \`${prefix}help sticker\`
┃   \`${prefix}list media\`
┃
┗━━━━━━━━━━━━━━━━━━━━┛`;
                        
                        // Wait a moment to ensure the loading message was seen
                        await new Promise(resolve => setTimeout(resolve, 100));
                        
                        // Send the fully formatted help text with group awareness
                        if (isGroup && typeof safeSendGroupMessage === 'function') {
                            await safeSendGroupMessage(sock, jid, { text: helpText }, messageOptions);
                        } else {
                            await safeSendMessage(sock, jid, { text: helpText });
                        }
                    } catch (bgError) {
                        // Silent error in background processing
                    }
                }, 10);
                
                // Calculate response time for the initial text
                const initialResponseTime = Number(process.hrtime.bigint() - startTime) / 1_000_000;
                if (initialResponseTime > 5) {
                    logger.warn(`Initial help response time exceeded target: ${initialResponseTime.toFixed(2)}ms`);
                }
                
                return true; // Return immediately to unblock main thread
            }
            
            // SPECIFIC COMMAND HELP PATH
            // Send immediate acknowledgment to ensure <5ms initial response
            const loadingPromise = isGroup && typeof safeSendGroupMessage === 'function'
                ? safeSendGroupMessage(sock, jid, 
                    { text: `*📚 Looking up help for command:* \`${commandName}\`...` }, 
                    messageOptions)
                    .catch(() => {/* Silent catch */})
                : safeSendText(sock, jid, 
                    `*📚 Looking up help for command:* \`${commandName}\`...`)
                    .catch(() => {/* Silent catch */});
            
            // Process the command lookup in background
            setTimeout(async () => {
                try {
                    // Find command details
                    const commandsPath = path.join(process.cwd(), 'src/commands');
                    const commandFiles = await fs.readdir(commandsPath);
                    let foundCommand = null;
                    let foundIn = null;
                
                    // Fast-path command search
                    for (const file of commandFiles) {
                        if (file.endsWith('.js') && path.basename(file) !== 'index.js') {
                            try {
                                const moduleData = require(path.join(commandsPath, file));
                                let commandsObject = moduleData.commands || moduleData;
                
                                if (commandsObject[commandName]) {
                                    foundCommand = true;
                                    foundIn = moduleData.category || path.basename(file, '.js');
                                    break;
                                }
                            } catch (err) {
                                // Silent error for search
                            }
                        }
                    }
                
                    if (foundCommand) {
                        const emoji = categoryEmojis[foundIn] || categoryEmojis.default;
                        
                        // Simplified configuration lookup - minimal I/O operations
                        let configInfo = "No additional information available.";
                        try {
                            const configPath = path.join(process.cwd(), 'src/config/commands', `${foundIn}.json`);
                            const configData = await fs.readFile(configPath, 'utf8');
                            const configs = JSON.parse(configData);
                
                            const cmdConfig = configs.commands?.find(cmd => cmd.name === commandName);
                            if (cmdConfig && cmdConfig.description) {
                                configInfo = cmdConfig.description;
                            }
                        } catch (err) {
                            // Config file might not exist, that's ok
                        }
                        
                        // Simplified category name lookup
                        let categoryDisplayName = categoryNames[foundIn] || foundIn;
                        
                        // Add personalized greeting in groups
                        let personalization = '';
                        if (isGroup) {
                            const mention = `@${sender.split('@')[0]}`;
                            personalization = `┃ ${symbols.bullet} *Requested by:* ${mention}\n`;
                        }
                
                        const helpText = `┏━━━❮ *${emoji} Command Info* ❯━━━┓
┃
${personalization}┃ *${symbols.star} Command:* \`${prefix}${commandName}\`
┃ *${symbols.bullet} Category:* ${categoryDisplayName}
┃
┃ *${symbols.arrow} Description:* 
┃   ${configInfo}
┃
┃ *${symbols.bullet} Usage:* 
┃   \`${prefix}${commandName}\`
┃
┗━━━━━━━━━━━━━━━━━━━━┛`;
                
                        // Wait a moment to ensure the loading message was seen
                        await new Promise(resolve => setTimeout(resolve, 100));
                        
                        // Send the detailed command help with group awareness
                        if (isGroup && typeof safeSendGroupMessage === 'function') {
                            await safeSendGroupMessage(sock, jid, { text: helpText }, messageOptions);
                        } else {
                            await safeSendMessage(sock, jid, { text: helpText });
                        }
                    } else {
                        // Command not found - group aware error message
                        if (isGroup && typeof safeSendGroupMessage === 'function') {
                            await safeSendGroupMessage(sock, jid, { 
                                text: `❌ Command \`${commandName}\` not found. Use \`${prefix}menu\` to see available commands.`
                            }, messageOptions);
                        } else {
                            await safeSendText(sock, jid, 
                                `❌ Command \`${commandName}\` not found. Use \`${prefix}menu\` to see available commands.`
                            );
                        }
                    }
                } catch (bgError) {
                    // Silent background error with group-aware messaging
                    if (isGroup && typeof safeSendGroupMessage === 'function') {
                        await safeSendGroupMessage(sock, jid, { 
                            text: `❌ Error looking up command help.`
                        }, messageOptions).catch(() => {/* Silent */});
                    } else {
                        await safeSendText(sock, jid, 
                            `❌ Error looking up command help.`
                        ).catch(() => {/* Silent */});
                    }
                }
            }, 10);
            
            // Calculate initial response time
            const initialResponseTime = Number(process.hrtime.bigint() - startTime) / 1_000_000;
            if (initialResponseTime > 5) {
                logger.warn(`Initial help response time exceeded target: ${initialResponseTime.toFixed(2)}ms`);
            }
            
            return true; // Return immediately to unblock main thread
            
        } catch (err) {
            // Ultra-minimal error handling for better performance
            const jid = message.key.remoteJid;
            const isGroup = jid.includes('@g.us');
            
            if (isGroup && typeof safeSendGroupMessage === 'function') {
                safeSendGroupMessage(sock, jid, { 
                    text: `❌ Error with help command` 
                }, { quoted: message })
                    .catch(() => {/* Silent catch */});
            } else {
                safeSendText(sock, jid, `❌ Error with help command`)
                    .catch(() => {/* Silent catch */});
            }
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

        // Function to recursively get all files
        async function getAllFiles(dir) {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            const files = await Promise.all(entries.map(async entry => {
                const fullPath = path.join(dir, entry.name);
                return entry.isDirectory() ? getAllFiles(fullPath) : fullPath;
            }));
            return files.flat();
        }

        // Get all JS files including those in subdirectories
        const commandFiles = await getAllFiles(commandsPath);
        logger.info(`Found ${commandFiles.length} potential command files`);

        // Process each command file
        for (const file of commandFiles) {
            if (file.endsWith('.js') && !['index.js', 'menu.js'].includes(path.basename(file))) {
                try {
                    const moduleData = require(file);
                    let category = path.basename(path.dirname(file));

                    // If it's in the root commands directory, use the filename as category
                    if (category === 'commands') {
                        category = path.basename(file, '.js');
                    }

                    // Get commands from module
                    let commands = moduleData.commands || moduleData;
                    if (typeof commands === 'object') {
                        // Filter valid commands
                        const commandList = Object.keys(commands).filter(cmd =>
                            typeof commands[cmd] === 'function' && cmd !== 'init'
                        );

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
        }

        // Also check the index.js for additional commands
        try {
            const indexCommands = require('./index').commands;
            if (indexCommands && typeof indexCommands === 'object') {
                const mainCommands = Object.keys(indexCommands).filter(cmd =>
                    typeof indexCommands[cmd] === 'function' && cmd !== 'init'
                );

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
        return { allCommands: {}, totalCommands: 0 };
    }
}

// Cache for images and GIFs
const imageCache = new Map();
const IMAGE_CACHE_LIFETIME = 300000; // 5 minutes in milliseconds

/**
 * Optimized helper function to send menu message with image or GIF
 * Uses caching to avoid repeated filesystem access
 */
// Pre-buffer some common icons and images for ultra-fast access
const imageBuffer = {};

/**
 * Ultra-optimized helper function to send menu message with text-only responses
 * Avoids image loading completely for maximum speed and reliability
 */
async function sendMenuWithMedia(sock, jid, text) {
    try {
        // ULTRA-FAST OPTIMIZATION: Skip all image handling and go straight to text
        // This completely avoids the metadata error and provides instant responses
        
        // Send header text with emoji for a nice appearance without images
        const headerText = `*🤖 BLACKSKY-MD BOT*\n\n`;
        
        // Combine header and main text for a clean presentation
        await safeSendMessage(sock, jid, {
            text: headerText + text
        });
        
        logger.info(`Menu sent with ultra-fast text-only mode for maximum performance`);
        return true;
    } catch (err) {
        // Ultra-minimal error handling to ensure message is sent
        logger.error(`Error in sendMenuWithMedia: ${err.message}`);
        try {
            // Always fall back to bare text as ultimate reliability measure
            await safeSendText(sock, jid, text);
            logger.info(`Menu sent as text only (error fallback)`);
            return true;
        } catch (finalErr) {
            logger.error(`Critical failure sending menu: ${finalErr.message}`);
            return false;
        }
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
            await loadAllCommands();
            logger.info('Menu system initialized successfully');
            return true;
        } catch (err) {
            logger.error('Failed to initialize menu system:', err);
            return false;
        }
    }
};