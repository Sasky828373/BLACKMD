/**
 * Utility functions for checking user permissions in groups and bot ownership
 */

const { owner: ownerConfig } = require('../config/config');

/**
 * Check if a user is an admin in a group
 * @param {Object} sock - The WhatsApp socket connection
 * @param {string} groupId - The group JID
 * @param {string} userId - The user's JID
 * @returns {Promise<boolean>} - Whether the user is an admin
 */
async function isAdmin(sock, groupId, userId) {
    try {
        // Check for self - the bot itself can do admin commands
        const isSelf = userId === sock.user?.id;
        if (isSelf) {
            return true; // Bot is considered admin for its own commands
        }
        
        // Normalize the JID to ensure consistent format
        const normalizedUserId = userId.split('@')[0] + '@s.whatsapp.net';

        // Get group metadata and extract admin list
        const groupMetadata = await sock.groupMetadata(groupId);
        const admins = groupMetadata.participants
            .filter(p => p.admin)
            .map(p => p.id);
            
        // Check if normalized ID is in admin list
        for (const admin of admins) {
            const normalizedAdmin = admin.split('@')[0] + '@s.whatsapp.net';
            if (normalizedUserId === normalizedAdmin) {
                return true;
            }
        }
        
        return false; // Strict admin check - return false if not an admin
        
    } catch (err) {
        console.error('Error checking admin status:', err);
        // Fail closed for security
        return false;
    }
}

/**
 * Check if the bot is an admin in a group
 * @param {Object} sock - The WhatsApp socket connection
 * @param {string} groupId - The group JID
 * @returns {Promise<boolean>} - Whether the bot is an admin
 */
async function isBotAdmin(sock, groupId) {
    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        const botId = sock.user?.id;
        
        if (!botId) {
            console.warn('Bot ID not available, assuming not admin');
            return false;
        }
        
        // Normalize the bot ID
        const normalizedBotId = botId.split('@')[0] + '@s.whatsapp.net';
        
        // Get admin list
        const admins = groupMetadata.participants
            .filter(p => p.admin)
            .map(p => p.id);
        
        // Check if normalized bot ID is in admin list
        for (const admin of admins) {
            const normalizedAdmin = admin.split('@')[0] + '@s.whatsapp.net';
            if (normalizedBotId === normalizedAdmin) {
                return true;
            }
        }
        
        // Return false if bot is not in admin list
        return false;
        
    } catch (err) {
        console.error('Error checking bot admin status:', err);
        // For critical group admin commands, it's safer to fail closed
        return false;
    }
}

/**
 * Check if a message is from a group owner
 * @param {Object} sock - The WhatsApp socket connection
 * @param {string} groupId - The group JID
 * @param {string} userId - The user's JID
 * @returns {Promise<boolean>} - Whether the user is the group owner
 */
async function isOwner(sock, groupId, userId) {
    try {
        // For bot commands initiated by itself
        const isSelf = userId === sock.user?.id;
        if (isSelf) {
            return true; // Always allow the bot to run its own commands
        }
        
        // Normalize user ID for consistent matching
        const normalizedUserId = userId.split('@')[0] + '@s.whatsapp.net';
        
        const groupMetadata = await sock.groupMetadata(groupId);
        if (!groupMetadata.owner) {
            // If owner info is missing, fall back to admin check
            return await isAdmin(sock, groupId, userId);
        }
        
        // Normalize owner ID for consistent matching
        const normalizedOwner = groupMetadata.owner.split('@')[0] + '@s.whatsapp.net';
        
        // Check exact match with normalized IDs
        if (normalizedOwner === normalizedUserId) {
            return true;
        }
        
        return false; // Strict owner check - return false if not the group owner
        
    } catch (err) {
        console.error('Error checking owner status:', err);
        return false; // Fail closed for security
    }
}

/**
 * Check if a user is the bot owner (based on config and environment variables)
 * @param {string} userId - The user's JID
 * @returns {boolean} - Whether the user is the bot owner
 */
function isBotOwner(userId) {
    try {
        // Self-check for commands executed by the bot itself
        if (!userId) return false;
        
        // Get configured owner number from config or environment
        const ownerNumber = process.env.OWNER_NUMBER ? 
            process.env.OWNER_NUMBER.replace(/[^0-9]/g, '') : 
            ownerConfig.number;
            
        if (!ownerNumber) {
            console.warn('No owner number configured');
            return false;
        }
        
        // Extract just the number part from the JID
        const userNumber = userId.split('@')[0];
        
        // Clean both numbers and compare
        const cleanUserNumber = userNumber.replace(/[^0-9]/g, '');
        const cleanOwnerNumber = ownerNumber.replace(/[^0-9]/g, '');
        
        // Check exact match
        return cleanUserNumber === cleanOwnerNumber;
    } catch (err) {
        console.error('Error checking bot owner status:', err);
        // Fail closed for security
        return false;
    }
}

module.exports = {
    isAdmin,
    isBotAdmin,
    isOwner,
    isBotOwner
};
