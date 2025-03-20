/**
 * JID Helper Utility - Safe WhatsApp JID functions
 * Prevents "jid.endsWith is not a function" error
 */

const logger = require('./logger');

/**
 * Safely check if a JID is a group JID - High-performance optimized
 * @param {any} jid - JID to check
 * @returns {boolean} - Whether the JID is a group
 */
function isJidGroup(jid) {
    // Convert to string first to prevent "endsWith is not a function" errors
    const jidStr = String(jid || '');
    return jidStr.endsWith('@g.us');
}

/**
 * Safely check if a JID is a user JID - High-performance optimized
 * @param {any} jid - JID to check
 * @returns {boolean} - Whether the JID is a user
 */
function isJidUser(jid) {
    // Convert to string first to prevent "endsWith is not a function" errors
    const jidStr = String(jid || '');
    return jidStr.endsWith('@s.whatsapp.net');
}

/**
 * Normalize a JID to ensure it's properly formatted - High-performance optimized
 * @param {any} jid - JID to normalize
 * @returns {string} - Normalized JID
 */
function normalizeJid(jid) {
    if (!jid) return '';
    
    const jidStr = String(jid);
    
    // Replace @c.us with @s.whatsapp.net if needed
    if (jidStr.endsWith('@c.us')) {
        return jidStr.replace('@c.us', '@s.whatsapp.net');
    }
    
    return jidStr;
}

/**
 * Ensure a JID is a string - High-performance optimized
 * @param {any} jid - The JID to stringify
 * @returns {string} - The JID as a string or empty string if invalid
 */
function ensureJidString(jid) {
    if (!jid) return '';
    
    // If jid is already a string, return it directly
    if (typeof jid === 'string') return jid;
    
    // If jid is an object with remoteJid property (message.key format)
    if (typeof jid === 'object') {
        // First check for message.key format
        if (jid.key && jid.key.remoteJid) {
            return jid.key.remoteJid;
        }
        
        // Then check for direct remoteJid property
        if (jid.remoteJid && typeof jid.remoteJid === 'string') {
            return jid.remoteJid;
        }
        
        // Try to get a sensible ID for logging too
        if (jid.id && typeof jid.id === 'string') {
            logger.warn(`Converting object JID to string using id property: ${jid.id}`);
        }
    }
    
    // Try standard string conversion - might yield "[object Object]" for objects
    try {
        const stringValue = String(jid);
        if (stringValue === '[object Object]') {
            // Avoid returning non-useful string representation
            logger.warn('Failed to extract valid JID from object:', JSON.stringify(jid));
            return '';
        }
        return stringValue;
    } catch (error) {
        logger.error('Error converting JID to string:', error);
        return '';
    }
}

/**
 * Extract user ID from JID - High-performance optimized
 * @param {any} jid - The JID to extract from
 * @returns {string} - User ID portion of the JID
 */
function extractUserIdFromJid(jid) {
    const jidStr = ensureJidString(jid);
    
    if (!jidStr) return '';
    
    // Extract user ID (remove the @s.whatsapp.net or @g.us part)
    const match = jidStr.match(/^([^@]+)@/);
    return match ? match[1] : '';
}

/**
 * Format a JID for logging to prevent [object Object] - High-performance optimized
 * @param {any} jid - JID to format for log messages
 * @returns {string} - Formatted JID safe for logging
 */
function formatJidForLogging(jid) {
    if (!jid) return '<null_jid>';
    
    try {
        // If JID is already a string, use it directly
        if (typeof jid === 'string') {
            // Mask the middle part of the phone number for privacy
            const parts = jid.split('@');
            if (parts.length === 2) {
                const userId = parts[0];
                const domain = parts[1];
                
                if (userId.length > 6) {
                    const start = userId.substring(0, 3);
                    const end = userId.substring(userId.length - 3);
                    return `${start}***${end}@${domain}`;
                }
                
                return `${userId}@${domain}`;
            }
            return jid;
        }
        
        // If JID is an object, try to extract useful info
        if (jid && typeof jid === 'object') {
            // First check for full message object (with key property)
            if (jid.key && jid.key.remoteJid) {
                return formatJidForLogging(jid.key.remoteJid);
            }
            
            // Then check for direct key object
            if (jid.remoteJid) {
                return formatJidForLogging(jid.remoteJid);
            }
            
            // For debugging, include the object's keys
            const keys = Object.keys(jid).join(',');
            if (keys.length > 0) {
                return `<jid:object:${keys}>`;
            }
        }
        
        // Default fallback
        return `<jid:${typeof jid}>`;
    } catch (error) {
        logger.error('Error formatting JID for logging:', error);
        return '<invalid_jid>';
    }
}

