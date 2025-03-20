const logger = require('../utils/logger');
const { safeSendMessage, safeSendText, safeSendImage } = require('../utils/jidHelper');

async function handleGroupParticipantsUpdate(sock, { id, participants, action }) {
    try {
        // Get group metadata and settings
        const groupMetadata = await sock.groupMetadata(id);
        const settings = groupMetadata.settings || {};

        // Check for anti-raid protection on member join
        if (action === 'add' && settings.antiraid) {
            const now = Date.now();
            const cooldown = settings.raidCooldown || 60; // Default 60 seconds
            const lastJoin = settings.lastJoinTime || 0;

            // If joining too quickly after last join, consider it potential raid
            if (now - lastJoin < cooldown * 1000) {
                // Add to join queue
                if (!settings.joinQueue) settings.joinQueue = new Set();
                participants.forEach(p => settings.joinQueue.add(p));

                // Remove the users
                await sock.groupParticipantsUpdate(id, participants, 'remove');
                await safeSendText(sock, id, '🛡️ Anti-raid protection: Join requests temporarily blocked'
                );
                return;
            }

            // Update last join time
            settings.lastJoinTime = now;
        }

        switch (action) {
            case 'add':
                if (settings.welcomeMessage) {
                    // Send welcome message for each new participant
                    for (const participant of participants) {
                        const welcomeMsg = settings.welcomeMessage
                            .replace('{user}', `@${participant.split('@')[0]}`)
                            .replace('{group}', groupMetadata.subject)
                            .replace('{memberCount}', groupMetadata.participants.length);

                        await safeSendMessage(sock, id, {
                            text: welcomeMsg,
                            mentions: [participant]
                        });
                    }
                }
                break;

            case 'remove':
                if (settings.goodbyeMessage) {
                    // Send goodbye message for each leaving participant
                    for (const participant of participants) {
                        const goodbyeMsg = settings.goodbyeMessage
                            .replace('{user}', `@${participant.split('@')[0]}`)
                            .replace('{group}', groupMetadata.subject)
                            .replace('{memberCount}', groupMetadata.participants.length);

                        await safeSendMessage(sock, id, {
                            text: goodbyeMsg,
                            mentions: [participant]
                        });
                    }
                }
                break;

            case 'promote':
                // Handle promotion events
                for (const participant of participants) {
                    await safeSendMessage(sock, id, {
                        text: `👑 @${participant.split('@')[0]} has been promoted to admin`,
                        mentions: [participant]
                    });
                }
                break;

            case 'demote':
                // Handle demotion events
                for (const participant of participants) {
                    await safeSendMessage(sock, id, {
                        text: `⬇️ @${participant.split('@')[0]} has been demoted from admin`,
                        mentions: [participant]
                    });
                }
                break;
        }

        // Update group activity tracking
        if (!groupMetadata.activity) {
            groupMetadata.activity = {
                messageCount: 0,
                activeMembers: new Set(),
                lastReset: Date.now()
            };
        }

        // Log the event for activity tracking
        groupMetadata.activity.lastEvent = {
            type: action,
            participants: participants,
            timestamp: Date.now()
        };

    } catch (err) {
        logger.error('Error in group participants handler:', err);
    }
}

module.exports = { handleGroupParticipantsUpdate };