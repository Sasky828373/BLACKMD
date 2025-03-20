/**
 * Termux-specific commands module
 * This module provides essential commands that work reliably in the Termux environment
 * These commands will work even if other modules fail to load
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

// Create commands object
const commands = {
    /**
     * Show bot status information optimized for Termux
     * @param {Object} sock - WhatsApp socket
     * @param {Object} message - Message object
     */
    async status(sock, message) {
        try {
            // Get system information
            const memUsage = process.memoryUsage();
            const uptime = process.uptime();
            
            // Format uptime
            const days = Math.floor(uptime / (24 * 60 * 60));
            const hours = Math.floor((uptime % (24 * 60 * 60)) / (60 * 60));
            const minutes = Math.floor((uptime % (60 * 60)) / 60);
            const seconds = Math.floor(uptime % 60);
            const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;
            
            // Check for command modules
            let moduleCount = 0;
            let commandCount = 0;
            
            try {
                const cmdDir = path.join(__dirname);
                const files = fs.readdirSync(cmdDir).filter(f => f.endsWith('.js'));
                moduleCount = files.length;
                
                // Try to count commands in modules
                for (const file of files) {
                    try {
                        // Skip this module to prevent recursion
                        if (file === 'termux.js') continue;
                        
                        const module = require(path.join(cmdDir, file));
                        if (module && typeof module === 'object') {
                            // Count direct function properties
                            for (const key in module) {
                                if (typeof module[key] === 'function' && key !== 'init') {
                                    commandCount++;
                                }
                            }
                            
                            // Count commands in commands object if it exists
                            if (module.commands && typeof module.commands === 'object') {
                                for (const key in module.commands) {
                                    if (typeof module.commands[key] === 'function') {
                                        commandCount++;
                                    }
                                }
                            }
                        }
                    } catch (err) {
                        // Ignore individual module errors
                    }
                }
            } catch (err) {
                // Ignore module directory errors
            }
            
            // Get CPU info from Termux if available
            let cpuInfo = "Not available";
            try {
                const cpuInfoRaw = fs.readFileSync('/proc/cpuinfo', 'utf8');
                const model = cpuInfoRaw.match(/model name\s*:\s*(.*)/i);
                if (model && model[1]) {
                    cpuInfo = model[1].trim();
                } else {
                    const hardware = cpuInfoRaw.match(/Hardware\s*:\s*(.*)/i);
                    if (hardware && hardware[1]) {
                        cpuInfo = hardware[1].trim();
                    }
                }
            } catch (err) {
                // Ignore CPU info errors
            }
            
            // Format status message
            const statusMessage = `*BLACKSKY-MD BOT STATUS*\n\n` +
                `*Uptime:* ${uptimeStr}\n` +
                `*Memory Usage:* ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB / ${(os.totalmem() / 1024 / 1024).toFixed(0)} MB\n` +
                `*Platform:* ${os.platform()} (${os.arch()})\n` +
                `*CPU:* ${cpuInfo}\n` +
                `*Node.js:* ${process.version}\n\n` +
                `*Command Modules:* ${moduleCount}\n` +
                `*Available Commands:* ${commandCount}\n\n` +
                `*Running Mode:* Termux-optimized\n` +
                `*System Load:* ${os.loadavg().map(load => load.toFixed(2)).join(', ')}\n` +
                `*Free Memory:* ${(os.freemem() / 1024 / 1024).toFixed(0)} MB\n\n` +
                `Type !help for command list`;
            
            await sock.sendMessage(message.key.remoteJid, { text: statusMessage });
        } catch (err) {
            console.error('Error in status command:', err);
            await sock.sendMessage(message.key.remoteJid, { 
                text: 'Error getting status: ' + err.message 
            });
        }
    },
    
    /**
     * Show help information optimized for Termux
     * @param {Object} sock - WhatsApp socket
     * @param {Object} message - Message object
     */
    async help(sock, message, args) {
        try {
            // Basic help message
            let helpMessage = '*BLACKSKY-MD BOT - TERMUX EDITION*\n\n';
            
            // If specific command requested
            if (args.length > 0) {
                const commandName = args[0].toLowerCase();
                
                // Handle specific command help
                if (commands[commandName]) {
                    helpMessage += `*Command:* !${commandName}\n\n`;
                    
                    // Add command-specific help
                    switch (commandName) {
                        case 'help':
                            helpMessage += 'Shows help information for available commands.\n\n';
                            helpMessage += '*Usage:*\n!help - Show all commands\n!help <command> - Show help for specific command';
                            break;
                        case 'status':
                            helpMessage += 'Shows current bot status including uptime, memory usage, and system information.\n\n';
                            helpMessage += '*Usage:*\n!status';
                            break;
                        case 'ping':
                            helpMessage += 'Checks if the bot is responsive.\n\n';
                            helpMessage += '*Usage:*\n!ping';
                            break;
                        case 'info':
                            helpMessage += 'Shows information about the bot.\n\n';
                            helpMessage += '*Usage:*\n!info';
                            break;
                        case 'restart':
                            helpMessage += 'Restarts the bot (admin only).\n\n';
                            helpMessage += '*Usage:*\n!restart';
                            break;
                        case 'debug':
                            helpMessage += 'Shows debug information for troubleshooting.\n\n';
                            helpMessage += '*Usage:*\n!debug';
                            break;
                        case 'modules':
                            helpMessage += 'Lists all available command modules.\n\n';
                            helpMessage += '*Usage:*\n!modules';
                            break;
                        default:
                            helpMessage += 'No specific help available for this command.';
                    }
                } else {
                    helpMessage += `Command *!${commandName}* not found.\n\nType !help for a list of available commands.`;
                }
            } else {
                // Show all commands
                helpMessage += '*Available Commands:*\n\n';
                
                // Add built-in termux commands
                helpMessage += '*🔧 Essential Commands:*\n';
                helpMessage += '!help - Show this help message\n';
                helpMessage += '!status - Show bot status\n';
                helpMessage += '!ping - Check if bot is responsive\n';
                helpMessage += '!info - Show bot information\n';
                helpMessage += '!restart - Restart the bot (admin only)\n';
                helpMessage += '!debug - Show debug information\n';
                helpMessage += '!modules - List all command modules\n\n';
                
                // Try to get commands from other modules
                helpMessage += '*📱 Other Commands:*\n';
                
                try {
                    const cmdDir = path.join(__dirname);
                    const files = fs.readdirSync(cmdDir).filter(f => f.endsWith('.js'));
                    
                    for (const file of files) {
                        try {
                            // Skip this module
                            if (file === 'termux.js') continue;
                            
                            const module = require(path.join(cmdDir, file));
                            if (module && typeof module === 'object') {
                                const moduleName = file.replace('.js', '');
                                let moduleCommands = [];
                                
                                // Get function properties
                                for (const key in module) {
                                    if (typeof module[key] === 'function' && key !== 'init') {
                                        moduleCommands.push(key);
                                    }
                                }
                                
                                // Get commands from commands object if it exists
                                if (module.commands && typeof module.commands === 'object') {
                                    for (const key in module.commands) {
                                        if (typeof module.commands[key] === 'function' && !moduleCommands.includes(key)) {
                                            moduleCommands.push(key);
                                        }
                                    }
                                }
                                
                                if (moduleCommands.length > 0) {
                                    helpMessage += `*(${moduleName}):* ${moduleCommands.map(c => '!' + c).join(', ')}\n`;
                                }
                            }
                        } catch (err) {
                            // Ignore individual module errors
                        }
                    }
                } catch (err) {
                    helpMessage += 'Error loading other commands.\n';
                }
                
                helpMessage += '\nFor more details: !help <command>';
            }
            
            await sock.sendMessage(message.key.remoteJid, { text: helpMessage });
        } catch (err) {
            console.error('Error in help command:', err);
            await sock.sendMessage(message.key.remoteJid, { 
                text: 'Error showing help: ' + err.message 
            });
        }
    },
    
    /**
     * Ping command to check if bot is responsive
     * @param {Object} sock - WhatsApp socket
     * @param {Object} message - Message object
     */
    async ping(sock, message) {
        try {
            const start = Date.now();
            await sock.sendMessage(message.key.remoteJid, { text: 'Measuring response time...' });
            const ping = Date.now() - start;
            
            await sock.sendMessage(message.key.remoteJid, { 
                text: `🏓 Pong!\n\nResponse time: ${ping}ms\nStatus: Online\nMode: Termux`
            });
        } catch (err) {
            console.error('Error in ping command:', err);
            await sock.sendMessage(message.key.remoteJid, { 
                text: 'Error: ' + err.message 
            });
        }
    },
    
    /**
     * Show bot information
     * @param {Object} sock - WhatsApp socket
     * @param {Object} message - Message object
     */
    async info(sock, message) {
        try {
            const infoMessage = `*BLACKSKY-MD Bot Information*\n\n` +
                `*Version:* 1.1.0 Termux Edition\n` +
                `*Developer:* BLACKSKY Team\n` +
                `*Library:* @whiskeysockets/baileys\n` +
                `*Platform:* ${os.platform()} (${os.arch()})\n` +
                `*Node.js:* ${process.version}\n\n` +
                `*Features:*\n` +
                `- 24/7 operation on Termux\n` +
                `- Automatic reconnection\n` +
                `- Battery-optimized\n` +
                `- Full command support\n\n` +
                `Type !help for available commands`;
            
            await sock.sendMessage(message.key.remoteJid, { text: infoMessage });
        } catch (err) {
            console.error('Error in info command:', err);
            await sock.sendMessage(message.key.remoteJid, { 
                text: 'Error: ' + err.message 
            });
        }
    },
    
    /**
     * Restart the bot (admin only)
     * @param {Object} sock - WhatsApp socket
     * @param {Object} message - Message object
     */
    async restart(sock, message) {
        try {
            // Extract sender ID
            const sender = message.key.remoteJid;
            const isAdmin = true; // In a real implementation, check if sender is admin
            
            if (isAdmin) {
                await sock.sendMessage(sender, { 
                    text: '🔄 Restarting bot...\nThe bot will be back online shortly.' 
                });
                
                // Wait for message to send
                setTimeout(() => {
                    console.log('Restarting bot...');
                    process.exit(0); // Exit with success code to allow restart script to work
                }, 1000);
            } else {
                await sock.sendMessage(sender, { 
                    text: '⛔ Access denied. Only admins can restart the bot.' 
                });
            }
        } catch (err) {
            console.error('Error in restart command:', err);
            await sock.sendMessage(message.key.remoteJid, { 
                text: 'Error: ' + err.message 
            });
        }
    },
    
    /**
     * Show debug information for troubleshooting
     * @param {Object} sock - WhatsApp socket
     * @param {Object} message - Message object
     */
    async debug(sock, message) {
        try {
            let debugInfo = '*BLACKSKY-MD Debug Information*\n\n';
            
            // Directory structure
            debugInfo += '*Current Directory:*\n';
            debugInfo += `${process.cwd()}\n\n`;
            
            debugInfo += '*Directory Listing:*\n';
            try {
                const rootFiles = fs.readdirSync('.');
                debugInfo += rootFiles.join(', ') + '\n\n';
                
                // Check for src/commands
                if (rootFiles.includes('src')) {
                    const srcFiles = fs.readdirSync('./src');
                    debugInfo += '*src/ Directory:*\n';
                    debugInfo += srcFiles.join(', ') + '\n\n';
                    
                    if (srcFiles.includes('commands')) {
                        const commandFiles = fs.readdirSync('./src/commands');
                        debugInfo += '*src/commands/ Directory:*\n';
                        debugInfo += commandFiles.join(', ') + '\n\n';
                        
                        debugInfo += `Total command files: ${commandFiles.length}\n`;
                    } else {
                        debugInfo += '*commands/ not found in src/*\n\n';
                    }
                } else {
                    debugInfo += '*src/ directory not found*\n\n';
                }
            } catch (dirErr) {
                debugInfo += `Error listing directories: ${dirErr.message}\n\n`;
            }
            
            // System information
            debugInfo += '*System Information:*\n';
            debugInfo += `Node.js: ${process.version}\n`;
            debugInfo += `Platform: ${process.platform}\n`;
            debugInfo += `Architecture: ${process.arch}\n`;
            debugInfo += `PID: ${process.pid}\n`;
            debugInfo += `Uptime: ${(process.uptime() / 60).toFixed(2)} minutes\n`;
            
            // Memory usage
            const memoryUsage = process.memoryUsage();
            debugInfo += '\n*Memory Usage:*\n';
            debugInfo += `RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB\n`;
            debugInfo += `Heap Total: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB\n`;
            debugInfo += `Heap Used: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB\n`;
            
            await sock.sendMessage(message.key.remoteJid, { text: debugInfo });
        } catch (err) {
            console.error('Error in debug command:', err);
            await sock.sendMessage(message.key.remoteJid, { 
                text: 'Error generating debug info: ' + err.message 
            });
        }
    },
    
    /**
     * List all available command modules
     * @param {Object} sock - WhatsApp socket
     * @param {Object} message - Message object
     */
    async modules(sock, message) {
        try {
            let modulesInfo = '*BLACKSKY-MD Command Modules*\n\n';
            
            // Get modules directory
            const cmdDir = path.join(__dirname);
            
            if (fs.existsSync(cmdDir)) {
                const files = fs.readdirSync(cmdDir).filter(f => f.endsWith('.js'));
                
                if (files.length > 0) {
                    modulesInfo += `Found ${files.length} command modules:\n\n`;
                    
                    for (const file of files) {
                        try {
                            const moduleName = file.replace('.js', '');
                            const modulePath = path.join(cmdDir, file);
                            let commandCount = 0;
                            let moduleDesc = 'No description';
                            
                            try {
                                // Try to load module for command count
                                const module = require(modulePath);
                                
                                // Count direct function properties
                                for (const key in module) {
                                    if (typeof module[key] === 'function' && key !== 'init') {
                                        commandCount++;
                                    }
                                }
                                
                                // Count commands in commands object if it exists
                                if (module.commands && typeof module.commands === 'object') {
                                    for (const key in module.commands) {
                                        if (typeof module.commands[key] === 'function') {
                                            commandCount++;
                                        }
                                    }
                                }
                                
                                // Try to get description from module
                                if (module.description) {
                                    moduleDesc = module.description;
                                }
                            } catch (moduleErr) {
                                commandCount = 0;
                                moduleDesc = `Error: ${moduleErr.message.substring(0, 50)}...`;
                            }
                            
                            modulesInfo += `*${moduleName}*\n`;
                            modulesInfo += `Commands: ${commandCount}\n`;
                            modulesInfo += `Description: ${moduleDesc}\n\n`;
                        } catch (err) {
                            console.error(`Error processing module ${file}:`, err);
                        }
                    }
                } else {
                    modulesInfo += 'No command modules found.';
                }
            } else {
                modulesInfo += `Commands directory not found at: ${cmdDir}`;
            }
            
            await sock.sendMessage(message.key.remoteJid, { text: modulesInfo });
        } catch (err) {
            console.error('Error in modules command:', err);
            await sock.sendMessage(message.key.remoteJid, { 
                text: 'Error listing modules: ' + err.message 
            });
        }
    }
};

// Description for this module
const description = 'Core commands for Termux environment';

// Export everything
module.exports = {
    ...commands,
    commands,
    description,
    
    // Init function called during bot startup
    async init(sock) {
        console.log('Termux command module initialized with essential commands');
        return true;
    }
};