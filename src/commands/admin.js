/**
 * Admin Commands Module
 * Provides commands for bot administration and system management
 */
const { safeSendMessage, safeSendText } = require('../utils/jidHelper');
const userDatabase = require('../utils/userDatabase');
const levelingSystem = require('../utils/levelingSystem');
const logger = require('../utils/logger');

/**
 * Check if a user is an admin by JID
 * @param {string} userJid - User JID to check
 * @returns {boolean} - Whether the user is an admin
 */
function isAdmin(userJid) {
    // List of admin JIDs - modify this array to include bot administrators
    const adminJids = [
        '4915561048015@s.whatsapp.net' // Add admin JIDs here
    ];
    
    return adminJids.includes(userJid);
}

/**
 * Recalculate and update user levels based on XP
 * @param {Object} sock - WhatsApp socket
 * @param {string} adminJid - Admin JID who requested the update
 * @param {string|null} targetJid - Optional target user JID (null for all users)
 * @returns {Promise<Object>} - Results of level update
 */
async function recalculateUserLevels(sock, adminJid, targetJid = null) {
    try {
        const results = {
            totalUsers: 0,
            updatedUsers: 0,
            failedUsers: 0,
            details: []
        };
        
        // Get all user profiles or just one if targetJid is specified
        const profiles = targetJid 
            ? (userDatabase.getUserProfile(targetJid) ? new Map([[targetJid, userDatabase.getUserProfile(targetJid)]]) : new Map())
            : userDatabase.userProfiles;
        
        if (!profiles || profiles.size === 0) {
            return { error: 'No user profiles found' };
        }
        
        results.totalUsers = profiles.size;
        
        // Process each profile
        for (const [jid, profile] of profiles.entries()) {
            try {
                if (!profile || typeof profile.xp !== 'number') {
                    results.failedUsers++;
                    results.details.push({
                        jid,
                        status: 'failed',
                        reason: 'Invalid profile or XP value'
                    });
                    continue;
                }
                
                // Calculate the correct level based on XP
                const calculatedLevel = levelingSystem.calculateLevel(profile.xp);
                
                // If level is different, update it
                if (calculatedLevel !== profile.level) {
                    const oldLevel = profile.level;
                    profile.level = calculatedLevel;
                    
                    // Update the profile in the database
                    userDatabase.updateUserProfile(jid, { level: calculatedLevel });
                    
                    results.updatedUsers++;
                    results.details.push({
                        jid,
                        status: 'updated',
                        oldLevel,
                        newLevel: calculatedLevel,
                        xp: profile.xp
                    });
                    
                    logger.info(`Admin recalculated level for ${jid}: ${oldLevel} -> ${calculatedLevel}`);
                } else {
                    // Level is already correct
                    results.details.push({
                        jid,
                        status: 'unchanged',
                        level: profile.level,
                        xp: profile.xp
                    });
                }
            } catch (userError) {
                results.failedUsers++;
                results.details.push({
                    jid,
                    status: 'error',
                    error: userError.message
                });
                logger.error(`Error updating level for ${jid}:`, userError);
            }
        }
        
        return results;
    } catch (error) {
        logger.error('Error in recalculateUserLevels:', error);
        return { error: error.message };
    }
}

// Command exports with admin permission checks
module.exports = {
    commands: {
        async fixlevels(sock, message, args) {
            try {
                const sender = message.key.participant || message.key.remoteJid;
                
                // Check if sender is admin
                if (!isAdmin(sender)) {
                    await safeSendText(sock, sender, '❌ *Admin only command*');
                    return;
                }
                
                // Check if a specific user was specified
                const targetJid = args.length > 0 ? args[0] : null;
                
                // Send initial message
                await safeSendText(sock, sender, '⏳ *Recalculating user levels...*');
                
                // Recalculate levels
                const results = await recalculateUserLevels(sock, sender, targetJid);
                
                if (results.error) {
                    await safeSendText(sock, sender, `❌ *Error:* ${results.error}`);
                    return;
                }
                
                // Generate report message
                let reportMessage = `✅ *Level Recalculation Complete*\n\n`;
                reportMessage += `Total users: ${results.totalUsers}\n`;
                reportMessage += `Updated users: ${results.updatedUsers}\n`;
                reportMessage += `Failed users: ${results.failedUsers}\n\n`;
                
                // Include details of updated users
                if (results.updatedUsers > 0) {
                    reportMessage += `*Updated Users:*\n`;
                    const updatedDetails = results.details
                        .filter(d => d.status === 'updated')
                        .slice(0, 10) // Limit to 10 entries to avoid message length issues
                        .map(d => {
                            const userPhone = d.jid.split('@')[0];
                            return `- ${userPhone}: ${d.oldLevel} → ${d.newLevel} (XP: ${d.xp})`;
                        })
                        .join('\n');
                    
                    reportMessage += updatedDetails;
                    
                    if (results.updatedUsers > 10) {
                        reportMessage += `\n...and ${results.updatedUsers - 10} more`;
                    }
                }
                
                await safeSendText(sock, sender, reportMessage);
            } catch (error) {
                logger.error('Error in fixlevels command:', error);
                const sender = message.key.participant || message.key.remoteJid;
                await safeSendText(sock, sender, `❌ *Error:* ${error.message}`);
            }
        },
        
        async updatelevel(sock, message, args) {
            try {
                const sender = message.key.participant || message.key.remoteJid;
                
                // Check if sender is admin
                if (!isAdmin(sender)) {
                    await safeSendText(sock, sender, '❌ *Admin only command*');
                    return;
                }
                
                // Check arguments: .updatelevel <jid> <level>
                if (args.length < 2) {
                    await safeSendText(sock, sender, '❌ *Usage:* .updatelevel <user> <level>');
                    return;
                }
                
                const targetJid = args[0];
                const newLevel = parseInt(args[1]);
                
                if (isNaN(newLevel) || newLevel < 1) {
                    await safeSendText(sock, sender, '❌ *Error:* Level must be a positive number');
                    return;
                }
                
                // Get user profile
                const profile = userDatabase.getUserProfile(targetJid);
                
                if (!profile) {
                    await safeSendText(sock, sender, '❌ *Error:* User not found');
                    return;
                }
                
                // Store old level for reporting
                const oldLevel = profile.level;
                
                // Update the level in database
                userDatabase.updateUserProfile(targetJid, { level: newLevel });
                
                logger.info(`Admin manually updated level for ${targetJid}: ${oldLevel} -> ${newLevel}`);
                
                await safeSendText(
                    sock, 
                    sender, 
                    `✅ *Level updated successfully*\n\nUser: ${targetJid.split('@')[0]}\nOld level: ${oldLevel}\nNew level: ${newLevel}`
                );
            } catch (error) {
                logger.error('Error in updatelevel command:', error);
                const sender = message.key.participant || message.key.remoteJid;
                await safeSendText(sock, sender, `❌ *Error:* ${error.message}`);
            }
        }
    },
    
    // Module metadata
    info: {
        name: 'admin',
        description: 'Admin commands for bot management'
    },
    
    // Module initialization
    async init() {
        logger.info('Admin commands initialized');
        return true;
    }
};