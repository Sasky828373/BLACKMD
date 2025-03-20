/**
 * Safe Message Sending Utility
 * Provides reliable message sending with enhanced JID validation, error handling and retry capability
 */

// Track internal statistics
const stats = {
    sent: 0,
    errors: 0,
    retries: 0,
    successfulRetries: 0,
    validationErrors: 0
};

// Import JID helper utility if available, otherwise use built-in fallback functions
let jidHelper;
try {
    jidHelper = require('./jidHelper');
} catch (error) {
    console.log('[SAFE-SEND] jidHelper module not found, using built-in validation');
    jidHelper = {
        ensureJidString: (jid) => jid ? String(jid) : '',
        formatJidForLogging: (jid) => {
            if (!jid) return '<null>';
            try {
                return String(jid);
            } catch (err) {
                return `<invalid:${typeof jid}>`;
            }
        }
    };
}

// Cache for validated JIDs to improve performance
const jidCache = new Map();

/**
 * Validate a JID for message sending (optimized with caching)
 * @param {any} jid - JID to validate
 * @returns {Object} - Validation result {valid: boolean, message: string, normalizedJid: string}
 */
function validateJid(jid) {
    // Fast path for common case - strings
    if (typeof jid === 'string') {
        // Check cache first for previously validated JIDs
        if (jidCache.has(jid)) {
            return jidCache.get(jid);
        }
        
        // Fast validation for common patterns
        if (jid.endsWith('@s.whatsapp.net') && jid.length > 15) {
            const result = { valid: true, message: 'Valid JID', normalizedJid: jid };
            jidCache.set(jid, result);
            return result;
        }
        
        if (jid.endsWith('@g.us') && jid.length > 10) {
            const result = { valid: true, message: 'Valid JID', normalizedJid: jid };
            jidCache.set(jid, result);
            return result;
        }
    }
    
    // Null check
    if (!jid) {
        return { valid: false, message: 'JID is null or undefined', normalizedJid: null };
    }
    
    // Object extraction (optimized)
    let extractedJid = jid;
    if (typeof jid === 'object' && jid !== null) {
        // Direct property access for common patterns
        extractedJid = jid.key?.remoteJid || jid.remoteJid || jid.id || String(jid);
    }
    
    // Convert to string efficiently
    const stringJid = typeof extractedJid === 'string' ? extractedJid : String(extractedJid);
    
    // Fast validation (less string operations)
    if (stringJid.length < 5 || !stringJid.includes('@')) {
        return { valid: false, message: 'Invalid JID format', normalizedJid: null };
    }
    
    // Single endsWith check instead of multiple
    const suffix = stringJid.substring(stringJid.lastIndexOf('@'));
    const isValidSuffix = suffix === '@g.us' || suffix === '@s.whatsapp.net' || suffix === '@c.us';
    
    if (!isValidSuffix) {
        return { valid: false, message: 'JID has invalid suffix', normalizedJid: null };
    }
    
    // Fast suffix replacement
    let normalizedJid = stringJid;
    if (suffix === '@c.us') {
        normalizedJid = stringJid.slice(0, -5) + '@s.whatsapp.net';
    }
    
    // Cache result for future use
    const result = { valid: true, message: 'Valid JID', normalizedJid };
    if (typeof jid === 'string') {
        jidCache.set(jid, result);
    }
    
    return result;
}

// Fast common text sending cache
const recentTextCache = new Map();
const TEXT_CACHE_SIZE = 50;

/**
 * Safely send a text message with optimized performance
 * @param {Object} sock - WhatsApp socket connection
 * @param {string} jid - Recipient JID 
 * @param {string} text - Message text
 * @param {Object} options - Additional options
 * @param {boolean} options.priority - Whether this is a high priority message
 * @param {number} options.maxRetries - Maximum retry attempts
 * @returns {Promise<Object|null>} - Message sending result or null if failed
 */
