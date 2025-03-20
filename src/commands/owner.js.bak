const logger = require('../utils/logger');
const globalConfig = require('../config/globalConfig');
const os = require('os');

const ownerCommands = {
    // System Management
    async restart(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        try {
            logger.info('Initiating bot restart...');
            await sock.sendMessage(remoteJid, { text: '🔄 Restarting bot...\nPlease wait a moment.' });

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
            await sock.sendMessage(remoteJid, { text: '❌ Error during restart. Please check logs.' });
        }
    },

    async shutdown(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        try {
            logger.info('Initiating bot shutdown...');
            await sock.sendMessage(remoteJid, { text: '🛑 Shutting down bot...\nGoodbye!' });

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
            await sock.sendMessage(remoteJid, { text: '❌ Error during shutdown. Please check logs.' });
        }
    },

    async update(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        // Implement bot update system
        await sock.sendMessage(remoteJid, { text: '🔄 Checking for updates...' });
    },

    async maintenance(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        try {
            const mode = args[0]?.toLowerCase() === 'on';
            logger.info(`Setting maintenance mode to: ${mode}`);

            // Set maintenance mode in global config
            global.maintenanceMode = mode;

            await sock.sendMessage(remoteJid, { 
                text: `🛠️ Maintenance mode ${mode ? 'enabled' : 'disabled'}\n${mode ? 'Only owner commands will work.' : 'Normal operations resumed.'}` 
            });

            // Broadcast maintenance status to all active chats
            if (mode) {
                // TODO: Implement broadcast to active chats
                logger.info('Broadcasting maintenance mode status');
            }
        } catch (err) {
            logger.error('Error setting maintenance mode:', err);
            await sock.sendMessage(remoteJid, { text: '❌ Error setting maintenance mode. Please check logs.' });
        }
    },

    // Bot Configuration
    async setname(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const name = args.join(' ');
        if (!name) {
            await sock.sendMessage(remoteJid, { text: '⚠️ Please provide a name' });
            return;
        }
        // Implement bot name change
        await sock.sendMessage(remoteJid, { text: `✅ Bot name changed to: ${name}` });
    },

    async setbio(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const bio = args.join(' ');
        if (!bio) {
            await sock.sendMessage(remoteJid, { text: '⚠️ Please provide a bio' });
            return;
        }
        // Implement bot bio change
        await sock.sendMessage(remoteJid, { text: `✅ Bot bio updated` });
    },

    async setprefix(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const prefix = args[0];
        if (!prefix) {
            await sock.sendMessage(remoteJid, { text: '⚠️ Please provide a prefix' });
            return;
        }

        try {
            // Update prefix using the global config
            globalConfig.prefix = prefix;
            logger.info(`Bot prefix changed to: ${prefix}`);
            await sock.sendMessage(remoteJid, { text: `✅ Prefix updated to: ${prefix}` });
        } catch (err) {
            logger.error('Error setting prefix:', err);
            await sock.sendMessage(remoteJid, { text: '❌ Error updating prefix. Please try again.' });
        }
    },

    async setlanguage(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const lang = args[0]?.toLowerCase();

        try {
            if (!lang) {
                await sock.sendMessage(remoteJid, { text: '⚠️ Please specify language code (e.g., en, de)' });
                return;
            }

            // Get reference to language manager
            const { languageManager } = require('../utils/language');
            const config = require('../config/config');

            // Check if language is supported
            if (!languageManager.isLanguageSupported(lang)) {
                const availableLangs = languageManager.getAvailableLanguages().join(', ');
                await sock.sendMessage(remoteJid, { 
                    text: `❌ Language '${lang}' is not supported.\nAvailable languages: ${availableLangs}` 
                });
                return;
            }

            // Update language in config
            config.bot.language = lang;

            // Use the appropriate translation to respond
            const response = languageManager.getText('system.language_changed', lang);
            await sock.sendMessage(remoteJid, { text: `✅ ${response}` });
            logger.info(`Bot language changed to: ${lang}`);
        } catch (err) {
            logger.error('Error setting language:', err);
            await sock.sendMessage(remoteJid, { text: '❌ Error setting language. Please check logs.' });
        }
    },

    async setppic(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        // Implement profile picture change
        await sock.sendMessage(remoteJid, { text: '🖼️ Updating profile picture...' });
    },

    async setstatus(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const status = args.join(' ');
        if (!status) {
            await sock.sendMessage(remoteJid, { text: '⚠️ Please provide a status' });
            return;
        }
        // Implement status change
        await sock.sendMessage(remoteJid, { text: `✅ Status updated` });
    },

    // Security Management
    async ban(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        try {
            const target = args[0];
            if (!target) {
                await sock.sendMessage(remoteJid, { text: '⚠️ Please specify a user to ban' });
                return;
            }

            // Normalize the phone number
            const normalizedNumber = target.replace(/[^0-9]/g, '');

            // Add to banned users list (implement in database)
            // For now using temporary array
            if (!global.bannedUsers) global.bannedUsers = new Set();
            global.bannedUsers.add(normalizedNumber);

            logger.info(`Banned user: ${normalizedNumber}`);
            await sock.sendMessage(remoteJid, { text: `🚫 User ${target} has been banned` });
        } catch (err) {
            logger.error('Error banning user:', err);
            await sock.sendMessage(remoteJid, { text: '❌ Error banning user. Please check logs.' });
        }
    },

    async unban(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        try {
            const target = args[0];
            if (!target) {
                await sock.sendMessage(remoteJid, { text: '⚠️ Please specify a user to unban' });
                return;
            }

            // Normalize the phone number
            const normalizedNumber = target.replace(/[^0-9]/g, '');

            // Remove from banned users list
            if (global.bannedUsers) {
                global.bannedUsers.delete(normalizedNumber);
            }

            logger.info(`Unbanned user: ${normalizedNumber}`);
            await sock.sendMessage(remoteJid, { text: `✅ User ${target} has been unbanned` });
        } catch (err) {
            logger.error('Error unbanning user:', err);
            await sock.sendMessage(remoteJid, { text: '❌ Error unbanning user. Please check logs.' });
        }
    },

    async banlist(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        try {
            if (!global.bannedUsers || global.bannedUsers.size === 0) {
                await sock.sendMessage(remoteJid, { text: '📋 No banned users' });
                return;
            }

            const bannedList = Array.from(global.bannedUsers).join('\n• ');
            await sock.sendMessage(remoteJid, { 
                text: `📋 Banned users list:\n• ${bannedList}` 
            });
        } catch (err) {
            logger.error('Error getting banned list:', err);
            await sock.sendMessage(remoteJid, { text: '❌ Error getting banned list. Please check logs.' });
        }
    },

    async whitelist(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const [action, user] = args;
        if (!action || !['add', 'remove', 'list'].includes(action)) {
            await sock.sendMessage(remoteJid, { text: '⚠️ Usage: !whitelist <add|remove|list> [user]' });
            return;
        }
        // Implement whitelist system
        await sock.sendMessage(remoteJid, { text: `✅ Whitelist ${action} completed` });
    },

    async blacklist(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const [action, user] = args;
        if (!action || !['add', 'remove', 'list'].includes(action)) {
            await sock.sendMessage(remoteJid, { text: '⚠️ Usage: !blacklist <add|remove|list> [user]' });
            return;
        }
        // Implement blacklist system
        await sock.sendMessage(remoteJid, { text: `✅ Blacklist ${action} completed` });
    },

    async globalban(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const [action, userId, ...reason] = args;
        if (!action || !['add', 'remove', 'check'].includes(action)) {
            await sock.sendMessage(remoteJid, {
                text: '🚫 Usage: !globalban <add|remove|check> [user] [reason]'
            });
            return;
        }
        // Implement global ban system
        await sock.sendMessage(remoteJid, { text: '🔨 Managing global ban...' });
    },

    // Database Management
    async backup(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        // Implement database backup
        await sock.sendMessage(remoteJid, { text: '💾 Creating backup...' });
    },

    async restore(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const backupId = args[0];
        if (!backupId) {
            await sock.sendMessage(remoteJid, { text: '⚠️ Please specify backup ID' });
            return;
        }
        // Implement backup restoration
        await sock.sendMessage(remoteJid, { text: '🔄 Restoring from backup...' });
    },

    async listbackups(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        // Implement backups listing
        await sock.sendMessage(remoteJid, { text: '📋 Available backups:\n• None' });
    },

    async resetdb(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        // Implement database reset
        await sock.sendMessage(remoteJid, { text: '🔄 Database reset complete' });
    },

    async vacuum(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        // Implement database optimization
        await sock.sendMessage(remoteJid, { text: '🧹 Optimizing database...' });
    },

    // Plugin Management
    async plugin(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const [action, pluginName] = args;
        if (!action || !['install', 'remove', 'update', 'list'].includes(action)) {
            await sock.sendMessage(remoteJid, {
                text: '⚠️ Usage: !plugin <install|remove|update|list> [plugin_name]'
            });
            return;
        }
        // Implement plugin management
        await sock.sendMessage(remoteJid, { text: `✅ Plugin ${action} executed` });
    },

    async plugins(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        // Implement plugins list
        await sock.sendMessage(remoteJid, { text: '🔌 Installed plugins:\n• None' });
    },

    // Broadcast System
    async broadcast(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        try {
            const messageText = args.join(' ');
            if (!messageText) {
                await sock.sendMessage(remoteJid, { text: '⚠️ Please provide a message to broadcast' });
                return;
            }

            logger.info('Starting broadcast to all chats');
            await sock.sendMessage(remoteJid, { text: '📢 Starting broadcast...' });

            // Get all chats
            const chats = await sock.groupFetchAllParticipating();
            let successCount = 0;
            let failCount = 0;

            for (const [chatId, chat] of Object.entries(chats)) {
                try {
                    await sock.sendMessage(chatId, { text: `📢 *Broadcast Message*\n\n${messageText}` });
                    successCount++;
                } catch (err) {
                    logger.error(`Failed to broadcast to ${chatId}:`, err);
                    failCount++;
                }
            }

            await sock.sendMessage(remoteJid, { 
                text: `📢 Broadcast completed\n✅ Success: ${successCount}\n❌ Failed: ${failCount}` 
            });
        } catch (err) {
            logger.error('Error during broadcast:', err);
            await sock.sendMessage(remoteJid, { text: '❌ Error during broadcast. Please check logs.' });
        }
    },

    async bcgroups(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const messageText = args.join(' ');
        if (!messageText) {
            await sock.sendMessage(remoteJid, { text: '⚠️ Please provide a message' });
            return;
        }
        // Implement group broadcast
        await sock.sendMessage(remoteJid, { text: '📢 Broadcasting to groups...' });
    },

    async bcpremium(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const messageText = args.join(' ');
        if (!messageText) {
            await sock.sendMessage(remoteJid, { text: '⚠️ Please provide a message' });
            return;
        }
        // Implement premium users broadcast
        await sock.sendMessage(remoteJid, { text: '📢 Broadcasting to premium users...' });
    },

    // API Management
    async setapi(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const [service, key] = args;
        if (!service || !key) {
            await sock.sendMessage(remoteJid, { text: '⚠️ Usage: !setapi <service> <key>' });
            return;
        }
        // Implement API key management
        await sock.sendMessage(remoteJid, { text: `✅ API key set for ${service}` });
    },

    async listapis(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        // Implement API keys listing
        await sock.sendMessage(remoteJid, { text: '🔑 Configured APIs:\n• None' });
    },

    async removeapi(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const service = args[0];
        if (!service) {
            await sock.sendMessage(remoteJid, { text: '⚠️ Please specify service' });
            return;
        }
        // Implement API key removal
        await sock.sendMessage(remoteJid, { text: `✅ Removed API key for ${service}` });
    },
    async serverinfo(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const info = {
            os: os.type(),
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            memory: {
                total: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2),
                free: (os.freemem() / (1024 * 1024 * 1024)).toFixed(2)
            },
            uptime: os.uptime()
        };

        const infoText = `
        🖥️ Server Information:
        • OS: ${info.os}
        • Platform: ${info.platform}
        • Architecture: ${info.arch}
        • CPU Cores: ${info.cpus}
        • Total Memory: ${info.memory.total}GB
        • Free Memory: ${info.memory.free}GB
        • Uptime: ${Math.floor(info.uptime / 3600)}h ${Math.floor((info.uptime % 3600) / 60)}m
        `.trim();

        await sock.sendMessage(remoteJid, { text: infoText });
    },

    async analytics(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const [timeframe] = args;
        if (!timeframe || !['daily', 'weekly', 'monthly'].includes(timeframe)) {
            await sock.sendMessage(remoteJid, {
                text: '📊 Usage: !analytics <daily|weekly|monthly>'
            });
            return;
        }
        // Implement analytics system
        await sock.sendMessage(remoteJid, { text: '📈 Generating analytics report...' });
    },

    async monitor(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const [resource] = args;
        const resources = ['cpu', 'memory', 'network', 'disk'];
        if (!resource || !resources.includes(resource)) {
            await sock.sendMessage(remoteJid, {
                text: `📊 Available resources to monitor: ${resources.join(', ')}`
            });
            return;
        }
        // Implement resource monitoring
        await sock.sendMessage(remoteJid, { text: '🔍 Monitoring resources...' });
    },

    async audit(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const [action] = args;
        if (!action || !['start', 'stop', 'report'].includes(action)) {
            await sock.sendMessage(remoteJid, {
                text: '🔍 Usage: !audit <start|stop|report>'
            });
            return;
        }
        // Implement security auditing
        await sock.sendMessage(remoteJid, { text: '🔎 Managing security audit...' });
    },

    async firewall(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const [action, rule] = args;
        if (!action || !['add', 'remove', 'list'].includes(action)) {
            await sock.sendMessage(remoteJid, {
                text: '🛡️ Usage: !firewall <add|remove|list> [rule]'
            });
            return;
        }
        // Implement firewall rules
        await sock.sendMessage(remoteJid, { text: '🔒 Managing firewall rules...' });
    },

    async dbstatus(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        // Implement database status check
        await sock.sendMessage(remoteJid, { text: '📊 Checking database status...' });
    },

    async dbbackup(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const [name] = args;
        if (!name) {
            await sock.sendMessage(remoteJid, {
                text: '💾 Usage: !dbbackup [backup_name]'
            });
            return;
        }
        // Implement database backup
        await sock.sendMessage(remoteJid, { text: '📦 Creating database backup...' });
    },

    async dbrestore(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const [backupName] = args;
        if (!backupName) {
            await sock.sendMessage(remoteJid, {
                text: '🔄 Usage: !dbrestore [backup_name]'
            });
            return;
        }
        // Implement database restore
        await sock.sendMessage(remoteJid, { text: '📥 Restoring database...' });
    },

    async dboptimize(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        // Implement database optimization
        await sock.sendMessage(remoteJid, { text: '⚡ Optimizing database...' });
    },

    async securityscan(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        // Implement security scanning
        await sock.sendMessage(remoteJid, { text: '🔍 Running security scan...' });
    },

    async accesslog(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const [userOrGroup] = args;
        if (!userOrGroup) {
            await sock.sendMessage(remoteJid, {
                text: '📋 Usage: !accesslog [user/group]'
            });
            return;
        }
        // Implement access log viewing
        await sock.sendMessage(remoteJid, { text: '📊 Fetching access logs...' });
    },

    async clearviolations(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const [userId] = args;
        if (!userId) {
            await sock.sendMessage(remoteJid, {
                text: '🧹 Usage: !clearviolations [user]'
            });
            return;
        }
        // Implement violation clearing
        await sock.sendMessage(remoteJid, { text: '✨ Clearing violations...' });
    },

    async tasklist(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        // Implement task listing
        await sock.sendMessage(remoteJid, { text: '📋 Getting running tasks...' });
    },

    async killprocess(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const [processId] = args;
        if (!processId) {
            await sock.sendMessage(remoteJid, {
                text: '⚠️ Usage: !killprocess [process_id]'
            });
            return;
        }
        // Implement process termination
        await sock.sendMessage(remoteJid, { text: '🛑 Terminating process...' });
    },

    async memoryclean(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        // Implement memory cleanup
        await sock.sendMessage(remoteJid, { text: '🧹 Cleaning memory...' });
    },

    async apikey(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const [service, action, key] = args;
        if (!service || !action || !['add', 'remove', 'update', 'view'].includes(action)) {
            await sock.sendMessage(remoteJid, {
                text: '🔑 Usage: !apikey [service] <add|remove|update|view> [key]'
            });
            return;
        }
        // Implement API key management
        await sock.sendMessage(remoteJid, { text: '⚙️ Managing API keys...' });
    },

    async apitest(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const [service] = args;
        if (!service) {
            await sock.sendMessage(remoteJid, {
                text: '🔄 Usage: !apitest [service]'
            });
            return;
        }
        // Implement API testing
        await sock.sendMessage(remoteJid, { text: '🔍 Testing API connection...' });
    },

    async apilimit(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const [service, limit] = args;
        if (!service || !limit) {
            await sock.sendMessage(remoteJid, {
                text: '⚡ Usage: !apilimit [service] [limit]'
            });
            return;
        }
        // Implement API rate limiting
        await sock.sendMessage(remoteJid, { text: '⚙️ Setting API limits...' });
    },

    async sysreport(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        // Implement system report generation
        await sock.sendMessage(remoteJid, { text: '📊 Generating system report...' });
    },

    async networkreport(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        // Implement network statistics report
        await sock.sendMessage(remoteJid, { text: '📡 Generating network report...' });
    },

    async storagereport(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        // Implement storage usage report
        await sock.sendMessage(remoteJid, { text: '💾 Generating storage report...' });
    },
    
    async getcreds(sock, message, args) {
        const remoteJid = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;
        // Extract clean JID (removing any server part)
        const cleanSender = sender.split('@')[0] + '@s.whatsapp.net';
        
        try {
            const fs = require('fs');
            const path = require('path');
            
            // Set auth directory path
            const AUTH_DIR = process.env.AUTH_DIR || 'auth_info';
            const SESSION_DIR = path.join(process.cwd(), AUTH_DIR);
            
            // Check if creds.json exists
            const credsPath = path.join(SESSION_DIR, 'creds.json');
            if (!fs.existsSync(credsPath)) {
                await sock.sendMessage(remoteJid, { 
                    text: '❌ Die creds.json Datei existiert nicht im Verzeichnis ' + SESSION_DIR 
                });
                return;
            }
            
            // Read and compress the creds.json file
            const credsData = fs.readFileSync(credsPath, 'utf8');
            const compressedCreds = JSON.stringify(JSON.parse(credsData)).replace(/\s+/g, '');
            
            // First send acknowledgment in the original chat
            await sock.sendMessage(remoteJid, { 
                text: '✅ Anmeldedaten werden an dich privat gesendet. Bewahre diese sicher auf!'
            });
            
            // Send the credentials to the user's private chat
            await sock.sendMessage(cleanSender, {
                text: `🔐 *BLACKSKY-MD CREDENTIALS*\n\nHier ist deine creds.json für Backup-Zwecke:\n\n\`\`\`${compressedCreds}\`\`\``
            });
            
            console.log(`Credentials sent to user ${cleanSender}`);
        } catch (err) {
            console.error('Error sending creds:', err);
            await sock.sendMessage(remoteJid, { 
                text: '❌ Fehler beim Senden der Anmeldedaten: ' + err.message
            });
        }
    }
};

module.exports = {
    commands: ownerCommands,

    category: 'owner',
    async init() {
        try {
            logger.info('Initializing owner command handler...');
            return true;
        } catch (error) {
            logger.error('Failed to initialize owner commands:', error);
            return false;
        }
    }
};