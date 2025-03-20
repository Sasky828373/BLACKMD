const logger = require('../utils/logger');
const { safeSendMessage, safeSendText, safeSendImage } = require('../utils/jidHelper');
const fs = require('fs');
const path = require('path');

// Command storage
const commands = new Map();

// Load JSON configurations for commands
async function loadCommandConfig(commandName) {
    try {
        const configDir = path.join(process.cwd(), 'src/config/commands');
        const configFiles = await fs.promises.readdir(configDir);
        
        for (const file of configFiles) {
            if (!file.endsWith('.json')) continue;
            
            const configPath = path.join(configDir, file);
            const configContent = await fs.promises.readFile(configPath, 'utf8');
            const config = JSON.parse(configContent);
            
            if (Array.isArray(config.commands)) {
                // Find the command config by name
                const cmdConfig = config.commands.find(cmd => cmd.name === commandName);
                if (cmdConfig) {
                    return {
                        ...cmdConfig,
                        configCategory: file.replace('.json', '')
                    };
                }
            }
        }
        return null;
    } catch (err) {
        logger.error(`Error loading config for command ${commandName}:`, err);
        return null;
    }
}

// Load all commands from the commands directory
async function loadCommands() {
    try {
        logger.info('Loading commands from modules...');
        
        // First, load the index.js module
        const commandsIndex = require('../commands/index');
        
        if (commandsIndex && commandsIndex.commands) {
            const allCommands = commandsIndex.commands;
            const commandCount = Object.keys(allCommands).length;
            
            logger.info(`Found ${commandCount} commands in commands/index.js`);
            
            // Register each command from the index
            for (const [name, func] of Object.entries(allCommands)) {
                if (typeof func === 'function' && name !== 'init') {
                    try {
                        // Load configuration for this command from JSON files
                        const config = await loadCommandConfig(name);
                        
                        commands.set(name, {
                            execute: async (sock, message, args, options = {}) => {
                                try {
                                    return await func(sock, message, args, options);
                                } catch (err) {
                                    logger.error(`Error executing command ${name}:`, err);
                                    throw err;
                                }
                            },
                            cooldown: config?.cooldown || 5,
                            groupOnly: config?.groupOnly || false,
                            category: config?.configCategory || 'uncategorized',
                            description: config?.description || `Command: ${name}`,
                            usage: config?.usage || `!${name}`,
                            enabled: config?.enabled !== false,
                            permissions: config?.permissions || ['user']
                        });
                    } catch (err) {
                        logger.error(`Error registering command ${name}:`, err);
                    }
                }
            }
            
            logger.info(`Registered ${commands.size} commands from modules`);
        }
        
        // Also load individual command files directly for more reliability
        try {
            // Import the command adapter
            const { extractCommands, standardizeCommandModule } = require('../utils/commandAdapter');
            
            // Define command modules to load
            const commandModules = [
                { name: 'basic', module: require('../commands/basic') },
                { name: 'fun', module: require('../commands/fun') },
                { name: 'group', module: require('../commands/group') },
                { name: 'media', module: require('../commands/media') },
                { name: 'menu', module: require('../commands/menu') },
                { name: 'nsfw', module: require('../commands/nsfw') },
                { name: 'owner', module: require('../commands/owner') },
                { name: 'reactions', module: require('../commands/reactions') },
                { name: 'user', module: require('../commands/user') },
                { name: 'user_extended', module: require('../commands/user_extended') },
                { name: 'educational', module: require('../commands/educational') },
                { name: 'utility', module: require('../commands/utility') }
            ];
            
            // Load all command configs to process in batch
            const commandConfigs = new Map();
            const configDir = path.join(process.cwd(), 'src/config/commands');
            const configFiles = await fs.promises.readdir(configDir);
            
            for (const file of configFiles) {
                if (!file.endsWith('.json')) continue;
                
                const configPath = path.join(configDir, file);
                const configContent = await fs.promises.readFile(configPath, 'utf8');
                const config = JSON.parse(configContent);
                
                if (Array.isArray(config.commands)) {
                    const category = file.replace('.json', '');
                    for (const cmdConfig of config.commands) {
                        if (cmdConfig.name) {
                            commandConfigs.set(cmdConfig.name, {
                                ...cmdConfig,
                                configCategory: category
                            });
                        }
                    }
                }
            }
            
            logger.info(`Loaded ${commandConfigs.size} command configurations from JSON files`);
            
            for (const { name, module } of commandModules) {
                // Standardize the module format
                const standardizedModule = standardizeCommandModule(module, name);
                const moduleCommands = standardizedModule.commands;
                const category = standardizedModule.category || name;
                
                // Register each command with proper error handling
                for (const [cmdName, cmdFunc] of Object.entries(moduleCommands)) {
                    if (typeof cmdFunc === 'function' && cmdName !== 'init') {
                        try {
                            // Get configuration from our preloaded configs
                            const config = commandConfigs.get(cmdName);
                            
                            commands.set(cmdName, {
                                execute: async (sock, message, args, options = {}) => {
                                    try {
                                        return await cmdFunc(sock, message, args, options);
                                    } catch (err) {
                                        logger.error(`Error executing command ${cmdName} from ${name}:`, err);
                                        throw err;
                                    }
                                },
                                cooldown: config?.cooldown || 5,
                                groupOnly: config?.groupOnly || name === 'group',
                                category: config?.configCategory || category,
                                description: config?.description || `Command: ${cmdName}`,
                                usage: config?.usage || `!${cmdName}`,
                                enabled: config?.enabled !== false,
                                permissions: config?.permissions || ['user']
                            });
                        } catch (err) {
                            logger.error(`Error registering command ${cmdName} from ${name}:`, err);
                        }
                    }
                }
            }
            
            logger.info(`After direct loading: ${commands.size} total commands registered`);
        } catch (err) {
            logger.error('Error loading individual command modules:', err);
        }
        
        // Add basic commands if they don't exist yet
        if (!commands.has('ping')) {
            commands.set('ping', {
                execute: async (sock, message, args, options = {}) => {
                    try {
                        const sender = message.key.remoteJid;
                        await safeSendText(sock, sender, '🏓 Pong! Bot is active and responding.' 
                        );
                    } catch (err) {
                        logger.error('Error executing ping command:', err);
                        throw err;
                    }
                },
                cooldown: 5,
                groupOnly: false
            });
        }
        
        if (!commands.has('help')) {
            commands.set('help', {
                execute: async (sock, message, args, options = {}) => {
                    try {
                        const sender = message.key.remoteJid;
                        
                        // If a specific category is provided
                        if (args.length > 0) {
                            const requestedCategory = args[0].toLowerCase();
                            const categoryCommands = Array.from(commands.entries())
                                .filter(([_, cmd]) => cmd.category?.toLowerCase() === requestedCategory && (!options.isGroup || !cmd.groupOnly))
                                .sort((a, b) => a[0].localeCompare(b[0])); // Sort alphabetically
                            
                            if (categoryCommands.length === 0) {
                                await safeSendText(sock, sender, `❌ No commands found in category: ${requestedCategory}\nUse .help to see all available categories.`);
                                return;
                            }
                            
                            const commandList = categoryCommands.map(([name, cmd]) => {
                                return `.${name} - ${cmd.description || 'No description'}`;
                            }).join('\n');
                            
                            await safeSendMessage(sock, sender, {
                                text: `*Commands in category "${requestedCategory}":*\n\n${commandList}\n\nUse .help [command] for specific command details.`
                            });
                            return;
                        }
                        
                        // If a specific command is requested
                        if (args.length > 0 && commands.has(args[0].toLowerCase())) {
                            const cmdName = args[0].toLowerCase();
                            const cmd = commands.get(cmdName);
                            
                            await safeSendMessage(sock, sender, {
                                text: `*Command: ${cmdName}*\n\n` +
                                      `Description: ${cmd.description || 'No description'}\n` +
                                      `Usage: ${cmd.usage || '.' + cmdName}\n` +
                                      `Cooldown: ${cmd.cooldown || 3}s\n` +
                                      `Category: ${cmd.category || 'Uncategorized'}\n` +
                                      `Group Only: ${cmd.groupOnly ? 'Yes' : 'No'}`
                            });
                            return;
                        }
                        
                        // Group commands by category
                        const categorizedCommands = Array.from(commands.entries())
                            .filter(([_, cmd]) => !options.isGroup || !cmd.groupOnly)
                            .reduce((acc, [name, cmd]) => {
                                const category = cmd.category || 'Uncategorized';
                                if (!acc[category]) acc[category] = [];
                                acc[category].push(name);
                                return acc;
                            }, {});
                        
                        // Create category list
                        let categoryList = '*Available Command Categories:*\n\n';
                        for (const [category, cmdList] of Object.entries(categorizedCommands)) {
                            categoryList += `📁 ${category} (${cmdList.length} commands)\n`;
                        }
                        
                        categoryList += '\nUse .help [category] to list commands in a category.\nUse .help [command] for specific command details.';
                        
                        await safeSendMessage(sock, sender, {
                            text: categoryList
                        });
                    } catch (err) {
                        logger.error('Error executing help command:', err);
                        throw err;
                    }
                },
                cooldown: 10,
                groupOnly: false,
                description: 'Get help with bot commands',
                usage: '.help [category/command]',
                category: 'basic'
            });
        }
        
        // Initialize all modules
        if (commandsIndex.initializeModules) {
            logger.info('Initializing all command modules...');
            await commandsIndex.initializeModules(null); // null for sock, will be provided later
        }
        
        logger.info('All commands loaded successfully:', {
            commandCount: commands.size,
            availableCommands: Array.from(commands.keys())
        });
        
        return true;
    } catch (err) {
        logger.error('Error loading commands:', err);
        logger.error('Stack trace:', err.stack);
        
        // Register fallback basic commands
        if (commands.size === 0) {
            logger.info('Registering fallback basic commands...');
            
            commands.set('ping', {
                execute: async (sock, message, args, options = {}) => {
                    try {
                        const sender = message.key.remoteJid;
                        await safeSendText(sock, sender, '🏓 Pong! Bot is active and responding.' 
                        );
                    } catch (err) {
                        logger.error('Error executing ping command:', err);
                        throw err;
                    }
                },
                cooldown: 5,
                groupOnly: false
            });
            
            commands.set('help', {
                execute: async (sock, message, args, options = {}) => {
                    try {
                        const sender = message.key.remoteJid;
                        await safeSendText(sock, sender, `*Available Commands:*\n\n.ping - Bot status check\n.help - Show this help message`
                        );
                    } catch (err) {
                        logger.error('Error executing help command:', err);
                        throw err;
                    }
                },
                cooldown: 10,
                groupOnly: false
            });
            
            logger.info('Fallback commands registered successfully');
        }
        
        return false;
    }
}

