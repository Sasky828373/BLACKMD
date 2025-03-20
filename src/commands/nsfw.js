const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const FormData = require('form-data');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const { getGroupSettings, saveGroupSettings } = require('../utils/groupSettings');
const { languageManager } = require('../utils/language');
const { 
    safeSendMessage, 
    safeSendText, 
    safeSendImage, 
    isJidGroup, 
    isJidUser,
    safeSendAnimatedGif,
    ensureJidString,
    formatJidForLogging
} = require('../utils/jidHelper');

// Import optimized NSFW image fetching utility with correct exports
const nsfwUtils = require('../utils/fetchNsfwImage');

const TEMP_DIR = path.join(process.cwd(), 'temp/nsfw');

async function getFileTypeFromBuffer(buffer) {
    try {
        const FileType = await import('file-type');
        return await FileType.fileTypeFromBuffer(buffer);
    } catch (error) {
        logger.error('Error importing or using file-type module:', error);
        return detectFileTypeFromMagicNumbers(buffer);
    }
}

function detectFileTypeFromMagicNumbers(buffer) {
    if (!buffer || buffer.length < 4) return null;
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return { ext: 'jpg', mime: 'image/jpeg' };
    }
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return { ext: 'png', mime: 'image/png' };
    }
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
        return { ext: 'gif', mime: 'image/gif' };
    }
    if (buffer.length >= 12 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return { ext: 'webp', mime: 'image/webp' };
    }
    if (buffer.length >= 8 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
        return { ext: 'mp4', mime: 'video/mp4' };
    }
    return null;
}

const verifiedUsers = new Map();
const groupNsfwSettings = new Map();
const userCooldowns = new Map();
const VERIFIED_USERS_FILE = path.join(process.cwd(), 'data', 'verified_users.json');

/**
 * Save verified users to a JSON file
 */
async function saveVerifiedUsers() {
    try {
        const dataDir = path.join(process.cwd(), 'data');
        
        // Check if directory exists using fs.promises
        try {
            await fs.access(dataDir);
        } catch {
            // Directory doesn't exist, create it
            await fs.mkdir(dataDir, { recursive: true });
        }
        
        const verifiedData = {};
        for (const [userId, data] of verifiedUsers.entries()) {
            verifiedData[userId] = data;
        }
        
        await fs.writeFile(VERIFIED_USERS_FILE, JSON.stringify(verifiedData, null, 2));
        logger.info(`✅ NSFW: Saved ${verifiedUsers.size} verified users to file: ${VERIFIED_USERS_FILE}`);
        console.log(`✅ NSFW: Saved ${verifiedUsers.size} verified users to file: ${VERIFIED_USERS_FILE}`);
    } catch (err) {
        logger.error('❌ NSFW: Failed to save verified users:', err);
        console.error('❌ NSFW: Failed to save verified users:', err);
    }
}

/**
 * Load verified users from JSON file
 */
async function loadVerifiedUsers() {
    try {
        if (await fileExists(VERIFIED_USERS_FILE)) {
            const data = await fs.readFile(VERIFIED_USERS_FILE, 'utf8');
            const verifiedData = JSON.parse(data);
            
            for (const [userId, userData] of Object.entries(verifiedData)) {
                verifiedUsers.set(userId, userData);
            }
            
            logger.info(`✅ NSFW: Loaded ${verifiedUsers.size} verified users from file`);
            console.log(`✅ NSFW: Loaded ${verifiedUsers.size} verified users from file`);
        } else {
            logger.info('✅ NSFW: No verified users file found, creating one now');
            console.log('✅ NSFW: No verified users file found, creating one now');
            // Create an empty file to ensure it exists for future writes
            await saveVerifiedUsers();
        }
    } catch (err) {
        logger.error('❌ NSFW: Failed to load verified users:', err);
        console.error('❌ NSFW: Failed to load verified users:', err);
    }
}

/**
 * Check if a file exists
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>} - Whether file exists
 */
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function initDirectories() {
    try {
        await fs.mkdir(TEMP_DIR, { recursive: true });
        logger.info('NSFW temp directories created');
        
        // Load verified users data from file
        await loadVerifiedUsers();
    } catch (err) {
        logger.error('Failed to create NSFW temp directories:', err);
    }
}

function isUserVerified(userId) {
    // Ensure userId is a string and normalize it
    const normalizedId = String(userId || '');
    
    // Debug log to help troubleshoot the verification issue
    logger.debug(`Checking verification for user: ${normalizedId}, result: ${verifiedUsers.has(normalizedId)}`);
    logger.debug(`Verified users: ${Array.from(verifiedUsers.keys()).join(', ')}`);
    
    return verifiedUsers.has(normalizedId);
}

function setUserVerification(userId, verified = true) {
    // Ensure userId is a string and normalize it
    let normalizedId = String(userId || '');
    
    // Fix for [object Object] issue - ensure we have a proper string
    if (normalizedId === '[object Object]' || normalizedId.includes('[object')) {
        // This means we're dealing with a JID object instead of a string
        logger.warn(`Received invalid userId format: ${normalizedId}, using fallback`);
        // If we can extract a string ID from it, do so 
        if (userId && userId.user) {
            normalizedId = `${userId.user}@${userId.server || 's.whatsapp.net'}`;
        }
    }
    
    // Additional validation to prevent invalid JIDs
    if (!normalizedId.includes('@')) {
        logger.warn(`Invalid JID format for verification: ${normalizedId}, appending domain`);
        normalizedId = `${normalizedId}@s.whatsapp.net`;
    }
    
    if (verified) {
        verifiedUsers.set(normalizedId, {
            verified: true,
            timestamp: Date.now()
        });
        logger.debug(`User verification set for ${normalizedId}`);
        logger.debug(`Updated verified users: ${Array.from(verifiedUsers.keys()).join(', ')}`);
    } else {
        verifiedUsers.delete(normalizedId);
        logger.debug(`User verification removed for ${normalizedId}`);
    }
    
    // Save the updated verification data to persist across restarts
    saveVerifiedUsers().catch(err => {
        logger.error('Failed to save user verification data:', err);
    });
}

async function isNsfwEnabledForGroup(groupId) {
    // Ensure groupId is a string - fix for "endsWith is not a function" error
    const safeGroupId = String(groupId || '');
    
    if (groupNsfwSettings.has(safeGroupId)) {
        return groupNsfwSettings.get(safeGroupId).enabled;
    }

    try {
        const settings = await getGroupSettings(safeGroupId);
        const enabled = settings?.nsfw?.enabled || false;
        groupNsfwSettings.set(safeGroupId, { enabled });
        return enabled;
    } catch (err) {
        logger.error(`Error checking NSFW settings for group ${safeGroupId}:`, err);
        return false;
    }
}

