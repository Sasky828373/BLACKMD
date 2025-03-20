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
        
        // Enhanced error logging
        if (!userId) {
            console.error('isAdmin: userId is undefined or null');
            return false;
        }
        
        if (!groupId) {
            console.error('isAdmin: groupId is undefined or null');
            return false;
        }
        
        // Normalize the JID to ensure consistent format
        // More robust handling of different ID formats
        let normalizedUserId;
        if (userId.includes('@')) {
            // Extract just the number part and re-add the domain
            normalizedUserId = userId.split('@')[0] + '@s.whatsapp.net';
        } else {
            // Just a number, add the domain
            normalizedUserId = userId + '@s.whatsapp.net';
        }

        try {
            // Get group metadata and extract admin list with improved error handling
            const groupMetadata = await sock.groupMetadata(groupId);
            
            if (!groupMetadata || !groupMetadata.participants) {
                console.error(`Failed to get valid group metadata for ${groupId}`);
                return false; // Can't determine admin status
            }
            
            // Extract admin list with additional logging
            const admins = groupMetadata.participants
                .filter(p => p.admin)
                .map(p => p.id);
                
            console.log(`Found ${admins.length} admins in group ${groupId}`);
            
            // Debug log each admin for troubleshooting
            for (const admin of admins) {
                console.log(`Admin in group: ${admin}`);
            }
            
            // Check if normalized ID is in admin list with improved matching
            for (const admin of admins) {
                // Normalize admin ID for consistent comparison
                const normalizedAdmin = admin.split('@')[0] + '@s.whatsapp.net';
                console.log(`Comparing ${normalizedUserId} with ${normalizedAdmin}`);
                
                // Do a strict comparison with normalized IDs
                if (normalizedUserId === normalizedAdmin) {
                    console.log(`User ${userId} IS an admin in ${groupId}`);
                    return true;
                }
            }
            
            console.log(`User ${userId} is NOT an admin in ${groupId}`);
            return false; // Not found in admin list
        } catch (metadataErr) {
            console.error(`Error getting group metadata: ${metadataErr.message}`);
            return false;
        }
        
    } catch (err) {
        console.error(`Error checking admin status: ${err.message}`);
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
        if (!groupId) {
            console.error('isBotAdmin: groupId is undefined or null');
            return false;
        }
        
        const botId = sock.user?.id;
        
        if (!botId) {
            console.warn('Bot ID not available, assuming not admin');
            return false;
        }
        
        // Use the enhanced isAdmin function for consistency
        const isAdminResult = await isAdmin(sock, groupId, botId);
        console.log(`Bot admin check result for ${botId} in ${groupId}: ${isAdminResult}`);
        return isAdminResult;
        
    } catch (err) {
        console.error(`Error checking bot admin status: ${err.message}`);
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
