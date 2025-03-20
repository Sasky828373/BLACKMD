const logger = require('../utils/logger');
const { isAdmin, isBotAdmin } = require('../utils/permissions');
const { downloadMediaMessage } = require('../utils/helpers');
const { getGroupSettings, saveGroupSettings } = require('../utils/groupSettings');
const { safeSendText, safeSendMessage, safeSendImage } = require('../utils/jidHelper');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;

// Extended group command handlers
const groupNewCommands = {
    async pin(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;

            if (!remoteJid.endsWith('@g.us')) {
                await safeSendText(sock, remoteJid, '❌ This command can only be used in groups' );
                return;
            }

            const sender = message.key.participant || message.key.remoteJid;
            const isUserAdmin = await isAdmin(sock, remoteJid, sender);
            if (!isUserAdmin) {
                await safeSendText(sock, remoteJid, '❌ This command can only be used by admins' );
                return;
            }

            // Get the message to pin
            const quoted = message.message.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted) {
                await safeSendText(sock, remoteJid, '❌ Please reply to a message to pin it' );
                return;
            }

            // Store pinned message in group settings
            const settings = await getGroupSettings(remoteJid);
            if (!settings.pinnedMessages) settings.pinnedMessages = [];

            settings.pinnedMessages.push({
                message: quoted,
                pinnedBy: sender,
                timestamp: Date.now()
            });

            await saveGroupSettings(remoteJid, settings);
            await safeSendText(sock, remoteJid, '📌 Message has been pinned' );

        } catch (err) {
            logger.error('Error in pin command:', err);
            await safeSendText(sock, message.key.remoteJid, '❌ Failed to pin message' );
        }
    },

    async unpin(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;

            if (!remoteJid.endsWith('@g.us')) {
                await safeSendText(sock, remoteJid, '❌ This command can only be used in groups' );
                return;
            }

            const sender = message.key.participant || message.key.remoteJid;
            const isUserAdmin = await isAdmin(sock, remoteJid, sender);
            if (!isUserAdmin) {
                await safeSendText(sock, remoteJid, '❌ This command can only be used by admins' );
                return;
            }

            const settings = await getGroupSettings(remoteJid);
            if (!settings.pinnedMessages || settings.pinnedMessages.length === 0) {
                await safeSendText(sock, remoteJid, '❌ No pinned messages found' );
                return;
            }

            // Remove the last pinned message
            settings.pinnedMessages.pop();
            await saveGroupSettings(remoteJid, settings);

            await safeSendText(sock, remoteJid, '📌 Last pinned message has been removed' );

        } catch (err) {
            logger.error('Error in unpin command:', err);
            await safeSendText(sock, message.key.remoteJid, '❌ Failed to unpin message' );
        }
    },

    async pins(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;

            if (!remoteJid.endsWith('@g.us')) {
                await safeSendText(sock, remoteJid, '❌ This command can only be used in groups' );
                return;
            }

            const settings = await getGroupSettings(remoteJid);
            if (!settings.pinnedMessages || settings.pinnedMessages.length === 0) {
                await safeSendText(sock, remoteJid, '📌 No pinned messages' );
                return;
            }

            // Format pinned messages list
            const pinnedList = settings.pinnedMessages
                .map((pin, i) => `${i + 1}. Pinned by: @${pin.pinnedBy.split('@')[0]} (${new Date(pin.timestamp).toLocaleString()})`)
                .join('\n');

            await safeSendMessage(sock, remoteJid, { 
                text: `📌 Pinned Messages:\n\n${pinnedList}`,
                mentions: settings.pinnedMessages.map(pin => pin.pinnedBy)
            });

        } catch (err) {
            logger.error('Error in pins command:', err);
            await safeSendText(sock, message.key.remoteJid, '❌ Failed to list pinned messages' );
        }
    }
};

// Initialize directories needed for extended group functionality
const initializeDirectories = async () => {
    try {
        const dirs = [
            path.join(process.cwd(), 'data/groups_extended'),
            path.join(process.cwd(), 'data/groups_extended/pins'),
            path.join(process.cwd(), 'data/groups_extended/media')
        ];

        for (const dir of dirs) {
            try {
                if (!fs.existsSync(dir)) {
                    await fsPromises.mkdir(dir, { recursive: true });
                    logger.info(`✓ Extended group directory created: ${dir}`);
                } else {
                    logger.info(`✓ Extended group directory exists: ${dir}`);
                }
            } catch (dirErr) {
                logger.error(`Failed to initialize directory ${dir}:`, dirErr);
                throw dirErr;
            }
        }
        return true;
    } catch (err) {
        logger.error('Directory creation failed:', err);
        logger.error('Stack trace:', err.stack);
        return false;
    }
};

module.exports = {
    commands: groupNewCommands,
    category: 'group',
    fs,
    fsPromises,
    async init() {
        try {
            logger.info('🔄 Initializing Group Extended module...');

            // Verify core dependencies first
            const coreDeps = {
                'fs': fs,
                'fsPromises': fsPromises,
                'isAdmin': isAdmin,
                'isBotAdmin': isBotAdmin,
                'path': path,
                'logger': logger,
                'getGroupSettings': getGroupSettings,
                'saveGroupSettings': saveGroupSettings
            };

            for (const [name, dep] of Object.entries(coreDeps)) {
                if (!dep) {
                    logger.error(`❌ Core extended group dependency '${name}' is not initialized`);
                    return false;
                }
                logger.info(`✓ Core extended group dependency '${name}' verified`);
            }

            // Initialize directories
            const initialized = await initializeDirectories();
            if (!initialized) {
                logger.error('❌ Failed to initialize extended group directories');
                return false;
            }

            logger.info('✅ Group Extended module initialized successfully');
            return true;
        } catch (err) {
            logger.error('❌ Failed to initialize Group Extended module:', err);
            logger.error('Stack trace:', err.stack);
            return false;
        }
    }
};