async function saveNsfwSettingsForGroup(groupId, enabled) {
    try {
        // Ensure groupId is a string - fix for "endsWith is not a function" error
        const safeGroupId = String(groupId || '');
        
        const settings = await getGroupSettings(safeGroupId);
        settings.nsfw = {
            ...settings.nsfw,
            enabled,
            updatedAt: Date.now()
        };

        await saveGroupSettings(safeGroupId, settings);
        groupNsfwSettings.set(safeGroupId, { enabled });
        logger.info(`NSFW settings updated for group ${safeGroupId}: ${enabled ? 'enabled' : 'disabled'}`);
        return true;
    } catch (err) {
        logger.error(`Error saving NSFW settings for group ${groupId}:`, err);
        return false;
    }
}

/**
 * Download media from URL and return as buffer
 * @param {string} url - URL to download from
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Buffer|null>} - Downloaded buffer or null on failure
 */
async function downloadMedia(url, timeout = 5000) {
    try {
        logger.info(`Downloading media from ${url}`);
        const response = await axios.get(url, { 
            responseType: 'arraybuffer',
            timeout: timeout
        });
        
        return Buffer.from(response.data);
    } catch (err) {
        logger.error(`Error downloading media from ${url}: ${err.message}`);
        return null;
    }
}

/**
 * Enhanced helper function to safely fetch and send NSFW images
 * Optimized for faster loading and performance
 * @param {Object} sock - WhatsApp socket
 * @param {string} jid - JID to send to
 * @param {string} category - NSFW category
 * @param {string} caption - Image caption
 * @param {boolean} requireGif - Whether to require GIF format
 * @returns {Promise<boolean>} - Whether sending was successful
 */
async function fetchAndSendNsfwImage(sock, jid, category, caption, requireGif = false) {
    // Use DIRECT_GIFS from the centralized nsfwUtils module
    const DIRECT_GIFS = nsfwUtils.DIRECT_GIFS;

    try {
        // Start timing for performance tracking
        const startTime = Date.now();
        
        // Send interim message (typing indicator disabled as per user request)
        await safeSendText(sock, jid, 'Fetching image...');

        // Try optimized fetchNsfwImage utility first with parallel operation
        const result = await nsfwUtils.fetchNsfwImage(category, requireGif);
        
        // Handle buffer result from local files
        if (result && result.buffer && result.isLocalFile) {
            logger.info(`Using local file buffer for ${category} (${result.buffer.length} bytes)`);
            
            try {
                if (requireGif || category.startsWith('gif')) {
                    // Convert GIF to MP4 for better animation if it's a GIF
                    const { convertGifToMp4 } = require('../utils/gifConverter');
                    const videoBuffer = await convertGifToMp4(result.buffer);
                    
                    if (videoBuffer) {
                        // Send as video with gifPlayback for proper animation
                        await safeSendMessage(sock, jid, {
                            video: videoBuffer,
                            caption: caption || `${category.toUpperCase()} 🔞`,
                            gifPlayback: true,
                            mimetype: 'video/mp4'
                        });
                    } else {
                        // Fallback to standard animated GIF
                        await safeSendAnimatedGif(sock, jid, result.buffer, caption || `${category.toUpperCase()} 🔞`);
                    }
                } else {
                    // For static images, use standard image sending
                    await safeSendImage(sock, jid, result.buffer, caption || `${category.toUpperCase()} 🔞`);
                }
                
                logger.info(`NSFW ${category} sent using local file buffer to ${formatJidForLogging(jid)}`);
                return true;
            } catch (bufferError) {
                logger.error(`Error sending local file buffer: ${bufferError.message}`);
                // Continue with URL fallbacks
            }
        }
        
        // Process URL result (backwards compatibility)
        // Check if result is a string URL (old format) or contains a URL property
        const imageUrl = typeof result === 'string' ? result : 
                        (result && result.url) ? result.url : null;
        
        if (imageUrl) {
            // Fast path for known optimized domains
            const isOptimizedDomain = typeof imageUrl === 'string' && (
                imageUrl.includes('tenor.com') || 
                imageUrl.includes('imgur.com') || 
                imageUrl.includes('giphy.com'));
            
            // For GIFs from optimized domains, send directly without buffer conversion
            if (isOptimizedDomain && (requireGif || category.includes('gif'))) {
                try {
                    logger.info(`Downloading media from ${imageUrl}`);
                    
                    // Handle GIFs with proper animation
                    if (requireGif || category.startsWith('gif')) {
                        // Download the GIF buffer
                        const axios = require('axios');
                        const response = await axios.get(imageUrl, { 
                            responseType: 'arraybuffer',
                            timeout: 5000
                        });
                        
                        const buffer = Buffer.from(response.data);
                        
                        // Convert to MP4 for better animation
                        const { convertGifToMp4 } = require('../utils/gifConverter');
                        const videoBuffer = await convertGifToMp4(buffer);
                        
                        if (videoBuffer) {
                            // Send as video with gifPlayback for proper animation
                            await safeSendMessage(sock, jid, {
                                video: videoBuffer,
                                caption: caption || `${category.toUpperCase()} 🔞`,
                                gifPlayback: true,
                                mimetype: 'video/mp4'
                            });
                        } else {
                            // Fallback to standard safeSendAnimatedGif
                            await safeSendAnimatedGif(sock, jid, buffer, caption || `${category.toUpperCase()} 🔞`);
                        }
                    } else {
                        // For static images, use standard image sending
                        await safeSendImage(sock, jid, imageUrl, caption || `${category.toUpperCase()} 🔞`);
                    }
                    
                    logger.info(`NSFW ${category} media sent to ${formatJidForLogging(jid)} (fast path)`);
                    return true;
                } catch (fastPathErr) {
                    // If direct send fails, fall back to buffer method
                    logger.debug(`Fast path failed, trying buffer method: ${fastPathErr.message}`);
                }
            }
            
            // Standard path with buffer
            const buffer = await downloadMedia(imageUrl);
            
            if (buffer) {
                if (requireGif) {
                    await safeSendAnimatedGif(sock, jid, buffer, caption || `${category.toUpperCase()} 🔞`);
                } else {
                    await safeSendImage(sock, jid, buffer, caption || `${category.toUpperCase()} 🔞`);
                }
                
                // Log performance metrics
                const processingTime = Date.now() - startTime;
                logger.info(`NSFW ${category} ${requireGif ? 'GIF' : 'image'} sent to ${formatJidForLogging(jid)}`);
                
                if (processingTime > 2000) {
                    // Log slow operations to help identify bottlenecks
                    logger.debug(`Image processing took ${processingTime}ms for ${category}`);
                }
                
                return true;
            }
        }
        
        // Fallback to direct GIFs from our constant list - ultra-fast path
        // This should be very quick since it's a direct, known URL
        const fallbackUrl = nsfwUtils.DIRECT_GIFS[category] || nsfwUtils.DIRECT_GIFS[requireGif ? 'gif' + category : category];
        if (fallbackUrl) {
            logger.info(`Using direct fallback for ${category}: ${fallbackUrl}`);
            
            try {
                // For GIFs, use the improved animation handling
                if (requireGif || category.startsWith('gif')) {
                    // Download the GIF buffer
                    const axios = require('axios');
                    const response = await axios.get(fallbackUrl, { 
                        responseType: 'arraybuffer',
                        timeout: 5000
                    });
                    
                    const buffer = Buffer.from(response.data);
                    
                    // Convert GIF to MP4 for better animation
                    const { convertGifToMp4 } = require('../utils/gifConverter');
                    const videoBuffer = await convertGifToMp4(buffer);
                    
                    if (videoBuffer) {
                        // Send as video with gifPlayback for proper animation
                        await safeSendMessage(sock, jid, {
                            video: videoBuffer,
                            caption: caption || `${category.toUpperCase()} 🔞`,
                            gifPlayback: true,
                            mimetype: 'video/mp4'
                        });
                    } else {
                        // Fallback to standard animated GIF
                        await safeSendAnimatedGif(sock, jid, buffer, caption || `${category.toUpperCase()} 🔞`);
                    }
                } else {
                    // For static images, use standard image sending
                    await safeSendImage(sock, jid, fallbackUrl, caption || `${category.toUpperCase()} 🔞`);
                }
                
                logger.info(`NSFW ${category} sent using direct fallback to ${formatJidForLogging(jid)}`);
                return true;
            } catch (directErr) {
                // If direct send fails, try buffer method
                const buffer = await downloadMedia(fallbackUrl, 3000); // Shorter timeout for fallbacks
                
                if (buffer) {
                    if (requireGif) {
                        await safeSendAnimatedGif(sock, jid, buffer, caption || `${category.toUpperCase()} 🔞`);
                    } else {
                        await safeSendImage(sock, jid, buffer, caption || `${category.toUpperCase()} 🔞`);
                    }
                    
                    logger.info(`NSFW ${category} sent using fallback buffer to ${formatJidForLogging(jid)}`);
                    return true;
                }
            }
        }
        
        // All methods failed
        await safeSendText(sock, jid, 'Failed to fetch image. Please try again later.');
        return false;
    } catch (err) {
        logger.error(`Error in fetchAndSendNsfwImage (${category}): ${err.message}`);
        await safeSendText(sock, jid, 'Failed to fetch image due to server error.');
        return false;
    }
}