// Initialize by loading commands
(async () => {
    try {
        await loadCommands();
    } catch (err) {
        logger.error('Failed to initialize command handler:', err);
    }
})();

/**
 * Process incoming commands
 */
// Command cache for direct module lookup
const commandModuleCache = new Map();

/**
 * Process incoming commands with optimized performance
 */
async function processCommand(sock, message, commandText, options = {}) {
    const sender = message.key.remoteJid;

    try {
        // Skip if no command text (fast path)
        if (!commandText?.trim()) {
            return;
        }

        // Split command and args - optimize by limiting splits
        const parts = commandText.trim().split(' ');
        const cmdName = parts[0].toLowerCase();
        const args = parts.slice(1);

        // Minimal logging for command processing - only log command name and args
        console.log(`Processing command: ${cmdName} with args: ${JSON.stringify(args)}`);

        // Try to get command handler from our Map (fastest path)
        const command = commands.get(cmdName);

        if (command) {
            // Fast path - Check group-only commands
            if (command.groupOnly && !options.isGroup) {
                await safeSendText(sock, sender, '❌ This command can only be used in groups.');
                return;
            }

            // Execute command
            await command.execute(sock, message, args, options);
            console.log(`Command executed successfully: ${cmdName}`);
            return;
        }

        // Slower path - Check module cache first before requiring module again
        if (!commandModuleCache.has('indexCommands')) {
            try {
                // Use the command adapter for standardized imports
                const { extractCommands } = require('../utils/commandAdapter');
                const commandsIndex = require('../commands/index');
                
                // Extract commands in a standardized format
                const standardizedCommands = extractCommands(commandsIndex, 'index');
                commandModuleCache.set('indexCommands', standardizedCommands);
            } catch (err) {
                logger.error(`Error loading index commands: ${err.message}`);
                commandModuleCache.set('indexCommands', {});
            }
        }

        // Get cached commands
        const cachedCommands = commandModuleCache.get('indexCommands');
        
        // If command exists in cached module
        if (cachedCommands && typeof cachedCommands[cmdName] === 'function') {
            try {
                await cachedCommands[cmdName](sock, message, args, options);
                console.log(`Command executed successfully from modules: ${cmdName}`);
                return;
            } catch (cmdErr) {
                logger.error(`Error executing command ${cmdName} from cached modules: ${cmdErr.message}`);
                throw cmdErr;
            }
        }
        
        // Command not found - only send message for actual command attempts (starting with !)
        if (commandText.startsWith('.')) {
            await safeSendText(sock, sender, `❌ Unknown command: ${cmdName}\nUse .help to see available commands.`);
        }
    } catch (err) {
        // Streamlined error logging
        logger.error(`Command error (${commandText}): ${err.message}`);
        
        try {
            await safeSendText(sock, sender, '❌ Command failed. Please try again.\n\nUse .help to see available commands.');
        } catch (sendErr) {
            // Silent fail for error message
        }
    }
}

/**
 * Check if command handler is properly loaded
 * This is used by the message handler to verify command handler status
 */
function isInitialized() {
    return commands.size > 0;
}

// Export module
module.exports = {
    processCommand,
    commands,
    isInitialized,
    loadCommands // Export for testing or manual reloading
};