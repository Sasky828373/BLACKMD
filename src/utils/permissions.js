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
        // Enhanced error logging
        if (!userId) {
            console.error('isAdmin: userId is undefined or null');
            return false;
        }
        
        if (!groupId) {
            console.error('isAdmin: groupId is undefined or null');
            return false;
        }
        
        // Handle the case of the bot itself using bot ID from sock.user
        const botId = sock.user?.id;
        const isSelf = userId === botId || 
                     (userId.split('@')[0] === botId?.split('@')[0]);
        
        console.log(`Admin check: User ${userId}, Bot ${botId}, isSelf=${isSelf}`);
        
        // Bot always has admin privileges over itself
        if (isSelf) {
            console.log(`Self-check: Bot (${botId}) is always admin for its own commands`);
            return true;
        }
        
        // Normalize the user ID for more reliable matching
        const normalizedUserId = normalizeJidForComparison(userId);
        console.log(`Normalized user ID for admin check: ${normalizedUserId}`);

        try {
            // Get group metadata and extract admin list with improved error handling
            const groupMetadata = await sock.groupMetadata(groupId);
            
            if (!groupMetadata || !groupMetadata.participants) {
                console.error(`Failed to get valid group metadata for ${groupId}`);
                return false; // Can't determine admin status
            }
            
            // Extract admin list with additional logging
            const adminParticipants = groupMetadata.participants.filter(p => p.admin);
            const admins = adminParticipants.map(p => p.id);
                
            console.log(`Found ${admins.length} admins in group ${groupId}`);
            
            // Debug log participants to check format
            console.log(`Group ${groupId} participants (${groupMetadata.participants.length}):`, 
                groupMetadata.participants.map(p => `${p.id} (${p.admin ? 'admin' : 'member'})`).join(', '));
            
            // First try exact match
            if (admins.includes(userId)) {
                console.log(`Exact match: User ${userId} IS an admin in ${groupId}`);
                return true;
            }
            
            // Try with normalized IDs for more reliable matching
            for (const admin of admins) {
                const normalizedAdmin = normalizeJidForComparison(admin);
                console.log(`Comparing normalized IDs: ${normalizedUserId} with ${normalizedAdmin}`);
                
                // Check both ways for maximum compatibility
                if (normalizedUserId === normalizedAdmin || 
                    normalizedUserId.split('@')[0] === normalizedAdmin.split('@')[0]) {
                    console.log(`Normalized match: User ${userId} IS an admin in ${groupId}`);
                    return true;
                }
            }
            
            // Try with just the number part (most reliable for admin checks)
            const userNumber = userId.split('@')[0];
            for (const admin of admins) {
                const adminNumber = admin.split('@')[0];
                console.log(`Comparing just numbers: ${userNumber} with ${adminNumber}`);
                
                if (userNumber === adminNumber) {
                    console.log(`Number match: User ${userId} IS an admin in ${groupId}`);
                    return true;
                }
            }
            
            console.log(`All checks failed: User ${userId} is NOT an admin in ${groupId}`);
            return false; // Not found in admin list with any method
            
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
 * Normalize a JID for consistent comparison
 * @param {string} jid - JID to normalize
 * @returns {string} - Normalized JID
 */
function normalizeJidForComparison(jid) {
    if (!jid) return '';
    
    // Already has domain part, extract it
    if (jid.includes('@')) {
        const [user, domain] = jid.split('@');
        // Standardize on s.whatsapp.net domain
        return `${user}@${domain === 'c.us' ? 's.whatsapp.net' : domain}`;
    } 
    
    // Just a number, add the standard domain
    return `${jid}@s.whatsapp.net`;
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