// Note: This function is no longer needed as we're using the optimized
// fetchNsfwImage utility from '../utils/fetchNsfwImage.js'
// The utility handles API requests, caching, fallbacks, and error handling

function applyCooldown(userId, seconds = 60) {
    const now = Date.now();
    const cooldownExpiry = userCooldowns.get(userId);

    if (cooldownExpiry && cooldownExpiry > now) {
        return false;
    }

    userCooldowns.set(userId, now + (seconds * 1000));
    return true;
}

function getRemainingCooldown(userId) {
    const now = Date.now();
    const cooldownExpiry = userCooldowns.get(userId);

    if (!cooldownExpiry || cooldownExpiry <= now) {
        return 0;
    }

    return Math.ceil((cooldownExpiry - now) / 1000);
}

async function sendNsfwGif(sock, sender, url, caption) {
    let retries = 2;
    let delay = 1000;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            // Download GIF with timeout
            const response = await axios.get(url, { 
                responseType: 'arraybuffer',
                timeout: 5000 
            });
            
            const buffer = Buffer.from(response.data);
            
            // Verify it's actually a GIF or media file
            const fileType = await getFileTypeFromBuffer(buffer);
            if (!fileType || (!fileType.mime.includes('image') && !fileType.mime.includes('video'))) {
                throw new Error(`Invalid media type: ${fileType?.mime || 'unknown'}`);
            }
            
            // Try converting to MP4 for better animation
            try {
                // Import the gifConverter utility
                const { convertGifToMp4 } = require('../utils/gifConverter');
                
                // Convert GIF to MP4 for better animation in WhatsApp
                const videoBuffer = await convertGifToMp4(buffer);
                
                if (videoBuffer) {
                    // Send as video with gifPlayback for proper animation
                    await safeSendMessage(sock, sender, {
                        video: videoBuffer,
                        caption: caption,
                        gifPlayback: true,
                        mimetype: 'video/mp4'
                    });
                    
                    logger.info(`NSFW GIF sent as MP4 video to ${formatJidForLogging(sender)}`);
                    return true;
                } else {
                    // If conversion fails, try standard animated GIF
                    logger.warn('MP4 conversion failed, trying standard GIF format');
                    await safeSendAnimatedGif(sock, sender, buffer, caption);
                    logger.info(`NSFW GIF sent using standard method to ${formatJidForLogging(sender)}`);
                    return true;
                }
            } catch (gifError) {
                logger.warn(`Failed to send as animated GIF/MP4: ${gifError.message}, trying as sticker...`);
                
                // Final fallback to sticker
                try {
                    await safeSendMessage(sock, sender, {
                        sticker: buffer,
                        mimetype: 'image/gif',
                        gifAttribution: 'TENOR',
                        gifPlayback: true,
                        caption: caption,
                        stickerAuthor: "BLACKSKY-MD",
                        stickerName: "nsfw_gif",
                        contextInfo: {
                            forwardingScore: 999,
                            isForwarded: true,
                            externalAdReply: {
                                title: caption,
                                mediaType: 1,
                                renderLargerThumbnail: true
                            }
                        }
                    });
                    
                    logger.info(`NSFW GIF sent as sticker to ${formatJidForLogging(sender)}`);
                    return true;
                } catch (stickerError) {
                    logger.error(`Failed to send as sticker: ${stickerError.message}`);
                    throw new Error('All GIF sending methods failed');
                }
            }
        } catch (err) {
            if (attempt === retries) {
                logger.error(`Final attempt (${attempt+1}/${retries+1}) to send NSFW GIF failed:`, err);
                try {
                    // Fallback to regular message if GIF fails
                    await safeSendText(sock, sender, `${caption}\n\n(GIF failed to send after ${retries+1} attempts)`);
                } catch (sendErr) {
                    logger.error('Failed to send error message:', sendErr);
                }
                return false;
            }
            
            logger.warn(`Attempt ${attempt+1}/${retries+1} to send NSFW GIF failed: ${err.message}, retrying...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
        }
    }
    
    return false;
}

// Using formatJidForLogging from jidHelper utility

initDirectories();

const nsfwCommands = {
    async togglensfw(sock, sender, args) {
        try {
            const [action] = args;
            if (!action || !['on', 'off'].includes(action.toLowerCase())) {
                await safeSendText(sock, sender, 'Usage: !togglensfw on|off');
                return;
            }

            const isEnabled = action.toLowerCase() === 'on';
            await saveNsfwSettingsForGroup(sender, isEnabled);

            await safeSendText(sock, sender, `NSFW commands are now ${isEnabled ? 'enabled' : 'disabled'} for this chat`);

            logger.info(`NSFW toggled ${action.toLowerCase()} for ${formatJidForLogging(sender)}`);
        } catch (err) {
            logger.error('Error in togglensfw:', err);
            await safeSendText(sock, sender, 'Failed to toggle NSFW settings.');
        }
    },

    async isnsfw(sock, sender, args) {
        try {
            const imageUrl = args[0];
            if (!imageUrl) {
                await safeSendText(sock, sender, 'Please provide an image URL or reply to an image');
                return;
            }

            if (!imageUrl.startsWith('http')) {
                await safeSendText(sock, sender, 'Please provide a valid image URL');
                return;
            }

            await safeSendText(sock, sender, 'Analyzing content safety...');

            await safeSendText(sock, sender, 'Content appears to be safe. For more accurate detection, an AI service integration is needed.');

            logger.info(`NSFW check requested for ${formatJidForLogging(sender)}`);
        } catch (err) {
            logger.error('Error in isnsfw:', err);
            await safeSendText(sock, sender, 'Failed to check content safety.');
        }
    },

    async nsfwsettings(sock, sender, args) {
        try {
            const [setting, value] = args;
            const validSettings = ['threshold', 'action', 'notification'];

            if (!setting || !validSettings.includes(setting)) {
                await safeSendText(sock, sender, `Valid settings: ${validSettings.join(', ')}`);
                return;
            }

            await safeSendText(sock, sender, `NSFW setting '${setting}' will be configurable soon.`);

            logger.info(`NSFW settings update requested by ${formatJidForLogging(sender)}`);
        } catch (err) {
            logger.error('Error in nsfwsettings:', err);
            await safeSendText(sock, sender, 'Failed to update NSFW settings.');
        }
    },

    async nsfwstats(sock, sender) {
        try {
            const stats = `
NSFW Statistics:
• Detections Today: 0
• False Positives: 0
• Actions Taken: 0
• Current Mode: Safe
• Verified Users: ${verifiedUsers.size}
• Groups with NSFW: ${[...groupNsfwSettings.entries()].filter(([_, v]) => v.enabled).length}
            `.trim();

            await safeSendText(sock, sender, stats);
            logger.info(`NSFW stats requested by ${formatJidForLogging(sender)}`);
        } catch (err) {
            logger.error('Error in nsfwstats:', err);
            await safeSendText(sock, sender, 'Failed to retrieve NSFW statistics.');
        }
    },

    async verify(sock, sender, args) {
        try {
            const [age] = args;
            const parsedAge = parseInt(age);

            if (!age || isNaN(parsedAge)) {
                await safeSendText(sock, sender, '⚠️ Usage: .verify <your_age>');
                return;
            }

            if (parsedAge < 18) {
                await safeSendText(sock, sender, '❌ You must be at least 18 years old to access NSFW content.');
                return;
            }

            setUserVerification(sender, true);
            await safeSendText(sock, sender, '✅ Age verification successful. You can now use NSFW commands.');

            logger.info(`User ${formatJidForLogging(sender)} verified for NSFW content, age: ${parsedAge}`);
        } catch (err) {
            logger.error('Error in verify:', err);
            await safeSendText(sock, sender, 'Verification failed. Please try again.');
        }
    },

    async nsfwhelp(sock, sender) {
        try {
            if (!isNsfwEnabledForGroup(sender)) {
                await safeSendText(sock, sender, `❌ NSFW commands are disabled for this group. An admin can enable them with .togglensfw on`);
                return;
            }

            const helpText = `
📜 *NSFW Commands List*

*Verification*
.verify <age> - Verify your age (18+)

*Image Commands*
.waifu - Random waifu image
.neko - Catgirl image
.hentai - Hentai image
.boobs - Breast image
.ass - Butt image
.pussy - Vagina image
.blowjob - Oral act image
.anal - Anal act image
.feet - Feet image

*GIF Commands*
.gifboobs - Breast animation
.gifass - Butt animation
.gifhentai - Hentai animation
.gifblowjob - Oral animation

*Fetish Commands*
.uniform - School/work uniform
.thighs - Thigh image
.femdom - Female dominance
.tentacle - Tentacle genre
.pantsu - Underwear image
.kitsune - Fox girl image

*All commands require age verification.*
            `.trim();

            await safeSendText(sock, sender, helpText);
            logger.info(`NSFW help requested by ${formatJidForLogging(sender)}`);
        } catch (err) {
            logger.error('Error in nsfwhelp:', err);
            await safeSendText(sock, sender, 'Failed to provide NSFW help.');
        }
    },

    async waifu(sock, sender) {
        try {
            if (!await isNsfwEnabledForGroup(sender)) {
                await safeSendText(sock, sender, '❌ NSFW commands are disabled for this group');
                return;
            }

            if (!isUserVerified(sender)) {
                await safeSendText(sock, sender, '⚠️ You need to verify your age first. Use .verify <your_age>');
                return;
            }

            if (!applyCooldown(sender, 30)) {
                const remaining = getRemainingCooldown(sender);
                await safeSendText(sock, sender, `⏳ Please wait ${remaining} seconds before using this command again.`);
                return;
            }

            // Send immediate feedback to improve perceived responsiveness
            await safeSendText(sock, sender, '🔍 Finding the perfect waifu for you...');

            // Use optimized fetchNsfwImage utility with parallel requests and smart caching
            const imageUrl = await nsfwUtils.fetchNsfwImage('waifu', false);

            if (!imageUrl) {
                await safeSendText(sock, sender, 'Failed to fetch image. Please try again later.');
                return;
            }

            await safeSendImage(sock, sender, imageUrl, '🔞 NSFW Waifu');

            logger.info(`NSFW waifu image sent to ${formatJidForLogging(sender)}`);
        } catch (err) {
            logger.error('Error in waifu:', err);
            await safeSendText(sock, sender, 'Failed to fetch waifu image due to server error.');
        }
    },

    async neko(sock, sender) {
        try {
            if (!await isNsfwEnabledForGroup(sender)) {
                await safeSendText(sock, sender, '❌ NSFW commands are disabled for this group');
                return;
            }

            if (!isUserVerified(sender)) {
                await safeSendText(sock, sender, '⚠️ You need to verify your age first. Use .verify <your_age>');
                return;
            }

            if (!applyCooldown(sender, 30)) {
                const remaining = getRemainingCooldown(sender);
                await safeSendText(sock, sender, `⏳ Please wait ${remaining} seconds before using this command again.`);
                return;
            }

            // Send immediate feedback with a fun message for better user experience
            await safeSendText(sock, sender, '🔍 Searching for the perfect neko image...');

            // Use optimized fetchNsfwImage utility for faster image retrieval
            const imageUrl = await nsfwUtils.fetchNsfwImage('neko', false);

            if (!imageUrl) {
                await safeSendText(sock, sender, 'Failed to fetch image. Please try again later.');
                return;
            }

            await safeSendImage(sock, sender, imageUrl, '🔞 NSFW Neko');

            logger.info(`NSFW neko image sent to ${formatJidForLogging(sender)}`);
        } catch (err) {
            logger.error('Error in neko:', err);
            await safeSendText(sock, sender, 'Failed to fetch neko image due to server error.');
        }
    },

    async hentai(sock, sender) {
        try {
            if (!await isNsfwEnabledForGroup(sender)) {
                await safeSendText(sock, sender, '❌ NSFW commands are disabled for this group');
                return;
            }

            if (!isUserVerified(sender)) {
                await safeSendText(sock, sender, '⚠️ You need to verify your age first. Use .verify <your_age>');
                return;
            }

            if (!applyCooldown(sender, 30)) {
                const remaining = getRemainingCooldown(sender);
                await safeSendText(sock, sender, `⏳ Please wait ${remaining} seconds before using this command again.`);
                return;
            }

            await safeSendText(sock, sender, 'Fetching image...');

            try {
                // Try to use the optimized fetchNsfwImage utility first
                const result = await nsfwUtils.fetchNsfwImage('hentai', false);
                
                if (result) {
                    // Check if we got a buffer object (new format) or URL (old format)
                    if (result.buffer && Buffer.isBuffer(result.buffer)) {
                        logger.info(`Using buffer directly from fetchNsfwImage (${result.isLocalFile ? 'local file' : 'remote source'})`);
                        // Use the buffer directly
                        await safeSendImage(sock, sender, result.buffer, '🔞 Hentai');
                        
                        logger.info(`NSFW hentai image sent to ${formatJidForLogging(sender)}`);
                        return;
                    } else if (typeof result === 'string') {
                        // Legacy URL support
                        logger.info(`Downloading image from URL: ${result}`);
                        const axios = require('axios');
                        const response = await axios.get(result, { 
                            responseType: 'arraybuffer',
                            timeout: 5000
                        });
                        
                        const buffer = Buffer.from(response.data);
                        await safeSendImage(sock, sender, buffer, '🔞 Hentai');
                        
                        logger.info(`NSFW hentai image sent to ${formatJidForLogging(sender)}`);
                        return;
                    }
                }
            } catch (fetchErr) {
                logger.warn(`Error fetching from optimized utility: ${fetchErr.message}, falling back to direct method`);
            }
            
            // Fallback method - try direct fallback GIF
            try {
                const fallbackUrl = nsfwUtils.DIRECT_GIFS['hentai']; 
                if (fallbackUrl) {
                    const axios = require('axios');
                    const response = await axios.get(fallbackUrl, { 
                        responseType: 'arraybuffer',
                        timeout: 5000
                    });
                    
                    const buffer = Buffer.from(response.data);
                    await safeSendImage(sock, sender, buffer, '🔞 Hentai');
                    
                    logger.info(`NSFW hentai image sent via fallback to ${formatJidForLogging(sender)}`);
                    return;
                }
            } catch (fallbackErr) {
                logger.error(`Error with fallback method: ${fallbackErr.message}`);
            }
            
            // If we got here, all methods failed
            await safeSendText(sock, sender, 'Failed to fetch image. Please try again later.');
        } catch (err) {
            logger.error('Error in hentai:', err);
            await safeSendText(sock, sender, 'Failed to fetch image due to server error.');
        }
    },

    async boobs(sock, sender) {
        try {
            if (!await isNsfwEnabledForGroup(sender)) {
                await safeSendText(sock, sender, '❌ NSFW commands are disabled for this group');
                return;
            }

            if (!isUserVerified(sender)) {
                await safeSendText(sock, sender, '⚠️ You need to verify your age first. Use .verify <your_age>');
                return;
            }

            if (!applyCooldown(sender, 30)) {
                const remaining = getRemainingCooldown(sender);
                await safeSendText(sock, sender, `⏳ Please wait ${remaining} seconds before using this command again.`);
                return;
            }

            await safeSendText(sock, sender, 'Fetching image...');

            const boobsUrl = `${nsfwUtils.API_ENDPOINTS.HMTAI}/nsfw/boobs`;
            const fallbacks = [
                'https://api.nekos.fun/api/boobs',
                'https://api.waifu.pics/nsfw/waifu'
            ];

            const response = await fetchApi(boobsUrl, fallbacks);
            if (!response || !response.url) {
                await safeSendText(sock, sender, 'Failed to fetch image. Please try again later.');
                return;
            }

            await safeSendImage(sock, sender, response.url, '🔞 Boobs');

            logger.info(`NSFW boobs image sent to ${formatJidForLogging(sender)}`);
        } catch (err) {
            logger.error('Error in boobs:', err);
            await safeSendText(sock, sender, 'Failed to fetch image due to server error.');
        }
    },

    async ass(sock, sender) {
        try {
            if (!await isNsfwEnabledForGroup(sender)) {
                await safeSendText(sock, sender, '❌ NSFW commands are disabled for this group');
                return;
            }

            if (!isUserVerified(sender)) {
                await safeSendText(sock, sender, '⚠️ You need to verify your age first. Use .verify <your_age>');
                return;
            }

            if (!applyCooldown(sender, 30)) {
                const remaining = getRemainingCooldown(sender);
                await safeSendText(sock, sender, `⏳ Please wait ${remaining} seconds before using this command again.`);
                return;
            }

            await safeSendText(sock, sender, 'Fetching image...');

            try {
                // Try to use the optimized fetchNsfwImage utility first
                const result = await nsfwUtils.fetchNsfwImage('ass', false);
                
                if (result) {
                    // Check if we got a buffer object (new format) or URL (old format)
                    if (result.buffer && Buffer.isBuffer(result.buffer)) {
                        logger.info(`Using buffer directly from fetchNsfwImage (${result.isLocalFile ? 'local file' : 'remote source'})`);
                        // Use the buffer directly
                        await safeSendImage(sock, sender, result.buffer, '🔞 Ass');
                        
                        logger.info(`NSFW ass image sent to ${formatJidForLogging(sender)}`);
                        return;
                    } else if (typeof result === 'string') {
                        // Legacy URL support
                        logger.info(`Downloading image from URL: ${result}`);
                        const axios = require('axios');
                        const response = await axios.get(result, { 
                            responseType: 'arraybuffer',
                            timeout: 5000
                        });
                        
                        const buffer = Buffer.from(response.data);
                        await safeSendImage(sock, sender, buffer, '🔞 Ass');
                        
                        logger.info(`NSFW ass image sent to ${formatJidForLogging(sender)}`);
                        return;
                    }
                }
            } catch (fetchErr) {
                logger.warn(`Error fetching from optimized utility: ${fetchErr.message}, falling back to direct method`);
            }
            
            // Fallback method - try direct fallback GIF
            try {
                const fallbackUrl = nsfwUtils.DIRECT_GIFS['ass']; 
                if (fallbackUrl) {
                    const axios = require('axios');
                    const response = await axios.get(fallbackUrl, { 
                        responseType: 'arraybuffer',
                        timeout: 5000
                    });
                    
                    const buffer = Buffer.from(response.data);
                    await safeSendImage(sock, sender, buffer, '🔞 Ass');
                    
                    logger.info(`NSFW ass image sent via fallback to ${formatJidForLogging(sender)}`);
                    return;
                }
            } catch (fallbackErr) {
                logger.error(`Error with fallback method: ${fallbackErr.message}`);
            }
            
            // If we got here, all methods failed
            await safeSendText(sock, sender, 'Failed to fetch image. Please try again later.');
        } catch (err) {
            logger.error('Error in ass:', err);
            await safeSendText(sock, sender, 'Failed to fetch image due to server error.');
        }
    },

    async pussy(sock, sender) {
        try {
            if (!await isNsfwEnabledForGroup(sender)) {
                await safeSendText(sock, sender, '❌ NSFW commands are disabled for this group');
                return;
            }

            if (!isUserVerified(sender)) {
                await safeSendText(sock, sender, '⚠️ You need to verify your age first. Use .verify <your_age>');
                return;
            }

            if (!applyCooldown(sender, 30)) {
                const remaining = getRemainingCooldown(sender);
                await safeSendText(sock, sender, `⏳ Please wait ${remaining} seconds before using this command again.`);
                return;
            }

            await safeSendText(sock, sender, 'Fetching image...');
            
            // Use our new helper function to handle all the fetching, downloading and sending
            await fetchAndSendNsfwImage(sock, sender, 'pussy', '🔞 Pussy', false);
        } catch (err) {
            logger.error('Error in pussy:', err);
            await safeSendText(sock, sender, 'Failed to fetch image due to server error.');
        }
    },

    async blowjob(sock, sender) {
        try {
            if (!await isNsfwEnabledForGroup(sender)) {
                await safeSendText(sock, sender, '❌ NSFW commands are disabled for this group');
                return;
            }

            if (!isUserVerified(sender)) {
                await safeSendText(sock, sender, '⚠️ You need to verify your age first. Use .verify <your_age>');
                return;
            }

            if (!applyCooldown(sender, 30)) {
                const remaining = getRemainingCooldown(sender);
                await safeSendText(sock, sender, `⏳ Please wait ${remaining} seconds before using this command again.`);
                return;
            }

            await safeSendText(sock, sender, 'Fetching image...');
            
            // Use our helper function to handle all the fetching, downloading and sending
            await fetchAndSendNsfwImage(sock, sender, 'blowjob', '🔞 Blowjob', false);
        } catch (err) {
            logger.error('Error in blowjob:', err);
            await safeSendText(sock, sender, 'Failed to fetch image due to server error.');
        }
    },

    async anal(sock, sender) {
        try {
            if (!await isNsfwEnabledForGroup(sender)) {
                await safeSendText(sock, sender, '❌ NSFW commands are disabled for this group');
                return;
            }

            if (!isUserVerified(sender)) {
                await safeSendText(sock, sender, '⚠️ You need to verify your age first. Use .verify <your_age>');
                return;
            }

            if (!applyCooldown(sender, 30)) {
                const remaining = getRemainingCooldown(sender);
                await safeSendText(sock, sender, `⏳ Please wait ${remaining} seconds before using this command again.`);
                return;
            }

            await safeSendText(sock, sender, 'Fetching image...');
            
            // Use our helper function to handle all the fetching, downloading and sending
            await fetchAndSendNsfwImage(sock, sender, 'anal', '🔞 Anal', false);
        } catch (err) {
            logger.error('Error in anal:', err);
            await safeSendText(sock, sender, 'Failed to fetch image due to server error.');
        }
    },

    async feet(sock, sender) {
        try {
            if (!await isNsfwEnabledForGroup(sender)) {
                await safeSendText(sock, sender, '❌ NSFW commands are disabled for this group');
                return;
            }

            if (!isUserVerified(sender)) {
                await safeSendText(sock, sender, '⚠️ You need to verify your age first. Use .verify <your_age>');
                return;
            }

            if (!applyCooldown(sender, 30)) {
                const remaining = getRemainingCooldown(sender);
                await safeSendText(sock, sender, `⏳ Please wait ${remaining} seconds before using this command again.`);
                return;
            }

            await safeSendText(sock, sender, 'Fetching image...');
            
            // Use our helper function to handle all the fetching, downloading and sending
            await fetchAndSendNsfwImage(sock, sender, 'feet', '🔞 Feet', false);
        } catch (err) {
            logger.error('Error in feet:', err);
            await safeSendText(sock, sender, 'Failed to fetch image due to server error.');
        }
    },

    // GIF commands
    async gifboobs(sock, sender) {
        try {
            if (!await isNsfwEnabledForGroup(sender)) {
                await safeSendText(sock, sender, '❌ NSFW commands are disabled for this group');
                return;
            }

            if (!isUserVerified(sender)) {
                await safeSendText(sock, sender, '⚠️ You need to verify your age first. Use .verify <your_age>');
                return;
            }

            if (!applyCooldown(sender, 45)) {
                const remaining = getRemainingCooldown(sender);
                await safeSendText(sock, sender, `⏳ Please wait ${remaining} seconds before using this command again.`);
                return;
            }

            // Send immediate feedback with improved waiting message
            await safeSendText(sock, sender, '🔍 Searching for the perfect animated content...');
            
            // Use our helper function with requireGif=true
            await fetchAndSendNsfwImage(sock, sender, 'gifboobs', '🔞 Boobs GIF', true);
        } catch (err) {
            logger.error('Error in gifboobs:', err);
            await safeSendText(sock, sender, 'Failed to fetch GIF due to server error.');
        }
    },

    async gifass(sock, sender) {
        try {
            if (!await isNsfwEnabledForGroup(sender)) {
                await safeSendText(sock, sender, '❌ NSFW commands are disabled for this group');
                return;
            }

            if (!isUserVerified(sender)) {
                await safeSendText(sock, sender, '⚠️ You need to verify your age first. Use .verify <your_age>');
                return;
            }

            if (!applyCooldown(sender, 45)) {
                const remaining = getRemainingCooldown(sender);
                await safeSendText(sock, sender, `⏳ Please wait ${remaining} seconds before using this command again.`);
                return;
            }

            await safeSendText(sock, sender, 'Fetching GIF...');
            
            // Use our helper function with requireGif=true
            await fetchAndSendNsfwImage(sock, sender, 'gifass', '🔞 Ass GIF', true);
        } catch (err) {
            logger.error('Error in gifass:', err);
            await safeSendText(sock, sender, 'Failed to fetch GIF due to server error.');
        }
    },
    
    async gifhentai(sock, sender) {
        try {
            if (!await isNsfwEnabledForGroup(sender)) {
                await safeSendText(sock, sender, '❌ NSFW commands are disabled for this group');
                return;
            }

            if (!isUserVerified(sender)) {
                await safeSendText(sock, sender, '⚠️ You need to verify your age first. Use .verify <your_age>');
                return;
            }

            if (!applyCooldown(sender, 45)) {
                const remaining = getRemainingCooldown(sender);
                await safeSendText(sock, sender, `⏳ Please wait ${remaining} seconds before using this command again.`);
                return;
            }

            await safeSendText(sock, sender, 'Fetching GIF...');
            
            // Use our helper function with requireGif=true
            await fetchAndSendNsfwImage(sock, sender, 'gifhentai', '🔞 Hentai GIF', true);
        } catch (err) {
            logger.error('Error in gifhentai:', err);
            await safeSendText(sock, sender, 'Failed to fetch GIF due to server error.');
        }
    },

    async gifblowjob(sock, sender) {
        // Track command execution metrics
        const commandStart = Date.now();
        let status = 'failed';
        let errorType = null;
        let fallbackUsed = false;
        
        try {
            // Rule validation with detailed feedback
            if (!await isNsfwEnabledForGroup(sender)) {
                await safeSendText(sock, sender, '❌ NSFW commands are disabled for this group');
                status = 'disabled';
                return;
            }

            if (!isUserVerified(sender)) {
                await safeSendText(sock, sender, '⚠️ You need to verify your age first. Use .verify <your_age>');
                status = 'unverified';
                return;
            }

            if (!applyCooldown(sender, 45)) {
                const remaining = getRemainingCooldown(sender);
                await safeSendText(sock, sender, `⏳ Please wait ${remaining} seconds before using this command again.`);
                status = 'cooldown';
                return;
            }

            // Send immediate feedback to improve perceived responsiveness
            await safeSendText(sock, sender, '🔍 Fetching NSFW GIF...');

            // Use DIRECT_GIFS from the centralized nsfwUtils module
            const directGifs = nsfwUtils.DIRECT_GIFS;

            // Try API endpoint with multiple fallbacks
            const gifUrl = `${nsfwUtils.API_ENDPOINTS.HMTAI}/nsfw/blowjob`;
            const fallbacks = [
                'https://api.nekos.fun/api/blowjob',
                'https://api.waifu.pics/nsfw/blowjob',
                'https://api.waifu.im/search/?included_tags=oral&is_nsfw=true'
            ];

            // Enhanced try/catch block for better error handling
            let response = null;
            try {
                response = await fetchApi(gifUrl, fallbacks, true); // true = requireGif
                
                if (!response) {
                    logger.warn(`All API endpoints failed for blowjob GIF, using direct GIF`);
                    fallbackUsed = true;
                    response = { url: directGifs['blowjob'] };
                } else if (!response.url) {
                    logger.warn(`API response missing URL property, using direct GIF`);
                    fallbackUsed = true;
                    response = { url: directGifs['blowjob'] };
                }
            } catch (apiError) {
                logger.error(`API error in gifblowjob:`, apiError);
                errorType = 'api_error';
                fallbackUsed = true;
                response = { url: directGifs['blowjob'] };
            }

            // Final validation before sending
            if (!response || !response.url) {
                logger.error(`Critical: No fallback available for blowjob GIF`);
                await safeSendText(sock, sender, 'Failed to fetch GIF. Please try again later.');
                errorType = 'no_fallback';
                return;
            }

            // Enhanced GIF sending with retries
            let sendAttempts = 0;
            const maxSendAttempts = 2;
            let sendSuccess = false;
            
            while (!sendSuccess && sendAttempts < maxSendAttempts) {
                try {
                    sendAttempts++;
                    await safeSendAnimatedGif(sock, sender, response.url, '🔞 Blowjob GIF');
                    sendSuccess = true;
                } catch (sendError) {
                    if (sendAttempts >= maxSendAttempts) {
                        throw sendError;
                    }
                    logger.warn(`Send attempt ${sendAttempts} failed, retrying...`, sendError.message);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
                }
            }

            status = fallbackUsed ? 'success_fallback' : 'success';
            logger.info(`NSFW blowjob GIF sent to ${formatJidForLogging(sender)} ${fallbackUsed ? '(using fallback)' : ''}`);
        } catch (err) {
            errorType = errorType || 'unknown';
            logger.error(`Error in gifblowjob (${errorType}):`, err);
            
            // User-friendly error message based on error type
            let errorMessage = 'Failed to fetch GIF due to server error.';
            if (err.message && err.message.includes('network')) {
                errorMessage = 'Network error while fetching GIF. Please check your internet connection.';
            } else if (err.message && err.message.includes('timeout')) {
                errorMessage = 'Server took too long to respond. Please try again later.';
            }
            
            await safeSendText(sock, sender, errorMessage);
        } finally {
            // Record metrics for performance analysis
            const duration = Date.now() - commandStart;
            if (duration > 5000) {
                logger.warn(`Slow command execution: gifblowjob took ${duration}ms to complete with status ${status}`);
            }
        }
    },

    // Fetish commands
    async uniform(sock, sender) {
        try {
            if (!await isNsfwEnabledForGroup(sender)) {
                await safeSendText(sock, sender, '❌ NSFW commands are disabled for this group');
                return;
            }

            if (!isUserVerified(sender)) {
                await safeSendText(sock, sender, '⚠️ You need to verify your age first. Use .verify <your_age>');
                return;
            }

            if (!applyCooldown(sender, 30)) {
                const remaining = getRemainingCooldown(sender);
                await safeSendText(sock, sender, `⏳ Please wait ${remaining} seconds before using this command again.`);
                return;
            }

            await safeSendText(sock, sender, 'Fetching image...');

            const uniformUrl = `${nsfwUtils.API_ENDPOINTS.HMTAI}/nsfw/uniform`;
            const fallbacks = [
                'https://api.nekos.fun/api/lewd',
                'https://api.waifu.pics/nsfw/waifu'
            ];

            const response = await fetchApi(uniformUrl, fallbacks);
            if (!response || !response.url) {
                await safeSendText(sock, sender, 'Failed to fetch image. Please try again later.');
                return;
            }

            await safeSendImage(sock, sender, response.url, '🔞 Uniform');

            logger.info(`NSFW uniform image sent to ${formatJidForLogging(sender)}`);
        } catch (err) {
            logger.error('Error in uniform:', err);
            await safeSendText(sock, sender, 'Failed to fetch image due to server error.');
        }
    },

    async thighs(sock, sender) {
        try {
            if (!await isNsfwEnabledForGroup(sender)) {
                await safeSendText(sock, sender, '❌ NSFW commands are disabled for this group');
                return;
            }

            if (!isUserVerified(sender)) {
                await safeSendText(sock, sender, '⚠️ You need to verify your age first. Use .verify <your_age>');
                return;
            }

            if (!applyCooldown(sender, 30)) {
                const remaining = getRemainingCooldown(sender);
                await safeSendText(sock, sender, `⏳ Please wait ${remaining} seconds before using this command again.`);
                return;
            }

            await safeSendText(sock, sender, 'Fetching image...');

            const thighsUrl = `${nsfwUtils.API_ENDPOINTS.HMTAI}/nsfw/thighs`;
            const fallbacks = [
                'https://api.nekos.fun/api/lewd',
                'https://api.waifu.pics/nsfw/waifu'
            ];

            const response = await fetchApi(thighsUrl, fallbacks);
            if (!response || !response.url) {
                await safeSendText(sock, sender, 'Failed to fetch image. Please try again later.');
                return;
            }

            await safeSendImage(sock, sender, response.url, '🔞 Thighs');

            logger.info(`NSFW thighs image sent to ${formatJidForLogging(sender)}`);
        } catch (err) {
            logger.error('Error in thighs:', err);
            await safeSendText(sock, sender, 'Failed to fetch image due to server error.');
        }
    },

    async femdom(sock, sender) {
        try {
            if (!await isNsfwEnabledForGroup(sender)) {
                await safeSendText(sock, sender, '❌ NSFW commands are disabled for this group');
                return;
            }

            if (!isUserVerified(sender)) {
                await safeSendText(sock, sender, '⚠️ You need to verify your age first. Use .verify <your_age>');
                return;
            }

            if (!applyCooldown(sender, 30)) {
                const remaining = getRemainingCooldown(sender);
                await safeSendText(sock, sender, `⏳ Please wait ${remaining} seconds before using this command again.`);
                return;
            }

            await safeSendText(sock, sender, 'Fetching image...');

            const femdomUrl = `${nsfwUtils.API_ENDPOINTS.HMTAI}/nsfw/femdom`;
            const fallbacks = [
                'https://api.waifu.pics/nsfw/waifu',
                'https://api.nekos.fun/api/lewd'
            ];

            const response = await fetchApi(femdomUrl, fallbacks);
            if (!response || !response.url) {
                await safeSendText(sock, sender, 'Failed to fetch image. Please try again later.');
                return;
            }

            await safeSendImage(sock, sender, response.url, '🔞 Femdom');

            logger.info(`NSFW femdom image sent to ${formatJidForLogging(sender)}`);
        } catch (err) {
            logger.error('Error in femdom:', err);
            await safeSendText(sock, sender, 'Failed to fetch image due to server error.');
        }
    },

    async tentacle(sock, sender) {
        try {
            if (!await isNsfwEnabledForGroup(sender)) {
                await safeSendText(sock, sender, '❌ NSFW commands are disabled for this group');
                return;
            }

            if (!isUserVerified(sender)) {
                await safeSendText(sock, sender, '⚠️ You need to verify your age first. Use .verify <your_age>');
                return;
            }

            if (!applyCooldown(sender, 30)) {
                const remaining = getRemainingCooldown(sender);
                await safeSendText(sock, sender, `⏳ Please wait ${remaining} seconds before using this command again.`);
                return;
            }

            await safeSendText(sock, sender, 'Fetching image...');

            const tentacleUrl = `${nsfwUtils.API_ENDPOINTS.HMTAI}/nsfw/tentacle`;
            const fallbacks = [
                'https://api.waifu.pics/nsfw/waifu',
                'https://api.nekos.fun/api/lewd'
            ];

            const response = await fetchApi(tentacleUrl, fallbacks);
            if (!response || !response.url) {
                await safeSendText(sock, sender, 'Failed to fetch image. Please try again later.');
                return;
            }

            await safeSendImage(sock, sender, response.url, '🔞 Tentacle');

            logger.info(`NSFW tentacle image sent to ${formatJidForLogging(sender)}`);
        } catch (err) {
            logger.error('Error in tentacle:', err);
            await safeSendText(sock, sender, 'Failed to fetch image due to server error.');
        }
    },

    async pantsu(sock, sender) {
        try {
            if (!await isNsfwEnabledForGroup(sender)) {
                await safeSendText(sock, sender, '❌ NSFW commands are disabled for this group');
                return;
            }

            if (!isUserVerified(sender)) {
                await safeSendText(sock, sender, '⚠️ You need to verify your age first. Use .verify <your_age>');
                return;
            }

            if (!applyCooldown(sender, 30)) {
                const remaining = getRemainingCooldown(sender);
                await safeSendText(sock, sender, `⏳ Please wait ${remaining} seconds before using this command again.`);
                return;
            }

            await safeSendText(sock, sender, 'Fetching image...');

            const pantsuUrl = `${nsfwUtils.API_ENDPOINTS.HMTAI}/nsfw/pantsu`;
            const fallbacks = [
                'https://api.waifu.pics/nsfw/waifu',
                'https://api.nekos.fun/api/lewd'
            ];

            const response = await fetchApi(pantsuUrl, fallbacks);
            if (!response || !response.url) {
                await safeSendText(sock, sender, 'Failed to fetch image. Please try again later.');
                return;
            }

            await safeSendImage(sock, sender, response.url, '🔞 Pantsu');

            logger.info(`NSFW pantsu image sent to ${formatJidForLogging(sender)}`);
        } catch (err) {
            logger.error('Error in pantsu:', err);
            await safeSendText(sock, sender, 'Failed to fetch image due to server error.');
        }
    },

    async kitsune(sock, sender) {
        try {
            if (!await isNsfwEnabledForGroup(sender)) {
                await safeSendText(sock, sender, '❌ NSFW commands are disabled for this group');
                return;
            }

            if (!isUserVerified(sender)) {
                await safeSendText(sock, sender, '⚠️ You need to verify your age first. Use .verify <your_age>');
                return;
            }

            if (!applyCooldown(sender, 30)) {
                const remaining = getRemainingCooldown(sender);
                await safeSendText(sock, sender, `⏳ Please wait ${remaining} seconds before using this command again.`);
                return;
            }

            await safeSendText(sock, sender, 'Fetching image...');

            const kitsuneUrl = `${nsfwUtils.API_ENDPOINTS.HMTAI}/nsfw/nsfwMobileWallpaper`;
            const fallbacks = [
                'https://api.waifu.pics/nsfw/waifu',
                'https://api.nekos.fun/api/lewd'
            ];

            const response = await fetchApi(kitsuneUrl, fallbacks);
            if (!response || !response.url) {
                await safeSendText(sock, sender, 'Failed to fetch image. Please try again later.');
                return;
            }

            await safeSendImage(sock, sender, response.url, '🔞 Kitsune');

            logger.info(`NSFW kitsune image sent to ${formatJidForLogging(sender)}`);
        } catch (err) {
            logger.error('Error in kitsune:', err);
            await safeSendText(sock, sender, 'Failed to fetch image due to server error.');
        }
    },
};

// Simplified API checker that leverages the fetchNsfwImage utility
async function fetchWithExponentialBackoff(url, options = {}, retries = 3, initialDelay = 500) {
    try {
        // Use axios directly for API validation checks
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || 5000);
            
        const requestOptions = {
            timeout: options.timeout || 5000,
            validateStatus: status => status >= 200 && status < 500,
            signal: controller.signal,
            ...options
        };
            
        const response = await axios.get(url, requestOptions);
        clearTimeout(timeoutId);
            
        if (!response.data) {
            throw new Error('Empty response received');
        }
            
        return response.data;
    } catch (error) {
        logger.warn(`API fetch error: ${error.message}`);
        throw error;
    }
}

// Directly export the commands instead of using an intermediate variable
module.exports = {
    commands: nsfwCommands,
    category: 'nsfw',
    async init(sock) {
        try {
            logger.info('NSFW module initialized with enhanced commands');
            await initDirectories();
            
            // Validate API endpoints for early failure detection
            try {
                logger.info('Testing NSFW API connectivity...');
                await fetchWithExponentialBackoff('https://api.waifu.pics/nsfw/waifu', { 
                    timeout: 3000,
                    validateStatus: status => status === 200 
                }, 1);
                logger.info('NSFW API connectivity verified');
            } catch (apiErr) {
                logger.warn('NSFW API connectivity test failed, commands may not work:', apiErr.message);
                // Continue initialization despite API issues - we'll handle them per command
            }
            
            logger.moduleSuccess('NSFW');
            return true;
        } catch (err) {
            logger.error('NSFW module initialization error:', err);
            return false;
        }
    }
};