/**
 * Safely send a text message with optimized performance
 * @param {Object} sock - WhatsApp socket connection
 * @param {string} jid - Recipient JID 
 * @param {string} text - Message text
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - Send result
 */
async function safeSendText(sock, jid, text, options = {}) {
    if (!sock || !sock.sendMessage) {
        logger.error('Invalid socket for safeSendText');
        return null;
    }
    
    const safeJid = ensureJidString(jid);
    if (!safeJid) {
        logger.error('Invalid JID for safeSendText');
        return null;
    }
    
    try {
        return await sock.sendMessage(safeJid, { text }, options);
    } catch (error) {
        logger.error(`Error sending text to ${formatJidForLogging(safeJid)}:`, error);
        return null;
    }
}

/**
 * Safely send a message with optimized performance
 * @param {Object} sock - WhatsApp socket connection
 * @param {string} jid - Recipient JID 
 * @param {Object} content - Message content
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - Send result
 */
async function safeSendMessage(sock, jid, content, options = {}) {
    if (!sock || !sock.sendMessage) {
        logger.error('Invalid socket for safeSendMessage');
        return null;
    }
    
    const safeJid = ensureJidString(jid);
    if (!safeJid) {
        logger.error('Invalid JID for safeSendMessage');
        return null;
    }
    
    try {
        return await sock.sendMessage(safeJid, content, options);
    } catch (error) {
        logger.error(`Error sending message to ${formatJidForLogging(safeJid)}:`, error);
        return null;
    }
}

/**
 * Safely send an image message with optimized performance
 * @param {Object} sock - WhatsApp socket connection
 * @param {string} jid - Recipient JID
 * @param {Buffer|string} image - Image buffer or URL
 * @param {string} caption - Image caption
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - Send result
 */
async function safeSendImage(sock, jid, image, caption = '', options = {}) {
    const content = {
        image: image,
        caption: caption
    };
    
    return await safeSendMessage(sock, jid, content, options);
}

/**
 * Safely send an animated GIF with optimized performance
 * @param {Object} sock - WhatsApp socket connection
 * @param {string} jid - Recipient JID
 * @param {Buffer|string} gif - GIF buffer or URL
 * @param {string} caption - GIF caption
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - Send result
 */
