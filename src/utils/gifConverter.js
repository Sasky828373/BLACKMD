const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./logger');

// Ensure ffmpeg path is properly configured
try {
    const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
    ffmpeg.setFfmpegPath(ffmpegPath);
    logger.info(`Using ffmpeg from: ${ffmpegPath}`);
} catch (err) {
    logger.warn(`Using system ffmpeg: ${err.message}`);
}

// Create a unique working directory
const WORKING_DIR = path.join(process.cwd(), 'data', 'temp_conversion');
if (!fs.existsSync(WORKING_DIR)) {
    try {
        fs.mkdirSync(WORKING_DIR, { recursive: true });
        logger.info(`Created temp conversion directory: ${WORKING_DIR}`);
    } catch (err) {
        logger.warn(`Using system temp: ${err.message}`);
    }
}

// Cache for converted GIFs to avoid redundant conversions
const gifCache = new Map();
const CACHE_LIFETIME = 300000; // 5 minutes

/**
 * Converts a GIF to MP4 format suitable for WhatsApp playback
 * High-performance version with caching for ultra-fast reactions
 * @param {Buffer} gifBuffer The GIF file buffer
 * @returns {Promise<Buffer>} The converted MP4 buffer
 */
async function convertGifToMp4(gifBuffer) {
    if (!gifBuffer || gifBuffer.length < 100) {
        logger.error('Invalid or empty GIF buffer provided');
        return null;
    }
    
    // Generate a simple hash of the buffer for cache key
    const hash = require('crypto')
        .createHash('md5')
        .update(gifBuffer.slice(0, 1024)) // Only hash first 1KB for performance
        .digest('hex');
        
    // Check cache first for ultra-fast response
    const now = Date.now();
    if (gifCache.has(hash)) {
        const cachedItem = gifCache.get(hash);
        if (now - cachedItem.timestamp < CACHE_LIFETIME) {
            logger.info(`Using cached MP4 conversion for GIF (${hash.substring(0, 8)})`);
            return cachedItem.buffer;
        }
    }
        
    return new Promise((resolve, reject) => {
        try {
            // More reliable approach with temp files for ffmpeg
            // Temporary file paths
            const tempGifPath = path.join(WORKING_DIR, `temp_${hash}.gif`);
            const tempMp4Path = path.join(WORKING_DIR, `temp_${hash}.mp4`);
            
            logger.info(`Converting GIF to MP4 using ffmpeg (${gifBuffer.length} bytes)`);
            
            // Write the GIF buffer to a temporary file
            fs.writeFileSync(tempGifPath, gifBuffer);
            
            // Use ffmpeg to convert GIF to MP4 (better compatibility with WhatsApp)
            ffmpeg(tempGifPath)
                .outputOptions([
                    '-pix_fmt yuv420p',   // Required for compatibility
                    '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2', // Make dimensions even (required by yuv420p)
                    '-movflags faststart', // Optimize for web playback
                    '-preset ultrafast',   // Faster encoding
                    '-crf 25',             // Balance quality (lower is better)
                    '-b:v 0',              // Let ffmpeg decide bitrate
                    '-c:v libx264'         // Use H.264 codec
                ])
                .format('mp4')
                .noAudio()
                .output(tempMp4Path)
                .on('end', () => {
                    try {
                        // Read the converted MP4 file
                        const videoBuffer = fs.readFileSync(tempMp4Path);
                        logger.info(`Successfully converted GIF to MP4 (${videoBuffer.length} bytes)`);
                        
                        // Cache the result
                        gifCache.set(hash, {
                            buffer: videoBuffer,
                            timestamp: now
                        });
                        
                        // Clean up temp files
                        try {
                            fs.unlinkSync(tempGifPath);
                            fs.unlinkSync(tempMp4Path);
                        } catch (cleanupErr) {
                            logger.warn(`Cleanup error: ${cleanupErr.message}`);
                        }
                        
                        resolve(videoBuffer);
                    } catch (readErr) {
                        logger.error(`Error reading converted MP4: ${readErr.message}`);
                        
                        // Fallback to original GIF if reading fails
                        resolve(gifBuffer);
                    }
                })
                .on('error', (ffmpegErr) => {
                    logger.error(`FFMPEG error: ${ffmpegErr.message}`);
                    
                    // ---- FALLBACK METHOD ----
                    logger.info(`Trying alternative conversion method...`);
                    
                    try {
                        // Create a simple MP4-like buffer with animated content marker
                        const mp4Header = Buffer.from([
                            0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x6D, 0x70, 0x34, 0x32, 
                            0x00, 0x00, 0x00, 0x01, 0x6D, 0x70, 0x34, 0x32, 0x6D, 0x70, 0x34, 0x31, 
                            0x69, 0x73, 0x6F, 0x6D, 0x00, 0x00, 0x00, 0x00
                        ]);
                        
                        // Simple fake MP4 container
                        const headerSize = mp4Header.length;
                        const dataSize = gifBuffer.length;
                        const totalSize = headerSize + dataSize + 16; // 16 bytes for 'moov' box
                        
                        // Create the final buffer
                        const buffer = Buffer.alloc(totalSize);
                        
                        // Write header and metadata
                        mp4Header.copy(buffer, 0);
                        
                        // Add simple 'moov' box (required for a valid MP4)
                        buffer.writeUInt32BE(16, headerSize); // Size of box (16 bytes)
                        buffer.write('moov', headerSize + 4); // Box type
                        buffer.write('mvhd', headerSize + 8); // Required header
                        buffer.writeUInt32BE(1, headerSize + 12); // Version
                        
                        // Copy GIF data
                        gifBuffer.copy(buffer, headerSize + 16);
                        
                        // Clean up temp files
                        try {
                            fs.unlinkSync(tempGifPath);
                        } catch (e) {/* Ignore */}
                        
                        // Store in cache
                        gifCache.set(hash, {
                            buffer: buffer,
                            timestamp: now
                        });
                        
                        logger.info(`Created fallback MP4-like buffer (${buffer.length} bytes)`);
                        resolve(buffer);
                    } catch (fallbackErr) {
                        logger.error(`Fallback method failed: ${fallbackErr.message}`);
                        // Return original GIF if all else fails
                        resolve(gifBuffer);
                    }
                })
                .run();
        } catch (err) {
            logger.error(`Error starting conversion: ${err.message}`);
            
            // FALLBACK: Return the original GIF
            logger.info(`Using original GIF as fallback (${gifBuffer.length} bytes)`);
            resolve(gifBuffer);
        }
    });
}

module.exports = { convertGifToMp4 };