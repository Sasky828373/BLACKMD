/**
 * AFK Mention Handler
 * Checks if mentioned users are AFK and notifies the sender
 */

const logger = require('./logger');
const { safeSendMessage } = require('./jidHelper');
const { formatDuration } = require('./helpers');

// Import the userAfk Map from userDatabase
// The userAfk Map is exposed in the userDatabase module
const { userAfk, getUserProfile } = require('./userDatabase');

/**
 * Checks if any mentioned users in a message are AFK and sends notifications
 * @param {Object} sock - WhatsApp socket connection
 * @param {Object} message - The message object
 * @returns {Promise<boolean>} - Whether any AFK users were mentioned
 */
async function checkMentionsForAfkUsers(sock, message) {
    try {
        // Check if message exists and has content
        if (!message || !message.message) {
            return false;
        }

        // Get the chat JID (where to send the response)
        const remoteJid = message.key.remoteJid;
        
        // Get the sender JID
        const senderJid = message.key.participant || message.key.remoteJid;
        
        // Don't check self messages to avoid notification loops
        if (message.key.fromMe) {
            return false;
        }
        
        // Extract mentioned JIDs from the message
        const mentionedJids = 
            message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
        
        // If no mentions, return early
        if (!mentionedJids || mentionedJids.length === 0) {
            return false;
        }
        
        // Find which mentioned users are AFK
        const afkMentions = [];
        
        for (const mentionedJid of mentionedJids) {
            // Check if the mentioned user is AFK
            const afkStatus = userAfk.get(mentionedJid);
            
            if (afkStatus && afkStatus.status === true) {
                // Calculate how long they've been AFK
                const afkDuration = Date.now() - afkStatus.timestamp;
                const formattedDuration = formatDuration(Math.floor(afkDuration / 1000));
                
                // Get user's name from profile if available
                const userProfile = getUserProfile(mentionedJid) || { name: 'User' };
                
                afkMentions.push({
                    jid: mentionedJid,
                    name: userProfile.name,
                    reason: afkStatus.reason,
                    duration: formattedDuration
                });
            }
        }
        
        // If no AFK users were mentioned, return
        if (afkMentions.length === 0) {
            return false;
        }
        
        // Create notification message
        let notificationText = '';
        
        if (afkMentions.length === 1) {
            const afkUser = afkMentions[0];
            notificationText = `📢 *AFK Notification:* @${afkUser.jid.split('@')[0]} is currently AFK (${afkUser.duration}).\n\n*Reason:* ${afkUser.reason}`;
        } else {
            notificationText = '📢 *AFK Notification:* The following users are currently AFK:\n\n';
            
            afkMentions.forEach(afkUser => {
                notificationText += `• @${afkUser.jid.split('@')[0]} - ${afkUser.duration}\n*Reason:* ${afkUser.reason}\n\n`;
            });
        }
        
        // Send notification with mentions
        await safeSendMessage(sock, remoteJid, {
            text: notificationText,
            mentions: afkMentions.map(user => user.jid)
        });
        
        return true;
    } catch (error) {
        logger.error('Error checking AFK mentions:', error);
        return false;
    }
}

module.exports = {
    checkMentionsForAfkUsers
};