const logger = require('../utils/logger');
const { isJidGroup, ensureJidString, safeSendText, safeSendMessage, safeSendImage } = require('../utils/jidHelper');
const { isAdmin } = require('../utils/permissions');

// Store message timestamps for spam detection
const messageTimestamps = new Map();

// Store warning counts for users
const userWarnings = new Map();

// Function to check if a message contains links
function containsLink(message) {
    try {
        const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;
        return urlRegex.test(message);
    } catch (err) {
        logger.error('Error in containsLink check:', err);
        return false;
    }
}

// Function to check if a message contains toxic content
function containsToxicContent(message) {
    try {
        // Common toxic/inappropriate words
        const toxicWords = [
            // Profanity/slurs (obscured to avoid encoding directly)
            'f*ck', 'sh*t', 'b*tch', 'd*ck', 'a**hole', 'c*nt',
            // Hate speech-related
            'n*gger', 'f*ggot', 'r*tard',
            // Threatening language
            'kill yourself', 'kys', 'kill you', 'suicide',
            // Sexual harassment
            'r*pe', 'molest', 'sexual'
        ];
        
        // Convert message to lowercase for comparison
        const lowerMessage = message.toLowerCase();
        
        // Check for exact matches and partial matches with word boundaries
        return toxicWords.some(word => {
            // Remove the asterisks for regex pattern (replacing with wildcards)
            const pattern = word.replace(/\*/g, '\\w*');
            // Create regex with word boundaries
            const regex = new RegExp(`\\b${pattern}\\b|\\b${pattern}s\\b|\\b${pattern}ing\\b`, 'i');
            return regex.test(lowerMessage);
        });
    } catch (err) {
        logger.error('Error in toxicity check:', err);
        return false;
    }
}

// Function to check spam rate
function isSpamming(userId, groupId, limit) {
    try {
        const key = `${userId}-${groupId}`;
        const now = Date.now();
        const userTimestamps = messageTimestamps.get(key) || [];

        // Remove timestamps older than 1 minute
        const recentTimestamps = userTimestamps.filter(timestamp => 
            now - timestamp < 60000
        );

        // Update timestamps
        messageTimestamps.set(key, [...recentTimestamps, now]);

        // Check if message count exceeds limit
        return recentTimestamps.length >= limit;
    } catch (err) {
        logger.error('Error in spam check:', err);
        return false;
    }
}

// Function to manage warnings
function handleWarning(userId, groupId) {
    try {
        const key = `${userId}-${groupId}`;
        const warnings = userWarnings.get(key) || 0;
        userWarnings.set(key, warnings + 1);
        return warnings + 1;
    } catch (err) {
        logger.error('Error in warning management:', err);
        return 0;
    }
}

async function handleGroupMessage(sock, message) {
    try {
        const remoteJid = ensureJidString(message.key.remoteJid);

        // Only process group messages
        if (isJidGroup(!remoteJid)) {
            logger.debug('Message not from group, skipping');
            return;
        }

        // Determine sender with fallback options
        const sender = message.key.participant || message.participant;
        if (!sender) {
            logger.debug('Cannot identify sender in group message, skipping');
            return;
        }
        
        // Extract message text with support for different message types
        const messageText = message.message?.conversation || 
                          message.message?.extendedTextMessage?.text || 
                          message.message?.imageMessage?.caption ||
                          message.message?.videoMessage?.caption || '';

        logger.debug(`Processing group message from ${sender} in ${remoteJid}`);

        // Try to get group metadata and settings with error handling
        let groupMetadata, settings = {};
        try {
            groupMetadata = await sock.groupMetadata(remoteJid);
            settings = groupMetadata.settings || {};
        } catch (metaErr) {
            logger.error('Failed to fetch group metadata:', metaErr);
            // Continue with default settings
        }

        // Skip moderation checks for admins
        try {
            const isUserAdmin = await isAdmin(sock, remoteJid, sender);
            if (isUserAdmin) {
                logger.debug('Message from admin, skipping moderation checks');
                return;
            }
        } catch (adminErr) {
            logger.error('Failed to check admin status:', adminErr);
            // If we can't determine admin status, continue with moderation
        }

        // Anti-link check
        if (settings.antilink && containsLink(messageText)) {
            logger.info(`Link detected from ${sender}, taking action`);
            await safeSendMessage(sock, remoteJid, {
                text: `⚠️ @${sender.split('@')[0]} Links are not allowed in this group!`,
                mentions: [sender]
            });
            await safeSendMessage(sock, remoteJid, { delete: message.key });
            const warnings = handleWarning(sender, remoteJid);
            if (warnings >= 3) {
                await sock.groupParticipantsUpdate(remoteJid, [sender], 'remove');
                await safeSendMessage(remoteJid, {
                    text: `🚫 @${sender.split('@')[0]} has been removed for multiple violations`,
                    mentions: [sender]
                });
            }
            return;
        }

        // Anti-spam check
        if (settings.antispam) {
            const spamLimit = settings.spamLimit || 10;
            if (isSpamming(sender, remoteJid, spamLimit)) {
                logger.info(`Spam detected from ${sender}, taking action`);
                await safeSendMessage(remoteJid, {
                    text: `⚠️ @${sender.split('@')[0]} Please don't spam!`,
                    mentions: [sender]
                });
                await safeSendMessage(sock, remoteJid, { delete: message.key });
                const warnings = handleWarning(sender, remoteJid);
                if (warnings >= 3) {
                    await sock.groupParticipantsUpdate(remoteJid, [sender], 'remove');
                    await safeSendMessage(remoteJid, {
                        text: `🚫 @${sender.split('@')[0]} has been removed for multiple violations`,
                        mentions: [sender]
                    });
                }
                return;
            }
        }

        // Anti-toxic check
        if (settings.antitoxic && containsToxicContent(messageText)) {
            logger.info(`Toxic content detected from ${sender}, taking action`);
            await safeSendMessage(remoteJid, {
                text: `⚠️ @${sender.split('@')[0]} Please maintain group decorum!`,
                mentions: [sender]
            });
            await safeSendMessage(sock, remoteJid, { delete: message.key });
            const warnings = handleWarning(sender, remoteJid);
            if (warnings >= 3) {
                await sock.groupParticipantsUpdate(remoteJid, [sender], 'remove');
                await safeSendMessage(remoteJid, {
                    text: `🚫 @${sender.split('@')[0]} has been removed for multiple violations`,
                    mentions: [sender]
                });
            }
            return;
        }

    } catch (err) {
        logger.error('Error in group message handler:', err);
    }
}

module.exports = { handleGroupMessage };