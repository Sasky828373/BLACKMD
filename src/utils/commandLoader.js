const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const logger = require('./logger');
const globalConfig = require('../config/globalConfig');

class CommandError extends Error {
    constructor(message, command, originalError = null) {
        super(message);
        this.name = 'CommandError';
        this.command = command;
        this.originalError = originalError;
    }
}

class CommandLoader {
    constructor() {
        this.commands = new Map();
        this.commandCache = new Map();
        this.initialized = false;
        this.commandConfigs = new Map();
        this.lastReload = Date.now();
        this.reloadCooldown = 1000;
        this.fs = fs;
        this.fsPromises = fsPromises;
        this.commandSources = new Map();
    }

    async loadCommandsFromDirectory(dir, category = '') {
        logger.info(`Scanning directory: ${dir} (category: ${category || 'root'})`);
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
        const loadedHandlers = {};

        // Log all entries found in this directory
        const directories = entries.filter(e => e.isDirectory()).map(e => e.name);
        const jsFiles = entries.filter(e => e.isFile() && e.name.endsWith('.js')).map(e => e.name);
        logger.info(`Found in ${path.basename(dir)}: Directories: [${directories.join(', ')}], JS files: [${jsFiles.join(', ')}]`);

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                // Recursively load commands from subdirectories
                const subCategory = category ? `${category}_${entry.name}` : entry.name;
                logger.info(`Processing subdirectory: ${entry.name} as category: ${subCategory}`);
                const subHandlers = await this.loadCommandsFromDirectory(fullPath, subCategory);
                Object.assign(loadedHandlers, subHandlers);
                continue;
            }

            if (!entry.name.endsWith('.js') || entry.name === 'index.js') {
                logger.info(`Skipping non-command file: ${entry.name}`);
                continue;
            }

            const currentCategory = category || entry.name.replace('.js', '');
            logger.info(`Loading commands from file: ${entry.name} (category: ${currentCategory})`);