async function safeSendText(sock, jid, text, options = {}) {
    // Fast null check
    if (!sock || !jid) return null;
    
    // Fast text check with default
    if (!text) text = '...';
    
    // Cache check for duplicate messages to avoid spamming
    // (prevents sending the same message to the same JID within a short time)
    const cacheKey = `${jid}:${text}`;
    const now = Date.now();
    const recentSend = recentTextCache.get(cacheKey);
    
    if (recentSend && now - recentSend < 3000 && text.length > 5 && !options.priority) {
        // Skip duplicate messages sent within 3 seconds
        return null;
    }
    
    // Minimal logging for better performance
    if (text.length > 100) {
        console.log(`[SEND] To ${typeof jid === 'string' ? jid.split('@')[0] : 'unknown'}: ${text.substring(0, 50)}...`);
    }
    
    // Add to cache for duplicate prevention
    recentTextCache.set(cacheKey, now);
    
    // Clean cache periodically
    if (recentTextCache.size > TEXT_CACHE_SIZE) {
        // Keep only the most recent entries
        const entries = [...recentTextCache.entries()];
        entries.sort((a, b) => b[1] - a[1]); // Sort by timestamp (newest first)
        recentTextCache.clear();
        for (let i = 0; i < Math.min(TEXT_CACHE_SIZE / 2, entries.length); i++) {
            recentTextCache.set(entries[i][0], entries[i][1]);
        }
    }
    
    // Direct path for improved performance
    return safeSendMessage(sock, jid, { text }, options);
}

// Cached promises for in-flight messages to the same JID
const pendingSends = new Map();

/**
 * Safely send a WhatsApp message with enhanced JID validation, error handling and retry
 * Optimized for high performance with JID caching and reduced logging
 * 
 * @param {Object} sock - WhatsApp socket connection
 * @param {string|Object} jid - Recipient JID
 * @param {Object} content - Message content
 * @param {Object} options - Additional options
 * @param {number} options.maxRetries - Maximum retry attempts (default: 1)
 * @param {number} options.retryDelay - Delay between retries in ms (default: 500)
 * @returns {Promise<Object|null>} - Message sending result or null if failed
 */
async function safeSendMessage(sock, jid, content, options = {}) {
    // Fast null check for common error cases
    if (!sock || !jid) {
        return null;
    }
    
    // Fast validation with caching
    const validation = validateJid(jid);
    if (!validation.valid) {
        stats.validationErrors++;
        return null;
    }
    
    // Use validated JID
    const validJid = validation.normalizedJid;
    
    // Performance optimization - set reasonable defaults
    const maxRetries = options.maxRetries ?? 1;  // Reduced default retries for faster throughput
    const retryDelay = options.retryDelay ?? 500; // Reduced delay for faster performance
    
    // Generate a unique key for this message
    const isPriority = options.priority === true;
    const uniqueKey = `${validJid}:${Date.now()}`;
    
    // Helper function to send with retries
    async function sendWithRetry() {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // For retries
                if (attempt > 0) {
                    stats.retries++;
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
                
                // Direct message sending - minimize overhead
                const result = await sock.sendMessage(validJid, content);
                
                // Update stats
                stats.sent++;
                if (attempt > 0) stats.successfulRetries++;
                
                return result;
            } catch (err) {
                stats.errors++;
                
                // Only log detailed errors on final attempt to reduce console spam
                if (attempt === maxRetries) {
                    console.error(`[SAFE-SEND] Failed to send to ${validJid}: ${err.message}`);
                }
            }
        }
        return null;
    }
    
    // For high priority messages, send immediately
    if (isPriority) {
        return sendWithRetry();
    }
    
    // Check if we're already sending to this JID
    const existingPromise = pendingSends.get(validJid);
    if (existingPromise) {
        // Wait for the existing send to complete before starting this one
        // This prevents flooding the same recipient
        try {
            await existingPromise;
        } catch {
            // Ignore errors from previous sends
        }
    }
    
    // Create a new promise for this send
    const sendPromise = sendWithRetry();
    pendingSends.set(validJid, sendPromise);
    
    // Clean up the pending sends map after completion
    sendPromise.finally(() => {
        if (pendingSends.get(validJid) === sendPromise) {
            pendingSends.delete(validJid);
        }
    });
    
    return sendPromise;
}

/**
 * Safely send a reply to a message with error handling and retry
 * @param {Object} sock - WhatsApp socket connection
 * @param {Object} msg - Original message to reply to
 * @param {string} text - Reply text
 * @param {Object} options - Additional options
 * @param {boolean} options.fallbackToDirectMessage - Whether to fall back to a direct message if reply fails
 * @returns {Promise<Object|null>} - Message sending result or null if failed
 */