async function safeSendAnimatedGif(sock, jid, gif, caption = '', options = {}) {
    // Ensure we have a valid JID
    const safeJid = ensureJidString(jid);
    if (!safeJid) {
        logger.error('Invalid JID for safeSendAnimatedGif');
        return null;
    }
    
    // Handle both Buffer and URL inputs
    let gifBuffer = gif;
    if (typeof gif === 'string' && (gif.startsWith('http://') || gif.startsWith('https://'))) {
        try {
            const axios = require('axios');
            const response = await axios.get(gif, { 
                responseType: 'arraybuffer',
                timeout: 5000
            });
            gifBuffer = Buffer.from(response.data);
            logger.info(`Downloaded GIF from URL: ${gif.substring(0, 50)}...`);
        } catch (downloadError) {
            logger.error(`Failed to download GIF from URL: ${downloadError.message}`);
            throw downloadError;
        }
    }
    
    // UPDATED APPROACH: Convert to MP4 first for best animation results
    try {
        // Import here to avoid circular dependencies
        const { convertGifToMp4 } = require('./gifConverter');
        
        // Convert GIF to MP4 for better WhatsApp compatibility
        logger.info(`Converting GIF to MP4 for animation support (${gifBuffer.length} bytes)`);
        const videoBuffer = await convertGifToMp4(gifBuffer);
        
        if (videoBuffer && videoBuffer.length > 0) {
            // Send as video with gifPlayback: true for proper animation
            const content = {
                video: videoBuffer,
                caption: caption,
                gifPlayback: true,
                ptt: false, // Not voice note
                seconds: 10, // Default duration hint
                gifAttribution: 2, // WhatsApp animation attribution
                mimetype: 'video/mp4'
            };
            
            logger.info(`Sending converted MP4 with gifPlayback (${videoBuffer.length} bytes)`);
            return await sock.sendMessage(safeJid, content, options);
        } else {
            logger.warn('Video conversion returned empty buffer, falling back to alternative methods');
        }
    } catch (conversionError) {
        logger.warn(`MP4 conversion failed: ${conversionError.message}, trying alternatives...`);
    }
    
    // FALLBACK METHODS if the MP4 conversion fails
    
    // Method 1: Send as Sticker (Good for some animations)
    try {
        const content = {
            sticker: gifBuffer,
            mimetype: 'image/webp' // Try WebP format which WhatsApp prefers
        };
        
        logger.info(`Fallback: Sending animated GIF as sticker (${gifBuffer.length} bytes)`);
        return await sock.sendMessage(safeJid, content, options);
    } catch (stickerError) {
        logger.warn(`Sticker method failed: ${stickerError.message}`);
    }
    
    // Method 2: Send as video with original GIF buffer but MP4 mimetype
    try {
        const content = {
            video: gifBuffer, 
            caption: caption,
            gifPlayback: true,
            jpegThumbnail: null, // Skip thumbnail generation
            mimetype: 'video/mp4'
        };
        
        logger.info(`Fallback: Sending GIF as video with MP4 mimetype (${gifBuffer.length} bytes)`);
        return await sock.sendMessage(safeJid, content, options);
    } catch (videoError) {
        logger.warn(`Video method failed: ${videoError.message}`);
    }
    
    // Method 3: Send as document with animation flag
    try {
        const content = {
            document: gifBuffer,
            fileName: 'animation.gif',
            mimetype: 'image/gif',
            caption: caption
        };
        
        logger.info(`Fallback: Sending as GIF document (${gifBuffer.length} bytes)`);
        return await sock.sendMessage(safeJid, content, options);
    } catch (documentError) {
        logger.warn(`Document method failed: ${documentError.message}`);
    }
    
    // Method 4: Send as standard image (won't animate but at least sends)
    try {
        const content = {
            image: gifBuffer,
            caption: caption || 'Animation'
        };
        
        logger.info(`Last resort: Sending as standard image (${gifBuffer.length} bytes)`);
        return await sock.sendMessage(safeJid, content, options);
    } catch (finalError) {
        logger.error(`All methods failed to send GIF: ${finalError.message}`);
        
        // Ultimate fallback - try to return something
        try {
            return await sock.sendMessage(safeJid, { text: caption || "Couldn't send animation" });
        } catch (e) {
            logger.error(`Even text fallback failed: ${e.message}`);
            throw finalError;
        }
    }
}

/**
 * Safely reply to a message with optimized performance
 * @param {Object} sock - WhatsApp socket connection
 * @param {Object} message - Original message to reply to
 * @param {string} text - Reply text
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - Send result
 */
async function safeReply(sock, message, text, options = {}) {
    if (!message || !message.key) {
        logger.error('Invalid message for safeReply');
        return null;
    }
    
    const quoted = {
        quoted: message
    };
    
    return await safeSendText(
        sock,
        message.key.remoteJid,
        text,
        { ...quoted, ...options }
    );
}

/**
 * Safely send a message to a group with optimized performance
 * @param {Object} sock - WhatsApp socket connection
 * @param {string} jid - Group JID
 * @param {Object} content - Message content
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - Send result
 */
async function safeSendGroupMessage(sock, jid, content, options = {}) {
    if (!sock || !sock.sendMessage) {
        logger.error('Invalid socket for safeSendGroupMessage');
        return null;
    }
    
    const safeJid = ensureJidString(jid);
    if (!safeJid) {
        logger.error('Invalid JID for safeSendGroupMessage');
        return null;
    }
    
    // Ensure this is actually a group JID
    if (!isJidGroup(safeJid)) {
        logger.warn(`safeSendGroupMessage called with non-group JID: ${formatJidForLogging(safeJid)}`);
    }
    
    try {
        return await sock.sendMessage(safeJid, content, options);
    } catch (error) {
        logger.error(`Error sending group message to ${formatJidForLogging(safeJid)}:`, error);
        return null;
    }
}

module.exports = {
    isJidGroup,
    isJidUser,
    normalizeJid,
    ensureJidString,
    extractUserIdFromJid,
    formatJidForLogging,
    safeSendText,
    safeSendMessage,
    safeSendImage,
    safeSendAnimatedGif,
    safeReply,
    safeSendGroupMessage
};