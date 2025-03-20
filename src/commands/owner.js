const logger = require('../utils/logger');
const globalConfig = require('../config/globalConfig');
const os = require('os');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { safeSendText, safeSendMessage, safeSendImage } = require('../utils/jidHelper');
const { normalizeUserIdForBanSystem } = require('../utils/userDatabase');

// Save banned users to file for persistence
async function saveBannedUsers() {
    try {
        const bannedUsersFilePath = path.join(process.cwd(), 'data', 'banned_users.json');
        const bannedUsersArray = Array.from(global.bannedUsers || []);
        
        await fs.promises.writeFile(
            bannedUsersFilePath, 
            JSON.stringify(bannedUsersArray, null, 2),
            'utf8'
        );
        
        logger.info(`Saved ${bannedUsersArray.length} banned users to file`);
        return true;
    } catch (err) {
        logger.error('Error saving banned users:', err);
        return false;
    }
}

// Load banned users from file
async function loadBannedUsers() {
    try {
        const bannedUsersFilePath = path.join(process.cwd(), 'data', 'banned_users.json');
        
        // Create empty banned users set if it doesn't exist
        if (!global.bannedUsers) {
            global.bannedUsers = new Set();
        }
        
        // Check if file exists
        if (fs.existsSync(bannedUsersFilePath)) {
            const data = await fs.promises.readFile(bannedUsersFilePath, 'utf8');
            const bannedUsersArray = JSON.parse(data);
            
            // Add each user to the set
            bannedUsersArray.forEach(userId => {
                global.bannedUsers.add(userId);
            });
            
            logger.info(`Loaded ${bannedUsersArray.length} banned users from file`);
        } else {
            logger.info('No banned users file found, creating empty list');
            await saveBannedUsers();
        }
        
        return true;
    } catch (err) {
        logger.error('Error loading banned users:', err);
        // Initialize with empty Set to avoid further errors
        global.bannedUsers = new Set();
        return false;
    }
}

