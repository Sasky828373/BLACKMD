/**
 * Termux Command Module Compatibility Wrapper
 * This module ensures all command modules work properly in Termux
 * by providing compatibility and resource optimization
 */

const fs = require('fs');
const path = require('path');

// Cache to avoid repeated disk access
const commandModuleCache = new Map();
const commandCache = new Map();

/**
 * Find and load all command modules
 * @returns {Promise<Map<string, Object>>} Map of module names to module objects
 */
async function loadAllCommandModules() {
    try {
        // Try multiple possible paths for command directory since Termux paths may vary
        const possiblePaths = [
            path.join(__dirname, 'commands'),
            path.join(__dirname, '..', 'src', 'commands'),
            path.join(__dirname, '..', 'commands'),
            path.resolve('./src/commands'),
            path.resolve('./commands')
        ];
        
        let commandsDir = null;
        for (const testPath of possiblePaths) {
            if (fs.existsSync(testPath)) {
                commandsDir = testPath;
                console.log(`Found commands directory at: ${commandsDir}`);
                break;
            }
        }
        
        if (!commandsDir) {
            console.log('Commands directory not found in any of the expected locations');
            
            // Last resort: search for commands directory recursively in current directory
            try {
                console.log('Searching for commands directory recursively...');
                let foundPath = null;
                
                function searchRecursively(directory, depth = 0) {
                    if (depth > 3) return; // Limit search depth
                    
                    try {
                        const items = fs.readdirSync(directory);
                        
                        if (items.includes('commands') && 
                            fs.statSync(path.join(directory, 'commands')).isDirectory()) {
                            foundPath = path.join(directory, 'commands');
                            return;
                        }
                        
                        for (const item of items) {
                            const itemPath = path.join(directory, item);
                            if (fs.statSync(itemPath).isDirectory() && 
                                !item.startsWith('.') && 
                                !['node_modules', 'temp', 'logs'].includes(item)) {
                                searchRecursively(itemPath, depth + 1);
                                if (foundPath) return;
                            }
                        }
                    } catch (err) {
                        // Ignore errors during search
                    }
                }
                
                searchRecursively(path.resolve('.'));
                
                if (foundPath) {
                    commandsDir = foundPath;
                    console.log(`Found commands directory by recursive search: ${commandsDir}`);
                }
            } catch (searchErr) {
                console.error('Error during recursive search:', searchErr.message);
            }
            
            if (!commandsDir) {
                return new Map();
            }
        }

        // Check if directory has JS files
        const commandFiles = fs.readdirSync(commandsDir)
            .filter(file => file.endsWith('.js'));
        
        console.log(`Found ${commandFiles.length} command files in ${commandsDir}`);
        let modules = new Map();
        let loadedCount = 0;

        for (const file of commandFiles) {
            try {
                const moduleName = file.replace('.js', '');
                if (commandModuleCache.has(moduleName)) {
                    modules.set(moduleName, commandModuleCache.get(moduleName));
                    loadedCount++;
                    continue;
                }

                const modulePath = path.join(commandsDir, file);
                console.log(`Loading module: ${moduleName} from ${modulePath}`);
                
                // Try to load module with better error handling
                let commandModule;
                try {
                    commandModule = require(modulePath);
                } catch (requireErr) {
                    console.error(`Error requiring module ${moduleName}:`, requireErr.message);
                    continue;
                }
                
                // Check if the module is valid
                if (!commandModule) {
                    console.error(`Module ${moduleName} loaded as empty or undefined`);
                    continue;
                }
                
                // Cache the module for future use
                commandModuleCache.set(moduleName, commandModule);
                modules.set(moduleName, commandModule);
                loadedCount++;
                console.log(`Successfully loaded module: ${moduleName}`);
            } catch (err) {
                console.error(`Error loading ${file}:`, err.message);
            }
        }

        console.log(`Successfully loaded ${loadedCount}/${commandFiles.length} command modules`);
        return modules;
    } catch (err) {
        console.error('Error loading command modules:', err.message);
        return new Map();
    }
}

/**
 * Initialize all command modules
 * @param {Object} sock WhatsApp socket object
 * @returns {Promise<number>} Number of successfully initialized modules
 */
async function initializeAllModules(sock) {
    try {
        const modules = await loadAllCommandModules();
        let initializedCount = 0;

        for (const [name, module] of modules.entries()) {
            try {
                if (typeof module.init === 'function') {
                    await module.init(sock);
                    initializedCount++;
                }
            } catch (err) {
                console.error(`Error initializing module ${name}:`, err.message);
            }
        }

        console.log(`Successfully initialized ${initializedCount}/${modules.size} command modules`);
        return initializedCount;
    } catch (err) {
        console.error('Error initializing modules:', err.message);
        return 0;
    }
}