async function safeSendReply(sock, msg, text, options = {}) {
    if (!msg || !msg.key || !msg.key.remoteJid) {
        console.error('[SAFE-SEND] Invalid message object for reply, missing key.remoteJid');
        return null;
    }

    const fallbackToDirectMessage = options.fallbackToDirectMessage ?? true;
    const jid = msg.key.remoteJid;
    
    if (!text) {
        console.warn('[SAFE-SEND] Empty reply text, using placeholder');
        text = '...';
    }
    
    console.log(`[SAFE-SEND] Sending reply to ${jidHelper.formatJidForLogging(jid)}: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
    
    try {
        // Try to send as a reply
        const result = await safeSendMessage(sock, jid, {
            text,
            quoted: msg
        });
        
        return result;
    } catch (err) {
        console.error(`[SAFE-SEND] Error sending reply: ${err.message}`);
        
        // If we should fall back to a direct message
        if (fallbackToDirectMessage) {
            console.log(`[SAFE-SEND] Falling back to direct message`);
            return safeSendText(sock, jid, text);
        }
        
        return null;
    }
}

/**
 * Safely send an image message
 * @param {Object} sock - WhatsApp socket connection
 * @param {any} jid - Recipient JID
 * @param {Buffer|string} image - Image buffer or URL
 * @param {string} caption - Caption text
 * @param {Object} options - Additional options
 * @returns {Promise<Object|null>} - Message sending result or null if failed
 */
async function safeSendImage(sock, jid, image, caption = '', options = {}) {
    if (!image) {
        console.error('[SAFE-SEND] Missing image data');
        return null;
    }
    
    const content = { 
        image: image,
        caption: caption || ''
    };
    
    console.log(`[SAFE-SEND] Sending image to ${jidHelper.formatJidForLogging(jid)}${caption ? ': ' + caption.substring(0, 30) + (caption.length > 30 ? '...' : '') : ''}`);
    return safeSendMessage(sock, jid, content, options);
}

/**
 * Safely send a video or GIF message
 * @param {Object} sock - WhatsApp socket connection
 * @param {any} jid - Recipient JID
 * @param {Buffer|string} video - Video buffer or URL
 * @param {string} caption - Caption text
 * @param {Object} options - Additional options
 * @returns {Promise<Object|null>} - Message sending result or null if failed
 */
async function safeSendVideo(sock, jid, video, caption = '', options = {}) {
    if (!video) {
        console.error('[SAFE-SEND] Missing video data');
        return null;
    }
    
    const content = { 
        video: video,
        caption: caption || '',
        gifPlayback: options.gifPlayback ?? false
    };
    
    console.log(`[SAFE-SEND] Sending video to ${jidHelper.formatJidForLogging(jid)}${caption ? ': ' + caption.substring(0, 30) + (caption.length > 30 ? '...' : '') : ''}`);
    return safeSendMessage(sock, jid, content, options);
}

/**
 * Safely send an animated GIF message
 * @param {Object} sock - WhatsApp socket connection
 * @param {any} jid - Recipient JID
 * @param {Buffer|string} gif - GIF buffer or URL
 * @param {string} caption - Caption text
 * @param {Object} options - Additional options
 * @returns {Promise<Object|null>} - Message sending result or null if failed
 */
async function safeSendAnimatedGif(sock, jid, gif, caption = '', options = {}) {
    if (!gif) {
        console.error('[SAFE-SEND] Missing GIF data');
        return null;
    }
    
    const gifOptions = {
        ...options,
        gifPlayback: true
    };
    
    console.log(`[SAFE-SEND] Sending animated GIF to ${jidHelper.formatJidForLogging(jid)}${caption ? ': ' + caption.substring(0, 30) + (caption.length > 30 ? '...' : '') : ''}`);
    return safeSendVideo(sock, jid, gif, caption, gifOptions);
}

/**
 * Get messaging statistics
 * @returns {Object} - Current stats
 */
function getStats() {
    return {
        ...stats,
        successRate: stats.sent > 0 
            ? Math.round((stats.sent - stats.errors) / stats.sent * 100) 
            : 100,
        retrySuccessRate: stats.retries > 0
            ? Math.round(stats.successfulRetries / stats.retries * 100)
            : 0,
        validationErrorRate: (stats.validationErrors + stats.sent) > 0
            ? Math.round(stats.validationErrors / (stats.validationErrors + stats.sent) * 100)
            : 0
    };
}

/**
 * Reset messaging statistics
 */
function resetStats() {
    stats.sent = 0;
    stats.errors = 0;
    stats.retries = 0;
    stats.successfulRetries = 0;
    stats.validationErrors = 0;
}

module.exports = {
    safeSendText,
    safeSendMessage,
    safeSendReply,
    safeSendImage,
    safeSendVideo,
    safeSendAnimatedGif,
    validateJid,
    getStats,
    resetStats
};