            try {
                delete require.cache[require.resolve(fullPath)];
                const module = require(fullPath);

                if (!module || !module.commands || typeof module.commands !== 'object') {
                    logger.warn(`Invalid module format in ${entry.name}, module keys: ${module ? Object.keys(module).join(', ') : 'null'}`);
                    continue;
                }

                if (!loadedHandlers[currentCategory]) {
                    loadedHandlers[currentCategory] = {
                        total: 0,
                        loaded: 0,
                        failed: 0
                    };
                }

                const commandNames = Object.keys(module.commands);
                logger.info(`Found ${commandNames.length} commands in ${entry.name}: ${commandNames.join(', ')}`);

                for (const [name, handler] of Object.entries(module.commands)) {
                    try {
                        loadedHandlers[currentCategory].total++;
                        logger.info(`Processing command: ${name} in ${entry.name}`);

                        // Special debugging for user_extended.js module
                        if (entry.name === 'user_extended.js') {
                            logger.info(`DEBUG - Checking user_extended command: ${name}, type: ${typeof handler}`);
                            // Inspect the handler in greater detail
                            if (typeof handler !== 'function') {
                                logger.error(`Invalid handler type in user_extended.js for command '${name}': ${typeof handler}`);
                                if (handler === null) {
                                    logger.error(`Handler is null for command '${name}'`);
                                } else if (handler === undefined) {
                                    logger.error(`Handler is undefined for command '${name}'`);
                                } else if (typeof handler === 'object') {
                                    logger.error(`Handler is object for command '${name}': ${JSON.stringify(handler)}`);
                                }
                            }
                        }

                        if (typeof handler !== 'function') {
                            loadedHandlers[currentCategory].failed++;
                            logger.warn(`Skipping non-function handler for ${name} in ${entry.name}, type: ${typeof handler}`);
                            continue;
                        }

                        const config = {
                            name,
                            description: `Command: ${name}`,
                            usage: `${globalConfig.prefix}${name}`,
                            cooldown: 3,
                            permissions: module.category === 'owner' ? ['owner'] : ['user'],
                            enabled: true
                        };

                        // Check if command name starts with underscore
                        if (name.startsWith('_')) {
                            logger.warn(`Command name starts with underscore: ${name} in ${entry.name} - this might cause issues`);
                        }

                        this.commands.set(name, {
                            execute: handler,
                            config,
                            category: currentCategory
                        });

                        this.commandSources.set(name, fullPath);
                        loadedHandlers[currentCategory].loaded++;
                        logger.info(`Successfully registered command: ${name} in ${entry.name}`);

                        if (!this.commandCache.has(name)) {
                            this.commandCache.set(name, {
                                lastUsed: Date.now(),
                                usageCount: 0,
                                errors: 0
                            });
                        }
                    } catch (err) {
                        loadedHandlers[currentCategory].failed++;
                        logger.error(`Failed to register handler for ${name} in ${entry.name}:`, err);
                        logger.error(err.stack);
                    }
                }
            } catch (err) {
                logger.error(`Error processing module ${entry.name}:`, err);
                logger.error(err.stack);
            }
        }

        // Log the summary for this directory
        for (const [category, stats] of Object.entries(loadedHandlers)) {
            logger.info(`Directory ${path.basename(dir)} - Category ${category}: Total: ${stats.total}, Loaded: ${stats.loaded}, Failed: ${stats.failed}`);
        }

        return loadedHandlers;
    }

    async loadCommandHandlers() {
        try {
            if (this.initialized && Date.now() - this.lastReload < this.reloadCooldown) {
                return false;
            }

            this.commands.clear();
            this.commandSources.clear();

            const commandsPath = path.join(process.cwd(), 'src/commands');
            logger.info(`Loading commands from path: ${commandsPath}`);
            
            // List all directories in the commands folder
            const entries = await fsPromises.readdir(commandsPath, { withFileTypes: true });
            const directories = entries.filter(entry => entry.isDirectory()).map(dir => dir.name);
            logger.info(`Found command directories: ${directories.join(', ')}`);
            
            // Special handling for user_extended.js
            const userExtendedPath = path.join(commandsPath, 'user_extended.js');
            if (fs.existsSync(userExtendedPath)) {
                try {
                    delete require.cache[require.resolve(userExtendedPath)];
                    const module = require(userExtendedPath);
                    if (module && module.commands) {
                        const commandNames = Object.keys(module.commands);
                        logger.info(`DEBUG - User_extended commands: ${commandNames.join(', ')}`);
                        logger.info(`DEBUG - User_extended total commands: ${commandNames.length}`);
                        
                        // Validate each command
                        let validCount = 0;
                        let invalidCount = 0;
                        let invalidCommands = [];
                        
                        for (const [name, handler] of Object.entries(module.commands)) {
                            if (typeof handler !== 'function') {
                                invalidCount++;
                                invalidCommands.push(name);
                                logger.error(`Invalid handler in user_extended.js for command '${name}': ${typeof handler}`);
                            } else {
                                validCount++;
                            }
                        }
                        
                        logger.info(`DEBUG - User_extended summary: Valid: ${validCount}, Invalid: ${invalidCount}`);
                        if (invalidCount > 0) {
                            logger.error(`Invalid commands in user_extended.js: ${invalidCommands.join(', ')}`);
                        }
                    } else {
                        logger.error(`Invalid module format in user_extended.js: ${Object.keys(module || {}).join(', ')}`);
                    }
                } catch (err) {
                    logger.error(`Error inspecting user_extended.js:`, err);
                }
            }
            
            const loadedHandlers = await this.loadCommandsFromDirectory(commandsPath);

            // Print loading statistics
            logger.info('\nCommand loading statistics:');
            for (const [category, stats] of Object.entries(loadedHandlers)) {
                logger.info(`\n${category}:`);
                logger.info(`  Total handlers: ${stats.total}`);
                logger.info(`  Successfully loaded: ${stats.loaded}`);
                logger.info(`  Failed to load: ${stats.failed}`);
            }

            this.initialized = true;
            this.lastReload = Date.now();

            // Use the new breakdown method to get detailed command stats
            const breakdown = this.getCommandsBreakdown();
            
            logger.info(`\n✅ TOTAL COMMANDS AVAILABLE: ${breakdown.total}`);
            logger.info(`✅ Enabled commands: ${breakdown.enabled}`);
            logger.info(`❌ Disabled commands: ${breakdown.disabled}`);
            
            // If there are disabled commands, log details about them
            if (breakdown.disabled > 0) {
                logger.info('\nDisabled commands by category:');
                const disabledByCategory = breakdown.disabledCommands.reduce((acc, cmd) => {
                    acc[cmd.category] = acc[cmd.category] || [];
                    acc[cmd.category].push(cmd.name);
                    return acc;
                }, {});
                
                for (const [category, commands] of Object.entries(disabledByCategory)) {
                    logger.info(`  ${category}: ${commands.length} commands - ${commands.join(', ')}`);
                }
            }
            
            // Log information about each category
            const commandsByCategory = this.getCommandStats().commandsByCategory;
            logger.info('\nEnabled commands by category:');
            for (const [category, count] of Object.entries(commandsByCategory)) {
                logger.info(`  ${category}: ${count}`);
            }

            return breakdown.total > 0;
        } catch (err) {
            logger.error('Critical error in loadCommandHandlers:', err);
            return false;
        }
    }

    async hasPermission(sender, requiredPermissions) {
        if (!requiredPermissions?.length || requiredPermissions.includes('user')) {
            return true;
        }

        if (requiredPermissions.includes('owner')) {
            return sender === globalConfig.owner;
        }

        return false;
    }

    async getCommand(name) {
        try {
            if (this.initialized) {
                const command = this.commands.get(name);
                if (!command || !command.config.enabled) return null;

                if (this.commandCache.has(name)) {
                    setTimeout(() => {
                        try {
                            const cacheInfo = this.commandCache.get(name);
                            if (cacheInfo) {
                                cacheInfo.lastUsed = Date.now();
                                cacheInfo.usageCount++;
                                this.commandCache.set(name, cacheInfo);
                            }
                        } catch (e) {
                            // Silently fail - caching is non-critical
                        }
                    }, 0);
                }

                return command;
            }

            await this.loadCommandHandlers();
            const command = this.commands.get(name);
            if (!command || !command.config.enabled) return null;
            return command;
        } catch (err) {
            logger.error('Error getting command:', err);
            return null;
        }
    }

    getCommandStats() {
        return {
            totalCommands: this.commands.size,
            enabledCommands: Array.from(this.commands.values()).filter(cmd => cmd.config.enabled).length,
            commandsByCategory: Array.from(this.commands.values()).reduce((acc, cmd) => {
                acc[cmd.category] = (acc[cmd.category] || 0) + 1;
                return acc;
            }, {}),
            mostUsedCommands: Array.from(this.commandCache.entries())
                .map(([name, info]) => ({
                    name,
                    usageCount: info.usageCount,
                    lastUsed: info.lastUsed
                }))
                .sort((a, b) => b.usageCount - a.usageCount)
                .slice(0, 10),
            disabledCommands: Array.from(this.commands.values()).filter(cmd => !cmd.config.enabled).length
        };
    }
    async loadCommandConfigs() {
        try {
            const configPath = path.join(process.cwd(), 'src/config/commands');
            if (!fs.existsSync(configPath)) {
                await fsPromises.mkdir(configPath, { recursive: true });
            }

            const files = await fsPromises.readdir(configPath);
            let loadedCount = 0;

            this.commandConfigs.clear();

            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const configContent = await fsPromises.readFile(path.join(configPath, file), 'utf8');
                        const config = JSON.parse(configContent);

                        if (!Array.isArray(config.commands)) {
                            continue;
                        }

                        for (const cmd of config.commands) {
                            const validatedConfig = await this.validateCommandConfig(cmd, cmd.name);
                            this.commandConfigs.set(cmd.name, {
                                ...validatedConfig,
                                category: file.replace('.json', '')
                            });
                            loadedCount++;
                        }
                    } catch (err) {
                        logger.error(`Error reading/parsing config file ${file}:`, err);
                        continue;
                    }
                }
            }
            logger.info(`Successfully loaded ${loadedCount} command configs`);
        } catch (err) {
            logger.error('Critical error loading command configs:', err);
            throw new CommandError('Failed to load command configurations', null, err);
        }
    }

    async validateCommandConfig(config, name) {
        try {
            const requiredFields = ['name', 'description', 'usage'];
            const missingFields = requiredFields.filter(field => !config[field]);

            if (missingFields.length > 0) {
                logger.error(`Invalid command configuration for ${name}: Missing fields: ${missingFields.join(', ')}`);
                throw new CommandError(
                    `Invalid command configuration: Missing fields: ${missingFields.join(', ')}`,
                    name
                );
            }

            // Additional validation for handler field
            if (config.handler && typeof config.handler !== 'string') {
                logger.error(`Invalid handler format for command ${name}: handler must be a string`);
                throw new CommandError('Invalid handler format', name);
            }

            // Validate permissions array
            if (config.permissions && (!Array.isArray(config.permissions) || config.permissions.length === 0)) {
                logger.error(`Invalid permissions format for command ${name}: must be a non-empty array`);
                throw new CommandError('Invalid permissions format', name);
            }

            return {
                ...config,
                cooldown: config.cooldown || 3,
                permissions: config.permissions || ['user'],
                enabled: config.enabled !== false
            };
        } catch (err) {
            logger.error(`Error validating config for command ${name}:`, err);
            logger.error('Config object:', JSON.stringify(config, null, 2));
            throw err;
        }
    }

    getAllCommands(includeDisabled = false) {
        const commands = Array.from(this.commands.values());
        return includeDisabled 
            ? commands.sort((a, b) => a.category.localeCompare(b.category))
            : commands
                .filter(cmd => cmd.config.enabled)
                .sort((a, b) => a.category.localeCompare(b.category));
    }
    
    // Get a count of total commands including disabled ones
    getAllCommandsCount() {
        return this.commands.size;
    }
    
    // Get details about enabled vs disabled commands
    getCommandsBreakdown() {
        const all = Array.from(this.commands.values());
        const enabled = all.filter(cmd => cmd.config.enabled);
        const disabled = all.filter(cmd => !cmd.config.enabled);
        
        return {
            total: all.length,
            enabled: enabled.length,
            disabled: disabled.length,
            disabledCommands: disabled.map(cmd => ({
                name: cmd.config.name,
                category: cmd.category
            }))
        };
    }

    async reloadCommands() {
        logger.info('Reloading all commands...');
        const success = await this.loadCommandHandlers();
        if (success) {
            logger.info('Commands reloaded successfully');
        } else {
            logger.error('Failed to reload commands');
        }
        return success;
    }
}

const commandLoader = new CommandLoader();
module.exports = { commandLoader, CommandError };