// Helper function to format time
function formatTime(seconds) {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

const ownerCommands = {
    /**
     * Set or change the owner number
     * @param {Object} sock - The WhatsApp socket
     * @param {Object} message - The message object
     * @param {Array<string>} args - Command arguments
     */
    async setowner(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const currentJid = message.key.participant || message.key.remoteJid;
        const currentNumber = currentJid.split('@')[0];
        
        try {
            // Check if command is sent by the current owner or from the same number in .env
            const configOwnerNumber = process.env.OWNER_NUMBER?.replace(/[^0-9]/g, '') || '4915563151347';
            const senderNumber = currentJid.split('@')[0];
            
            if (senderNumber !== configOwnerNumber) {
                await safeSendText(sock, remoteJid, '❌ Only the current owner can change the owner number.');
                return;
            }
            
            if (!args || args.length === 0) {
                await safeSendText(sock, remoteJid, `
*Current Owner Number Settings*

Number: ${configOwnerNumber}

To change the owner number, use:
.setowner your_number

Example:
.setowner 123456789012

Note: Use your number in international format without any + sign, spaces, or dashes.
                `.trim());
                return;
            }
            
            // Get the new owner number from args
            const newOwnerNumber = args[0].replace(/[^0-9]/g, '');
            
            if (!newOwnerNumber || !/^\d+$/.test(newOwnerNumber)) {
                await safeSendText(sock, remoteJid, '❌ Invalid phone number format. Please provide numbers only, without + sign, spaces, or dashes.');
                return;
            }
            
            // Update the .env file
            const envPath = path.join(process.cwd(), '.env');
            if (fs.existsSync(envPath)) {
                try {
                    // Read the current .env file
                    let envContent = fs.readFileSync(envPath, 'utf8');
                    
                    // Check if OWNER_NUMBER exists and update it
                    if (envContent.includes('OWNER_NUMBER=')) {
                        envContent = envContent.replace(
                            /OWNER_NUMBER=.*/,
                            `OWNER_NUMBER=${newOwnerNumber}`
                        );
                    } else {
                        // Add OWNER_NUMBER if it doesn't exist
                        envContent += `\nOWNER_NUMBER=${newOwnerNumber}\n`;
                    }
                    
                    // Write back to .env file
                    fs.writeFileSync(envPath, envContent);
                    
                    // Update the environment variable in current process
                    process.env.OWNER_NUMBER = newOwnerNumber;
                    
                    await safeSendText(sock, remoteJid, `✅ Owner number successfully updated to ${newOwnerNumber}.\n\nChanges will take full effect after bot restart.`);
                    
                    // Log the change
                    logger.info(`Owner number changed from ${configOwnerNumber} to ${newOwnerNumber}`);
                } catch (writeErr) {
                    logger.error('Error updating .env file:', writeErr);
                    await safeSendText(sock, remoteJid, '❌ Failed to update .env file. Check server logs for details.');
                }
            } else {
                // If .env doesn't exist, inform the user to update manually
                logger.warn('.env file not found, cannot update automatically');
                await safeSendText(sock, remoteJid, 
                    '⚠️ Could not find .env file. Please update your owner number manually:\n\n' +
                    '1. Create or edit your .env file\n' +
                    `2. Add or update this line: OWNER_NUMBER=${newOwnerNumber}\n` +
                    '3. Restart the bot'
                );
            }
        } catch (err) {
            logger.error('Error in setowner command:', err);
            await safeSendText(sock, remoteJid, '❌ An error occurred while setting owner number. Please check logs.');
        }
    },
    
    // System Management
    async restart(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        try {
            logger.info('Initiating bot restart...');
            await safeSendText(sock, remoteJid, '🔄 Restarting bot...\nPlease wait a moment.' );

            // Close all active connections
            await sock.logout();
            logger.info('WhatsApp connection closed');

            // Give time for messages to be sent
            setTimeout(() => {
                logger.info('Exiting process for restart');
                process.exit(0);
            }, 2000);
        } catch (err) {
            logger.error('Error during restart:', err);
            await safeSendText(sock, remoteJid, '❌ Error during restart. Please check logs.' );
        }
    },

    async shutdown(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        try {
            logger.info('Initiating bot shutdown...');
            await safeSendText(sock, remoteJid, '🛑 Shutting down bot...\nGoodbye!' );

            // Close all active connections
            await sock.logout();
            logger.info('WhatsApp connection closed');

            // Give time for messages to be sent
            setTimeout(() => {
                logger.info('Exiting process for shutdown');
                process.exit(0);
            }, 2000);
        } catch (err) {
            logger.error('Error during shutdown:', err);
            await safeSendText(sock, remoteJid, '❌ Error during shutdown. Please check logs.' );
        }
    },

    async maintenance(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        try {
            const mode = args[0]?.toLowerCase() === 'on';
            logger.info(`Setting maintenance mode to: ${mode}`);

            // Set maintenance mode in global config
            global.maintenanceMode = mode;

            await safeSendMessage(sock, remoteJid, { 
                text: `🛠️ Maintenance mode ${mode ? 'enabled' : 'disabled'}\n${mode ? 'Only owner commands will work.' : 'Normal operations resumed.'}` 
            });

            // Broadcast maintenance status to all active chats
            if (mode) {
                // TODO: Implement broadcast to active chats
                logger.info('Broadcasting maintenance mode status');
            }
        } catch (err) {
            logger.error('Error setting maintenance mode:', err);
            await safeSendText(sock, remoteJid, '❌ Error setting maintenance mode. Please check logs.' );
        }
    },
    
    // Bot Configuration
    async setname(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const name = args.join(' ');
        if (!name) {
            await safeSendText(sock, remoteJid, '⚠️ Please provide a name' );
            return;
        }
        
        try {
            // Set WhatsApp display name
            await sock.updateProfileName(name);
            logger.info(`Bot name changed to: ${name}`);
            await safeSendMessage(sock, remoteJid, { text: `✅ Bot name changed to: ${name}` });
        } catch (err) {
            logger.error('Error changing bot name:', err);
            await safeSendText(sock, remoteJid, '❌ Error changing bot name. Please try again.' );
        }
    },

    async setbio(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const bio = args.join(' ');
        if (!bio) {
            await safeSendText(sock, remoteJid, '⚠️ Please provide a bio' );
            return;
        }
        
        try {
            // Set WhatsApp status/bio
            await sock.updateProfileStatus(bio);
            logger.info(`Bot bio updated to: ${bio}`);
            await safeSendMessage(sock, remoteJid, { text: `✅ Bot bio updated to: ${bio}` });
        } catch (err) {
            logger.error('Error updating bot bio:', err);
            await safeSendText(sock, remoteJid, '❌ Error updating bot bio. Please try again.' );
        }
    },
    
    async setprefix(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const prefix = args[0];
        if (!prefix) {
            await safeSendText(sock, remoteJid, '⚠️ Please provide a prefix' );
            return;
        }

        try {
            // Update prefix using the global config
            globalConfig.prefix = prefix;
            logger.info(`Bot prefix changed to: ${prefix}`);
            await safeSendMessage(sock, remoteJid, { text: `✅ Prefix updated to: ${prefix}` });
        } catch (err) {
            logger.error('Error setting prefix:', err);
            await safeSendText(sock, remoteJid, '❌ Error updating prefix. Please try again.' );
        }
    },

    async setlanguage(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const lang = args[0]?.toLowerCase();

        try {
            if (!lang) {
                await safeSendText(sock, remoteJid, '⚠️ Please specify language code (e.g., en, de)' );
                return;
            }

            // Get reference to language manager
            const { languageManager } = require('../utils/language');
            const config = require('../config/config');

            // Check if language is supported
            if (!languageManager.isLanguageSupported(lang)) {
                const availableLangs = languageManager.getAvailableLanguages().join(', ');
                await safeSendMessage(sock, remoteJid, { 
                    text: `❌ Language '${lang}' is not supported.\nAvailable languages: ${availableLangs}` 
                });
                return;
            }

            // Update language in config
            config.bot.language = lang;

            // Use the appropriate translation to respond
            const response = languageManager.getText('system.language_changed', lang);
            await safeSendMessage(sock, remoteJid, { text: `✅ ${response}` });
            logger.info(`Bot language changed to: ${lang}`);
        } catch (err) {
            logger.error('Error setting language:', err);
            await safeSendText(sock, remoteJid, '❌ Error setting language. Please check logs.' );
        }
    },

    // Security Management
    async ban(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        try {
            // Check if user is mentioned in the message
            let targetJid = '';
            let targetNumber = '';
            
            // Handle mention
            if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
                // Use our normalization function for consistency
                targetNumber = normalizeUserIdForBanSystem(targetJid);
            } 
            // Handle provided as argument
            else if (args[0]) {
                // Use our normalization function for consistency
                targetNumber = normalizeUserIdForBanSystem(args[0]);
                targetJid = `${targetNumber}@s.whatsapp.net`;
            } else {
                await safeSendText(sock, remoteJid, '⚠️ Please mention a user or specify a number to ban');
                return;
            }

            // Add to banned users list
            if (!global.bannedUsers) global.bannedUsers = new Set();
            global.bannedUsers.add(targetNumber);
            
            // Save banned users to file for persistence
            await saveBannedUsers();

            // Create WhatsApp-style mention format
            const mentionText = `@${targetNumber}`;
            
            logger.info(`Banned user: ${targetNumber} (normalized from input)`);
            
            // Send with proper mention format
            await safeSendMessage(sock, remoteJid, { 
                text: `🚫 ${mentionText} has been banned`, 
                mentions: [targetJid],
                // Include WhatsApp's required mention formatting
                extendedTextMessage: {
                    text: `🚫 ${mentionText} has been banned`,
                    contextInfo: {
                        mentionedJid: [targetJid]
                    }
                }
            });
        } catch (err) {
            logger.error('Error banning user:', err);
            await safeSendText(sock, remoteJid, '❌ Error banning user. Please check logs.');
        }
    },
    
    async unban(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        try {
            // Check if user is mentioned in the message
            let targetJid = '';
            let targetNumber = '';
            
            // Handle mention
            if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
                // Use our normalization function for consistency
                targetNumber = normalizeUserIdForBanSystem(targetJid);
            } 
            // Handle provided as argument
            else if (args[0]) {
                // Use our normalization function for consistency
                targetNumber = normalizeUserIdForBanSystem(args[0]);
                targetJid = `${targetNumber}@s.whatsapp.net`;
            } else {
                await safeSendText(sock, remoteJid, '⚠️ Please mention a user or specify a number to unban');
                return;
            }

            // Remove from banned users list
            if (global.bannedUsers) {
                // Also try to remove any alternative formats of the same JID
                global.bannedUsers.delete(targetNumber);
                
                // Save updated banned users list to file
                await saveBannedUsers();
            }

            // Create WhatsApp-style mention format
            const mentionText = `@${targetNumber}`;
            
            logger.info(`Unbanned user: ${targetNumber} (normalized from input)`);
            
            // Send with proper mention format
            await safeSendMessage(sock, remoteJid, { 
                text: `✅ ${mentionText} has been unbanned`, 
                mentions: [targetJid],
                // Include WhatsApp's required mention formatting
                extendedTextMessage: {
                    text: `✅ ${mentionText} has been unbanned`,
                    contextInfo: {
                        mentionedJid: [targetJid]
                    }
                }
            });
        } catch (err) {
            logger.error('Error unbanning user:', err);
            await safeSendText(sock, remoteJid, '❌ Error unbanning user. Please check logs.');
        }
    },



    async banlist(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        try {
            if (!global.bannedUsers || global.bannedUsers.size === 0) {
                await safeSendText(sock, remoteJid, '📋 No banned users');
                return;
            }

            // Create formatted message with mentions
            const bannedNumbers = Array.from(global.bannedUsers);
            const bannedJids = bannedNumbers.map(num => `${num}@s.whatsapp.net`);
            
            let formattedText = `*📋 Banned Users*\n\n`;
            
            // Add each banned user with proper WhatsApp mention format
            bannedNumbers.forEach((number, index) => {
                formattedText += `${index + 1}. @${number}\n`;
            });
            
            // Send the formatted message with mentions
            await safeSendMessage(sock, remoteJid, { 
                text: formattedText,
                mentions: bannedJids,
                // Include WhatsApp's required mention formatting
                extendedTextMessage: {
                    text: formattedText,
                    contextInfo: {
                        mentionedJid: bannedJids
                    }
                }
            });
            
            logger.info(`Displayed banned list with ${bannedJids.length} users`);
        } catch (err) {
            logger.error('Error getting banned list:', err);
            await safeSendText(sock, remoteJid, '❌ Error getting banned list. Please check logs.');
        }
    },

    // Broadcast System
    async broadcast(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        try {
            const messageText = args.join(' ');
            if (!messageText) {
                await safeSendText(sock, remoteJid, '⚠️ Please provide a message to broadcast' );
                return;
            }

            logger.info('Starting broadcast to all chats');
            await safeSendText(sock, remoteJid, '📢 Starting broadcast...' );

            // Get all chats
            const chats = await sock.groupFetchAllParticipating();
            let successCount = 0;
            let failCount = 0;

            for (const [chatId, chat] of Object.entries(chats)) {
                try {
                    await safeSendMessage(sock, chatId, { text: `📢 *Broadcast Message*\n\n${messageText}` });
                    successCount++;
                } catch (err) {
                    logger.error(`Failed to broadcast to ${chatId}:`, err);
                    failCount++;
                }
            }

            await safeSendMessage(sock, remoteJid, { 
                text: `📢 Broadcast completed\n✅ Success: ${successCount}\n❌ Failed: ${failCount}` 
            });
        } catch (err) {
            logger.error('Error during broadcast:', err);
            await safeSendText(sock, remoteJid, '❌ Error during broadcast. Please check logs.' );
        }
    },

    // Server Information
    async serverinfo(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        try {
            // Get server information
            const { platform, uptime, cpus, totalmem, freemem } = os;
            const upTime = formatTime(uptime());
            const cpuModel = cpus()[0].model;
            const cpuCount = cpus().length;
            const memUsed = ((totalmem() - freemem()) / 1024 / 1024 / 1024).toFixed(2);
            const memTotal = (totalmem() / 1024 / 1024 / 1024).toFixed(2);
            const memPercent = ((totalmem() - freemem()) / totalmem() * 100).toFixed(2);
            const nodeVersion = process.version;
            
            const info = `*📊 Server Information*\n\n` +
                         `*OS:* ${platform()}\n` +
                         `*Uptime:* ${upTime}\n` +
                         `*CPU:* ${cpuModel}\n` +
                         `*CPU Cores:* ${cpuCount}\n` +
                         `*Memory:* ${memUsed}GB / ${memTotal}GB (${memPercent}%)\n` +
                         `*Node.js:* ${nodeVersion}`;
            
            await safeSendText(sock, remoteJid, info );
        } catch (err) {
            logger.error('Error getting server info:', err);
            await safeSendText(sock, remoteJid, '❌ Error getting server information.' );
        }
    },

    // Helper function for initialization
    async init() {
        logger.info('Initializing owner command handler...');
        
        // Load banned users from file during initialization
        await loadBannedUsers();
        
        return true;
    }
};

module.exports = {
    ...ownerCommands,
    init: ownerCommands.init,
    category: 'owner'
};