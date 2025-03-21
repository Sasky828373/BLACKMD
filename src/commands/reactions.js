/**
 * Enhanced Reaction Commands for WhatsApp Bot
 * Sends animated GIFs with proper mention formatting
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { safeSendMessage, safeSendAnimatedGif } = require('../utils/jidHelper');
const { convertGifToMp4 } = require('../utils/gifConverter');

// Path to reaction GIFs directory
const REACTIONS_DIR = path.join(process.cwd(), 'data', 'reaction_gifs');

// Define reaction GIF mapping
const REACTION_GIF_MAPPING = {
    // Self-reactions
    'smile': 'smile.gif',
    'happy': 'happy.gif',
    'dance': 'dance.gif',
    'cry': 'cry.gif',
    'blush': 'blush.gif',
    'laugh': 'laugh.gif',

    // Target-reactions
    'hug': 'hug.gif',
    'pat': 'pat.gif',
    'kiss': 'kiss.gif',
    'cuddle': 'cuddle.gif',
    'wave': 'wave.gif',
    'wink': 'wink.gif',
    'poke': 'poke.gif',
    'slap': 'slap.gif',
    'bonk': 'bonk.gif',
    'bite': 'bite.gif',
    'punch': 'punch.gif',
    'highfive': 'highfive.gif',
    'yeet': 'yeet.gif',
    'kill': 'kill.gif'
};

// Create reaction GIFs directory if it doesn't exist
function ensureDirectoriesExist() {
    if (!fs.existsSync(REACTIONS_DIR)) {
        try {
            fs.mkdirSync(REACTIONS_DIR, { recursive: true });
            logger.info(`Created reaction GIFs directory: ${REACTIONS_DIR}`);
        } catch (err) {
            logger.error(`Failed to create directory: ${err.message}`);
        }
    }
}

// Verify reaction GIFs exist
function verifyReactionGifs() {
    logger.info(`Using reaction GIFs from: ${REACTIONS_DIR}`);
    console.log(`Using reaction GIFs from: ${REACTIONS_DIR}`);

    Object.keys(commands).forEach(command => {
        if (command === 'init') return;

        const gifPath = path.join(REACTIONS_DIR, `${command}.gif`);
        if (fs.existsSync(gifPath)) {
            try {
                const stats = fs.statSync(gifPath);
                if (stats.size > 1024) {
                    logger.info(`✅ Verified ${command}.gif exists (${stats.size} bytes)`);
                } else {
                    logger.warn(`⚠️ GIF for ${command} is too small: ${stats.size} bytes`);
                }
            } catch (err) {
                logger.error(`Error checking GIF for ${command}: ${err.message}`);
            }
        } else {
            logger.warn(`❌ Missing GIF for ${command}`);
        }
    });
}

// Helper function to get user name from message
async function getUserName(sock, jid) {
    try {
        if (!jid) return "Someone";
        if (jid.endsWith('@g.us')) return "Group Chat";

        const phoneNumber = jid.split('@')[0];
        let name = null;

        if (sock.store && sock.store.contacts) {
            const contact = sock.store.contacts[jid];
            if (contact) {
                name = contact.name || contact.pushName;
            }
        }

        return name || `+${phoneNumber}`;
    } catch (err) {
        logger.error(`Error getting user name: ${err.message}`);
        return "User";
    }
}

// Cache for GIF buffers to avoid redundant disk reads
const gifBufferCache = new Map();
const GIF_CACHE_LIFETIME = 300000; // 5 minutes

// Reaction message templates for ultra-fast performance
const REACTION_TEMPLATES = {
    'smile': '{sender} smiles 😊',
    'happy': '{sender} is happy 😄',
    'dance': '{sender} is dancing 💃',
    'cry': '{sender} is crying 😢',
    'blush': '{sender} is blushing 😳',
    'laugh': '{sender} is laughing 😂',
    'hug': '{sender} hugs {target} 🤗',
    'pat': '{sender} pats {target} 👋',
    'kiss': '{sender} kisses {target} 😘',
    'cuddle': '{sender} cuddles with {target} 🥰',
    'wave': '{sender} waves at {target} 👋',
    'wink': '{sender} winks at {target} 😉',
    'poke': '{sender} pokes {target} 👉',
    'slap': '{sender} slaps {target} 👋',
    'bonk': '{sender} bonks {target} 🔨',
    'bite': '{sender} bites {target} 😬',
    'punch': '{sender} punches {target} 👊',
    'highfive': '{sender} high fives {target} ✋',
    'yeet': '{sender} yeets {target} 🚀',
    'kill': '{sender} kills {target} 💀'
};

// Get GIF buffer with caching for fast performance
async function getGifBuffer(type) {
    const now = Date.now();
    const cacheKey = `reaction_${type}`;

    // Check cache first
    if (gifBufferCache.has(cacheKey)) {
        const cache = gifBufferCache.get(cacheKey);
        if (now - cache.timestamp < GIF_CACHE_LIFETIME) {
            return cache.buffer;
        }
    }

    // Cache miss, read from disk
    const gifPath = path.join(REACTIONS_DIR, `${type}.gif`);
    if (fs.existsSync(gifPath)) {
        try {
            const buffer = fs.readFileSync(gifPath);
            // Cache the buffer
            gifBufferCache.set(cacheKey, {
                buffer,
                timestamp: now
            });
            return buffer;
        } catch (err) {
            logger.error(`Error reading GIF: ${err.message}`);
            return null;
        }
    }
    return null;
}

// Ultra-optimized reaction command handler with advanced parallel processing
// Designed for <5ms initial response time
async function handleReaction(sock, message, type, args) {
    try {
        const startTime = process.hrtime.bigint();
        const jid = message.key.remoteJid;
        const senderJid = message.key.participant || message.key.remoteJid;
        const sender = senderJid; // Added for easy access to senderJid


        // STAGE 1: IMMEDIATE RESPONSE (Ultra-fast path)
        // Format mentions without async operations for instant response
        const formattedSender = `@${senderJid.split('@')[0]}`;
        let targetName = "themselves";
        let targetJid = null;

        // Fast mention detection (no async)
        const contextInfo = message.message?.extendedTextMessage?.contextInfo;
        if (contextInfo?.mentionedJid?.length > 0) {
            targetJid = contextInfo.mentionedJid[0];
            targetName = `@${targetJid.split('@')[0]}`;
        } else if (args.length > 0) {
            targetName = args.join(' ');
        }

        // Format mentions properly
        const mentionedJids = [senderJid];
        if (targetJid) mentionedJids.push(targetJid);

        // Ultra-fast template application
        let reactionMessage;
        if (targetJid || args.length > 0) {
            reactionMessage = `*@${senderJid.split('@')[0]}* ${type}s with ${targetName}`;
        } else {
            reactionMessage = `*@${senderJid.split('@')[0]}* ${type}s`;
        }

        // Send both text and GIF
        const gifPath = path.join(process.cwd(), 'attached_assets', `${type}.gif`);

        try {
            if (fs.existsSync(gifPath)) {
                const gifBuffer = fs.readFileSync(gifPath);

                await sock.sendMessage(jid, {
                    text: reactionMessage,
                    mentions: mentionedJids
                });

                await sock.sendMessage(jid, { 
                    video: gifBuffer,
                    gifPlayback: true,
                    caption: ' ',
                    mimetype: 'video/mp4'
                }, { quoted: message });
            } else {
                console.log(`GIF not found: ${gifPath}`);
                await sock.sendMessage(jid, {
                    text: reactionMessage,
                    mentions: mentionedJids
                });
            }
        } catch (error) {
            console.error("Error sending GIF:", error);
            await sock.sendMessage(jid, { text: reactionMessage, mentions: mentionedJids });
        }


        return;

        // Ensure sender is included in mentions

        // Fire-and-forget immediate text response (<5ms target)


        // STAGE 2: BACKGROUND GIF PROCESSING (Non-blocking)
        // Start these operations after sending the text response
        setTimeout(async () => {
            try {
                // Get the GIF buffer (cached if available)
                const gifBuffer = await getGifBuffer(type);

                if (gifBuffer) {
                    // Use our improved direct video approach for reliable animations
                    try {
                        // Convert GIF to MP4 for proper animation
                        const { convertGifToMp4 } = require('../utils/gifConverter');
                        const videoBuffer = await convertGifToMp4(gifBuffer);

                        if (videoBuffer) {
                            // Send as video with gifPlayback enabled - most reliable method
                            await safeSendMessage(sock, jid, {
                                video: videoBuffer,
                                gifPlayback: true,
                                ptt: false,
                                mimetype: 'video/mp4'
                            });
                            logger.debug(`Successfully sent animated video for ${type} reaction`);
                        } else {
                            // Fallback to standard GIF method
                            await safeSendAnimatedGif(sock, jid, gifBuffer, "");
                            logger.debug(`Sent using fallback method for ${type} reaction`);
                        }
                    } catch (mediaError) {
                        logger.error(`All methods failed for ${type} reaction: ${mediaError.message}`);

                        // We already sent a text reaction, so this is just informational
                        logger.info(`Text-only reaction was sent for ${type}`);
                    }
                }
            } catch (backgroundError) {
                logger.error(`Error in reaction GIF background processing: ${backgroundError.message}`);
            }
        }, 100); // Small delay to ensure text message gets priority

    } catch (error) {
        // Minimal error handling with no logging for better performance
        safeSendMessage(sock, message.key.remoteJid, { text: `❌ Error with reaction command` })
            .catch(() => {/* Silent catch */});
    }
}