/**
 * Find a command across all modules
 * @param {string} commandName Command name to find
 * @returns {Promise<{module: string, function: Function}|null>} Command function and module name
 */
async function findCommand(commandName) {
    // Check cache first
    if (commandCache.has(commandName)) {
        return commandCache.get(commandName);
    }

    try {
        const modules = await loadAllCommandModules();

        for (const [moduleName, module] of modules.entries()) {
            // Check if the command exists directly in the module
            if (typeof module[commandName] === 'function') {
                const result = { module: moduleName, function: module[commandName] };
                commandCache.set(commandName, result);
                return result;
            }
            
            // Check if the module uses a commands object structure
            if (module.commands && typeof module.commands[commandName] === 'function') {
                const result = { module: moduleName, function: module.commands[commandName] };
                commandCache.set(commandName, result);
                return result;
            }
        }

        return null;
    } catch (err) {
        console.error('Error finding command:', err.message);
        return null;
    }
}

/**
 * Safely execute a command with error handling
 * @param {string} commandName Command to execute
 * @param {Object} sock WhatsApp socket
 * @param {Object} message Message object
 * @param {Array} args Command arguments
 * @returns {Promise<{success: boolean, error: Error|null}>} Result of command execution
 */
async function executeCommand(commandName, sock, message, args) {
    try {
        const command = await findCommand(commandName);
        
        if (!command) {
            return { 
                success: false, 
                error: new Error(`Command "${commandName}" not found`) 
            };
        }
        
        await command.function(sock, message, args);
        return { success: true, error: null };
    } catch (err) {
        console.error(`Error executing command ${commandName}:`, err.message);
        return { success: false, error: err };
    }
}

/**
 * Get all available commands
 * @returns {Promise<Map<string, Array<string>>>} Map of module names to command arrays
 */
async function getAllCommands() {
    try {
        const modules = await loadAllCommandModules();
        const result = new Map();

        for (const [moduleName, module] of modules.entries()) {
            const commands = [];
            
            // Get direct command functions
            for (const key of Object.keys(module)) {
                if (typeof module[key] === 'function' && key !== 'init') {
                    commands.push(key);
                }
            }
            
            // Check for commands object structure
            if (module.commands) {
                for (const key of Object.keys(module.commands)) {
                    if (typeof module.commands[key] === 'function' && !commands.includes(key)) {
                        commands.push(key);
                    }
                }
            }
            
            result.set(moduleName, commands);
        }
        
        return result;
    } catch (err) {
        console.error('Error getting all commands:', err.message);
        return new Map();
    }
}

/**
 * Process a message to handle commands
 * @param {Object} sock WhatsApp socket
 * @param {Object} message Message object
 * @param {string} prefix Command prefix
 * @returns {Promise<boolean>} Whether a command was executed
 */
async function processMessage(sock, message, prefix = '!') {
    try {
        // Extract message text
        const messageText = message.message?.conversation || 
                            message.message?.extendedTextMessage?.text || 
                            '';
        
        // Check if it's a command
        if (!messageText.startsWith(prefix)) {
            return false;
        }
        
        // Parse command and arguments
        const fullCommand = messageText.slice(prefix.length).trim();
        const [commandName, ...args] = fullCommand.split(' ');
        
        if (!commandName) {
            return false;
        }
        
        // Execute the command
        const result = await executeCommand(commandName, sock, message, args);
        
        // If command not found and we're in a group, it might be a normal message not intended as a command
        if (!result.success && result.error?.message?.includes('not found') && message.key.remoteJid.endsWith('@g.us')) {
            return false;
        }
        
        // If there was an error, send error message
        if (!result.success && result.error) {
            try {
                // Don't send error for "not found" commands to avoid noise
                if (!result.error.message.includes('not found')) {
                    await sock.sendMessage(message.key.remoteJid, { 
                        text: `Error executing command: ${result.error.message}` 
                    });
                }
            } catch (sendErr) {
                console.error('Error sending error message:', sendErr.message);
            }
        }
        
        return result.success;
    } catch (err) {
        console.error('Error processing message:', err.message);
        return false;
    }
}

module.exports = {
    initializeAllModules,
    findCommand,
    executeCommand,
    getAllCommands,
    processMessage
};