// Command implementations
const commands = {
    hug: async (sock, message, args) => await handleReaction(sock, message, 'hug', args),
    pat: async (sock, message, args) => await handleReaction(sock, message, 'pat', args),
    kiss: async (sock, message, args) => await handleReaction(sock, message, 'kiss', args),
    cuddle: async (sock, message, args) => await handleReaction(sock, message, 'cuddle', args),
    smile: async (sock, message, args) => await handleReaction(sock, message, 'smile', args),
    happy: async (sock, message, args) => await handleReaction(sock, message, 'happy', args),
    wave: async (sock, message, args) => await handleReaction(sock, message, 'wave', args),
    dance: async (sock, message, args) => await handleReaction(sock, message, 'dance', args),
    cry: async (sock, message, args) => await handleReaction(sock, message, 'cry', args),
    blush: async (sock, message, args) => await handleReaction(sock, message, 'blush', args),
    laugh: async (sock, message, args) => await handleReaction(sock, message, 'laugh', args),
    wink: async (sock, message, args) => await handleReaction(sock, message, 'wink', args),
    poke: async (sock, message, args) => await handleReaction(sock, message, 'poke', args),
    slap: async (sock, message, args) => await handleReaction(sock, message, 'slap', args),
    bonk: async (sock, message, args) => await handleReaction(sock, message, 'bonk', args),
    bite: async (sock, message, args) => await handleReaction(sock, message, 'bite', args),
    punch: async (sock, message, args) => await handleReaction(sock, message, 'punch', args),
    highfive: async (sock, message, args) => await handleReaction(sock, message, 'highfive', args),
    yeet: async (sock, message, args) => await handleReaction(sock, message, 'yeet', args),
    kill: async (sock, message, args) => await handleReaction(sock, message, 'kill', args)
};

async function init() {
    try {
        logger.info('Initializing reactions module...');
        ensureDirectoriesExist();
        verifyReactionGifs();
        return true;
    } catch (err) {
        logger.error(`Error initializing reactions: ${err.message}`);
        return false;
    }
}

module.exports = {
    commands,
    init,
    category: 'reactions'
};