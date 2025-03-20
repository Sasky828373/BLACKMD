const logger = require('../utils/logger');
const config = require('../config/config');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { writeExifToWebp } = require('../utils/stickerMetadata');
const axios = require('axios');
const FormData = require('form-data');
const audioQueue = new Map();
const ytdl = require('ytdl-core');
const youtubeDl = require('youtube-dl-exec');
const yts = require('yt-search');
const { getLyrics } = require('genius-lyrics-api');
const webp = require('node-webpmux');
const { isFeatureEnabled } = require('../utils/groupSettings');
const { safeSendText, safeSendMessage, safeSendImage } = require('../utils/jidHelper');

// Initialize required directories
const initializeDirectories = async () => {
    try {
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) {
            await fsPromises.mkdir(tempDir, { recursive: true });
            logger.info('Media temp directory created successfully');
        }
        return true;
    } catch (err) {
        logger.error('Failed to initialize media directories:', err);
        return false;
    }
};

// Initialize module
const init = async () => {
    try {
        return await initializeDirectories();
    } catch (err) {
        logger.error('Failed to initialize media module:', err);
        return false;
    }
};

/**
 * Helper function to check if media commands are enabled for a group
 * @param {Object} sock WhatsApp socket
 * @param {string} remoteJid Group or sender JID
 * @returns {Promise<boolean>} Whether media commands are enabled
 */
async function areMediaCommandsEnabled(sock, remoteJid) {
    // If it's a group, check if media feature is enabled
    if (remoteJid.endsWith('g.us')) {
        const mediaEnabled = await isFeatureEnabled(remoteJid, 'media');
        if (!mediaEnabled) {
            await safeSendText(sock, remoteJid, '❌ Media commands are disabled in this group. Ask an admin to enable them with *.feature media on*' 
            );
            return false;
        }
    }
    return true;
}

// Helper function for audio queue management
const playNextInQueue = async (sock, sender) => {
    const queue = audioQueue.get(sender);
    if (queue && queue.length > 0) {
        const audioBuffer = queue.shift();
        try {
            // Add fileName property and ensure JID is properly handled
            await safeSendMessage(sock, sender, { 
                audio: { url: audioBuffer },
                mimetype: 'audio/mp3',
                fileName: `audio_${Date.now()}.mp3`
            });
            if(queue.length > 0) {
                setTimeout(() => playNextInQueue(sock, sender), 1000);
            } else {
                audioQueue.delete(sender);
            }
        } catch (err) {
            logger.error('Error playing audio:', err);
            await safeSendText(sock, sender, '*❌ Error:* Failed to play audio. Please try again.' );
        }
    }
};

// Media command handlers
const mediaCommands = {
    async play(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;
            
            // Check if media commands are enabled for this group
            if (!(await areMediaCommandsEnabled(sock, remoteJid))) {
                return;
            }
            
            // Handle the case when replying to an audio message
            const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quotedMessage && quotedMessage.audioMessage) {
                try {
                    // Extract and send back the quoted audio
                    const buffer = await downloadMediaMessage(
                        { message: { audioMessage: quotedMessage.audioMessage } },
                        'buffer',
                        {}
                    );
                    
                    await safeSendMessage(sock, remoteJid, {
                        audio: { url: buffer },
                        mimetype: quotedMessage.audioMessage.mimetype || 'audio/mp4',
                        ptt: false
                    });
                    return;
                } catch (err) {
                    logger.error('Error processing quoted audio:', err);
                    throw new Error('Failed to process audio message');
                }
            }
            
            if (!args.length) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* Reply to an audio message or provide a search term' );
                return;
            }

            // For YouTube searches, we'll use a different approach since YouTube API restrictions are in place
            await safeSendText(sock, remoteJid, '*🔍 Searching:* Looking for your requested audio...' );

            try {
                // Search YouTube
                const searchResults = await yts(args.join(' '));
                if (!searchResults.videos.length) {
                    await safeSendText(sock, remoteJid, '*❌ Error:* No results found' );
                    return;
                }
                
                // Instead of trying to download (which gets blocked), we'll send info about the video
                const video = searchResults.videos[0];
                
                // Format duration
                const duration = video.duration?.timestamp || 'Unknown';
                
                // Create a rich text response with the video details
                const responseText = `*🎵 Found:* ${video.title}\n\n` +
                    `*👤 Channel:* ${video.author.name}\n` +
                    `*⏱️ Duration:* ${duration}\n` +
                    `*👁️ Views:* ${video.views.toLocaleString()}\n` +
                    `*📅 Published:* ${video.ago}\n\n` +
                    `*🔗 Link:* ${video.url}\n\n` +
                    `*ℹ️ Note:* Due to YouTube restrictions, direct downloads are currently unavailable.`;
                
                // Fetch the thumbnail and send it with the information
                try {
                    const thumbnailUrl = video.thumbnail;
                    await safeSendMessage(sock, remoteJid, {
                        image: { url: thumbnailUrl },
                        caption: responseText
                    });
                } catch (thumbnailErr) {
                    // If thumbnail fails, just send the text
                    logger.error('Error sending thumbnail:', thumbnailErr);
                    await safeSendText(sock, remoteJid, responseText);
                }
            } catch (searchErr) {
                logger.error('Search error:', searchErr);
                await safeSendText(sock, remoteJid, '*❌ Error:* Failed to search for audio. Please try again later.');
            }
        } catch (err) {
            logger.error('Error in play command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to play audio. The service might be temporarily unavailable.' );
        }
    },

    async sticker(sock, message) {
        try {
            const remoteJid = message.key.remoteJid;
            
            // Check if media commands are enabled for this group
            if (!(await areMediaCommandsEnabled(sock, remoteJid))) {
                return;
            }
            
            if (!message.message?.imageMessage && !message.message?.videoMessage) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* Reply to an image/video with .sticker' );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Creating sticker...' );

            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            const inputPath = path.join(tempDir, `input_${Date.now()}`);
            const outputPath = path.join(tempDir, `output_${Date.now()}.webp`);

            await fsPromises.writeFile(inputPath, buffer);

            // Convert to WebP
            await sharp(buffer)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .webp()
                .toFile(outputPath);

            await safeSendMessage(sock, remoteJid, {
                sticker: { url: outputPath }
            });

            // Cleanup
            await fsPromises.unlink(inputPath);
            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in sticker command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to create sticker' );
        }
    },

    async toimg(sock, message) {
        try {
            const remoteJid = message.key.remoteJid;
            
            // Check if media commands are enabled for this group
            if (!(await areMediaCommandsEnabled(sock, remoteJid))) {
                return;
            }
            
            if (!message.message?.stickerMessage) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* Reply to a sticker with .toimg' );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Converting sticker to image...' );

            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            const outputPath = path.join(tempDir, `${Date.now()}.png`);

            await sharp(buffer)
                .png()
                .toFile(outputPath);

            await safeSendMessage(sock, remoteJid, {
                image: { url: outputPath },
                caption: '✅ Here\'s your image!'
            });

            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in toimg command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to convert sticker to image' );
        }
    },

    async ytmp3(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;
            
            // Check if media commands are enabled for this group
            if (!(await areMediaCommandsEnabled(sock, remoteJid))) {
                return;
            }
            
            if (!args[0]) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* .ytmp3 [YouTube URL]' );
                return;
            }

            await safeSendText(sock, remoteJid, '*🔍 Analyzing:* Getting video information...' );

            try {
                // Get video info using ytdl-core to provide metadata
                const videoInfo = await ytdl.getInfo(args[0]);
                const videoDetails = videoInfo.videoDetails;
                
                // Format duration in minutes and seconds
                const durationInSeconds = parseInt(videoDetails.lengthSeconds);
                const minutes = Math.floor(durationInSeconds / 60);
                const seconds = durationInSeconds % 60;
                const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                
                // Format view count
                const viewCount = parseInt(videoDetails.viewCount).toLocaleString();
                
                // Create response message
                const responseText = `*🎵 Video Information:* \n\n` +
                    `*📝 Title:* ${videoDetails.title}\n` +
                    `*👤 Channel:* ${videoDetails.author.name}\n` +
                    `*⏱️ Duration:* ${formattedDuration}\n` +
                    `*👁️ Views:* ${viewCount}\n` +
                    `*📅 Published:* ${videoDetails.publishDate || 'Unknown'}\n\n` +
                    `*🔗 Link:* ${videoDetails.video_url}\n\n` +
                    `*ℹ️ Note:* Due to YouTube restrictions, direct downloads are currently unavailable.`;
                
                // Attempt to get a thumbnail
                try {
                    // Get highest quality thumbnail
                    const thumbnails = videoDetails.thumbnails;
                    const highestQualityThumbnail = thumbnails[thumbnails.length - 1].url;
                    
                    await safeSendMessage(sock, remoteJid, {
                        image: { url: highestQualityThumbnail },
                        caption: responseText
                    });
                } catch (thumbnailErr) {
                    // If thumbnail fails, just send the text
                    logger.error('Error sending thumbnail:', thumbnailErr);
                    await safeSendText(sock, remoteJid, responseText);
                }
            } catch (infoErr) {
                logger.error('Error getting video info:', infoErr);
                await safeSendText(sock, remoteJid, '*❌ Error:* Failed to get video information. Please check the URL and try again.' );
            }
        } catch (err) {
            logger.error('Error in ytmp3 command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to process YouTube URL. The service might be temporarily unavailable.' );
        }
    },

    async ytmp4(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;
            
            // Check if media commands are enabled for this group
            if (!(await areMediaCommandsEnabled(sock, remoteJid))) {
                return;
            }
            
            if (!args[0]) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* .ytmp4 [YouTube URL]' );
                return;
            }

            await safeSendText(sock, remoteJid, '*🔍 Analyzing:* Getting video information...' );

            try {
                // Get video info using ytdl-core to provide metadata
                const videoInfo = await ytdl.getInfo(args[0]);
                const videoDetails = videoInfo.videoDetails;
                
                // Format duration in minutes and seconds
                const durationInSeconds = parseInt(videoDetails.lengthSeconds);
                const minutes = Math.floor(durationInSeconds / 60);
                const seconds = durationInSeconds % 60;
                const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                
                // Format view count
                const viewCount = parseInt(videoDetails.viewCount).toLocaleString();
                
                // Get video quality
                const formats = videoInfo.formats;
                const bestVideoFormat = formats
                    .filter(format => format.hasVideo && format.hasAudio)
                    .sort((a, b) => (b.height || 0) - (a.height || 0))[0];
                
                const videoQuality = bestVideoFormat ? `${bestVideoFormat.height}p` : 'Unknown';
                
                // Create response message
                const responseText = `*🎬 Video Information:* \n\n` +
                    `*📝 Title:* ${videoDetails.title}\n` +
                    `*👤 Channel:* ${videoDetails.author.name}\n` +
                    `*⏱️ Duration:* ${formattedDuration}\n` +
                    `*👁️ Views:* ${viewCount}\n` +
                    `*📅 Published:* ${videoDetails.publishDate || 'Unknown'}\n` +
                    `*🔍 Best quality:* ${videoQuality}\n\n` +
                    `*🔗 Link:* ${videoDetails.video_url}\n\n` +
                    `*ℹ️ Note:* Due to YouTube restrictions, direct downloads are currently unavailable.`;
                
                // Attempt to get a thumbnail
                try {
                    // Get highest quality thumbnail
                    const thumbnails = videoDetails.thumbnails;
                    const highestQualityThumbnail = thumbnails[thumbnails.length - 1].url;
                    
                    await safeSendMessage(sock, remoteJid, {
                        image: { url: highestQualityThumbnail },
                        caption: responseText
                    });
                } catch (thumbnailErr) {
                    // If thumbnail fails, just send the text
                    logger.error('Error sending thumbnail:', thumbnailErr);
                    await safeSendText(sock, remoteJid, responseText);
                }
            } catch (infoErr) {
                logger.error('Error getting video info:', infoErr);
                await safeSendText(sock, remoteJid, '*❌ Error:* Failed to get video information. Please check the URL and try again.' );
            }
        } catch (err) {
            logger.error('Error in ytmp4 command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to process YouTube URL. The service might be temporarily unavailable.' );
        }
    },

    async enhance(sock, message) {
        try {
            const remoteJid = message.key.remoteJid;
            
            // Check if media commands are enabled for this group
            if (!(await areMediaCommandsEnabled(sock, remoteJid))) {
                return;
            }
            
            if (!message.message?.imageMessage) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* Reply to an image with .enhance'
                );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Enhancing image quality...' );

            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            const outputPath = path.join(tempDir, `${Date.now()}.png`);

            try {
                await sharp(buffer)
                    .normalize()
                    .modulate({
                        brightness: 1.1,
                        saturation: 1.2
                    })
                    .sharpen({
                        sigma: 1.5,
                        m1: 1.5,
                        m2: 0.7
                    })
                    .png()
                    .toFile(outputPath);

                await safeSendMessage(sock, remoteJid, {
                    image: { url: outputPath },
                    caption: '✅ Here\'s your enhanced image!'
                });

                await fsPromises.unlink(outputPath);
            } catch (processErr) {
                throw new Error(`Failed to enhance image: ${processErr.message}`);
            }

        } catch (err) {
            logger.error('Error in enhance command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to enhance image. Please try again later.'
            );
        }
    },

    async sharpen(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;
            
            // Check if media commands are enabled for this group
            if (!(await areMediaCommandsEnabled(sock, remoteJid))) {
                return;
            }
            
            if (!message.message?.imageMessage) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* .sharpen [level]\n\n*Example:* .sharpen 5'
                );
                return;
            }

            const level = parseInt(args[0]) || 5;
            if (level < 1 || level > 10) {
                await safeSendText(sock, remoteJid, '*❌ Error:* Sharpening level must be between 1 and 10'
                );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Sharpening image...' );

            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            const outputPath = path.join(tempDir, `${Date.now()}.png`);

            try {
                await sharp(buffer)
                    .sharpen({
                        sigma: level * 0.5,
                        m1: level * 0.2,
                        m2: level * 0.1
                    })
                    .png()
                    .toFile(outputPath);

                await safeSendMessage(sock, remoteJid, {
                    image: { url: outputPath },
                    caption: `✅ Image sharpened with level ${level}!`
                });

                await fsPromises.unlink(outputPath);
            } catch (processErr) {
                throw new Error(`Failed to sharpen image: ${processErr.message}`);
            }

        } catch (err) {
            logger.error('Error in sharpen command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to sharpen image. Please try again later.'
            );
        }
    },

    async reverse(sock, message) {
        try {
            const remoteJid = message.key.remoteJid;
            
            // Check if media commands are enabled for this group
            if (!(await areMediaCommandsEnabled(sock, remoteJid))) {
                return;
            }
            
            if (!message.message?.videoMessage) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* Reply to a video with .reverse'
                );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Reversing video...' );

            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            const inputPath = path.join(tempDir, `input_${Date.now()}.mp4`);
            const outputPath = path.join(tempDir, `output_${Date.now()}.mp4`);

            await fsPromises.writeFile(inputPath, buffer);

            const ffmpeg = require('fluent-ffmpeg');
            const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
            ffmpeg.setFfmpegPath(ffmpegPath);

            await new Promise((resolve, reject) => {
                ffmpeg(inputPath)
                    .videoFilters('reverse')
                    .save(outputPath)
                    .on('end', resolve)
                    .on('error', reject);
            });

            await safeSendMessage(sock, remoteJid, {
                video: { url: outputPath },
                caption: '✅ Here\'s your reversed video!'
            });

            // Cleanup
            await fsPromises.unlink(inputPath);
            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in reverse command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to reverse video. Please try again later.'
            );
        }
    },

    async ttp(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;
            
            // Check if media commands are enabled for this group
            if (!(await areMediaCommandsEnabled(sock, remoteJid))) {
                return;
            }
            
            const text = args.join(' ');
            if (!text) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* .ttp [text]' );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Creating text sticker...' );

            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });
            const outputPath = path.join(tempDir, `${Date.now()}.webp`);

            // Create text image using Sharp
            const svgImage = `
                <svg width="512" height="512">
                    <style>
                        text {
                            font-family: Arial, sans-serif;
                            font-size: 48px;
                            font-weight: bold;
                            fill: white;
                        }
                    </style>
                    <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)"/>
                    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle">${text}</text>
                </svg>
            `;

            await sharp(Buffer.from(svgImage))
                .resize(512, 512)
                .webp()
                .toFile(outputPath);

            await safeSendMessage(sock, remoteJid, {
                sticker: { url: outputPath }
            });

            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in ttp command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to create text sticker' );
        }
    },

    async attp(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;
            
            // Check if media commands are enabled for this group
            if (!(await areMediaCommandsEnabled(sock, remoteJid))) {
                return;
            }
            
            const text = args.join(' ');
            if (!text) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* .attp [text]' );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Creating animated text sticker...' );

            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });
            const outputPath = path.join(tempDir, `${Date.now()}.webp`);

            // Create animated text image using Sharp
            const frames = [];
            const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];

            for (let i = 0; i < colors.length; i++) {
                const svgImage = `
                    <svg width="512" height="512">
                        <style>
                            text {
                                font-family: Arial, sans-serif;
                                font-size: 48px;
                                font-weight: bold;
                                fill: ${colors[i]};
                            }
                        </style>
                        <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)"/>
                        <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle">${text}</text>
                    </svg>
                `;

                const frameBuffer = await sharp(Buffer.from(svgImage))
                    .resize(512, 512)
                    .webp()
                    .toBuffer();

                frames.push(frameBuffer);
            }

            // Create animated WebP
            const img = new webp.Image();
            for (let i = 0; i < frames.length; i++) {
                await img.addFrame(frames[i], {
                    delay: 100, // 100ms delay between frames
                    dispose: 1
                });
            }
            await img.save(outputPath);

            await safeSendMessage(sock, remoteJid, {
                sticker: { url: outputPath }
            });

            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in attp command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to create animated text sticker' );
        }
    },

    async emojimix(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;
            
            // Check if media commands are enabled for this group
            if (!(await areMediaCommandsEnabled(sock, remoteJid))) {
                return;
            }
            
            const emojis = args.join('').split('+');

            if (emojis.length !== 2) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* .emojimix [emoji1]+[emoji2]\nExample: .emojimix 😀+😭' 
                );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Mixing emojis...' );

            // Use Emoji Kitchen API
            const emojiUrl = `https://www.gstatic.com/android/keyboard/emojikitchen/20201001/${encodeURIComponent(emojis[0])}/${encodeURIComponent(emojis[0])}_${encodeURIComponent(emojis[1])}.png`;

            const response = await axios.get(emojiUrl, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(response.data);

            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });
            const outputPath = path.join(tempDir, `${Date.now()}.webp`);

            // Convert to WebP sticker
            await sharp(buffer)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .webp()
                .toFile(outputPath);

            await safeSendMessage(sock, remoteJid, {
                sticker: { url: outputPath }
            });

            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in emojimix command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to mix emojis' );
        }
    },

    async tovideo(sock, message) {
        try {
            const remoteJid = message.key.remoteJid;
            
            // Check if media commands are enabled for this group
            if (!(await areMediaCommandsEnabled(sock, remoteJid))) {
                return;
            }
            
            if (!message.message?.stickerMessage || !message.message.stickerMessage.isAnimated) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* Reply to an animated sticker with .tovideo' );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Converting sticker to video...' );

            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            const inputPath = path.join(tempDir, `input_${Date.now()}.webp`);
            const outputPath = path.join(tempDir, `output_${Date.now()}.mp4`);

            await fsPromises.writeFile(inputPath, buffer);

            const ffmpeg = require('fluent-ffmpeg');
            const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
            ffmpeg.setFfmpegPath(ffmpegPath);

            await new Promise((resolve, reject) => {
                ffmpeg(inputPath)
                    .toFormat('mp4')
                    .videoCodec('libx264')
                    .save(outputPath)
                    .on('end', resolve)
                    .on('error', reject);
            });

            await safeSendMessage(sock, remoteJid, {
                video: { url: outputPath }
            });

            // Cleanup
            await fsPromises.unlink(inputPath);
            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in tovideo command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to convert sticker to video' );
        }
    },

    async trim(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;
            
            // Check if media commands are enabled for this group
            if (!(await areMediaCommandsEnabled(sock, remoteJid))) {
                return;
            }
            
            if (!message.message?.videoMessage || args.length !== 2) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* Reply to a video with .trim [start_time] [end_time]\nExample: .trim 0:10 0:30' 
                );
                return;
            }

            const [startTime, endTime] = args;
            await safeSendText(sock, remoteJid, '*⏳ Processing:* Trimming video...' );

            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            const inputPath = path.join(tempDir, `input_${Date.now()}.mp4`);
            const outputPath = path.join(tempDir, `output_${Date.now()}.mp4`);

            await fsPromises.writeFile(inputPath, buffer);

            const ffmpeg = require('fluent-ffmpeg');
            const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
            ffmpeg.setFfmpegPath(ffmpegPath);

            await new Promise((resolve, reject) => {
                ffmpeg(inputPath)
                    .setStartTime(startTime)
                    .setDuration(endTime)
                    .output(outputPath)
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });

            await safeSendMessage(sock, remoteJid, {
                video: { url: outputPath },
                caption: '✅ Here\'s your trimmed video!'
            });

            // Cleanup
            await fsPromises.unlink(inputPath);
            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in trim command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to trim video' );
        }
    },

    async speed(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;
            
            // Check if media commands are enabled for this group
            if (!(await areMediaCommandsEnabled(sock, remoteJid))) {
                return;
            }
            
            if (!message.message?.videoMessage || !args[0]) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* Reply to a video with .speed [factor]\nExample: .speed 2 (2x faster) or .speed 0.5 (2x slower)' 
                );
                return;
            }

            const speed = parseFloat(args[0]);
            if (isNaN(speed) || speed <= 0 || speed > 4) {
                await safeSendText(sock, remoteJid, '*❌ Error:* Speed factor must be between 0.1 and 4' );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Adjusting video speed...' );

            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            const inputPath = path.join(tempDir, `input_${Date.now()}.mp4`);
            const outputPath = path.join(tempDir, `output_${Date.now()}.mp4`);

            await fsPromises.writeFile(inputPath, buffer);

            const ffmpeg = require('fluent-ffmpeg');
            const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
            ffmpeg.setFfmpegPath(ffmpegPath);

            await new Promise((resolve, reject) => {
                ffmpeg(inputPath)
                    .videoFilters(`setpts=${1/speed}*PTS`)
                    .audioFilters(`atempo=${speed}`)
                    .output(outputPath)
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });

            await safeSendMessage(sock, remoteJid, {
                video: { url: outputPath },
                caption: `✅ Video speed adjusted to ${speed}x`
            });

            // Cleanup
            await fsPromises.unlink(inputPath);
            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in speed command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to adjust video speed' );
        }
    },
    async brightness(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;
            if (!message.message?.imageMessage || !args[0]) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* Reply to an image with .brightness [level]\nExample: .brightness 1.5' 
                );
                return;
            }

            const level = parseFloat(args[0]);
            if (isNaN(level) || level < 0.1 || level > 2.0) {
                await safeSendText(sock, remoteJid, '*❌ Error:* Brightness level must be between 0.1 and 2.0' );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Adjusting image brightness...' );

            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            const outputPath = path.join(tempDir, `${Date.now()}.png`);

            await sharp(buffer)
                .modulate({
                    brightness: level
                })
                .toFile(outputPath);

            await safeSendMessage(sock, remoteJid, {
                image: { url: outputPath },
                caption: `✅ Image brightness adjusted to ${level}x`
            });

            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in brightness command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to adjust brightness' );
        }
    },

    async contrast(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;
            if (!message.message?.imageMessage || !args[0]) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* Reply to an image with .contrast [level]\nExample: .contrast 1.5' 
                );
                return;
            }

            const level = parseFloat(args[0]);
            if (isNaN(level) || level < 0.1 || level > 2.0) {
                await safeSendText(sock, remoteJid, '*❌ Error:* Contrast level must be between 0.1 and 2.0' );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Adjusting image contrast...' );

            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            const outputPath = path.join(tempDir, `${Date.now()}.png`);

            await sharp(buffer)
                .modulate({
                    contrast: level
                })
                .toFile(outputPath);

            await safeSendMessage(sock, remoteJid, {
                image: { url: outputPath },
                caption: `✅ Image contrast adjusted to ${level}x`
            });

            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in contrast command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to adjust contrast' );
        }
    },

    async blur(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;
            if (!message.message?.imageMessage || !args[0]) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* Reply to an image with .blur [sigma]\nExample: .blur 5' 
                );
                return;
            }

            const sigma = parseFloat(args[0]) || 5;
            if (isNaN(sigma) || sigma < 0.3 || sigma > 20) {
                await safeSendText(sock, remoteJid, '*❌ Error:* Blur sigma must be between 0.3 and 20' );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Applying blur effect...' );

            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            const outputPath = path.join(tempDir, `${Date.now()}.png`);

            await sharp(buffer)
                .blur(sigma)
                .toFile(outputPath);

            await safeSendMessage(sock, remoteJid, {
                image: { url: outputPath },
                caption: `✅ Applied blur effect (sigma: ${sigma})`
            });

            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in blur command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to apply blur effect' );
        }
    },

    async rotate(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;
            if (!message.message?.imageMessage || !args[0]) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* Reply to an image with .rotate [degrees]\nExample: .rotate 90' 
                );
                return;
            }

            const angle = parseInt(args[0]);
            if (isNaN(angle) || angle < -360 || angle > 360) {
                await safeSendText(sock, remoteJid, '*❌ Error:* Rotation angle must be between -360 and 360 degrees' );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Rotating image...' );

            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            const outputPath = path.join(tempDir, `${Date.now()}.png`);

            await sharp(buffer)
                .rotate(angle)
                .toFile(outputPath);

            await safeSendMessage(sock, remoteJid, {
                image: { url: outputPath },
                caption: `✅ Image rotated by ${angle} degrees`
            });

            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in rotate command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to rotate image' );
        }
    },

    async flip(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;
            if (!message.message?.imageMessage || !args[0]) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* Reply to an image with .flip [horizontal|vertical]\nExample: .flip horizontal' 
                );
                return;
            }

            const direction = args[0].toLowerCase();
            if (!['horizontal', 'vertical'].includes(direction)) {
                await safeSendText(sock, remoteJid, '*❌ Error:* Direction must be either "horizontal" or "vertical"' );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Flipping image...' );

            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            const outputPath = path.join(tempDir, `${Date.now()}.png`);

            await sharp(buffer)
                .flip(direction === 'vertical')
                .flop(direction=== 'horizontal')
                .toFile(outputPath);

            await safeSendMessage(sock, remoteJid, {
                image: { url:outputPath },
                caption: `✅ Image flipped ${direction}ly`
            });

            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in flip command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to flip image' );
        }
    },

    async tint(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;
            if (!message.message?.imageMessage || args.length !== 3) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* Reply to an image with .tint [red] [green] [blue]\nExample: .tint 255 0 0 for red tint' 
                );
                return;
            }

            const [r, g, b] = args.map(n => parseInt(n));
            if ([r, g, b].some(n => isNaN(n) || n < 0 || n > 255)) {
                await safeSendText(sock, remoteJid, '*❌ Error:* Color values must be between 0 and 255' );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Applying color tint...' );

            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            const outputPath = path.join(tempDir, `${Date.now()}.png`);

            await sharp(buffer)
                .tint({ r, g, b })
                .toFile(outputPath);

            await safeSendMessage(sock, remoteJid, {
                image: { url: outputPath },
                caption: `✅ Applied color tint (R:${r}, G:${g}, B:${b})`
            });

            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in tint command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to apply color tint' );
        }
    },

    async negate(sock, message) {
        try {
            const remoteJid = message.key.remoteJid;
            if (!message.message?.imageMessage) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* Reply to an image with .negate' 
                );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Inverting image colors...' );

            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            const outputPath = path.join(tempDir, `${Date.now()}.png`);

            await sharp(buffer)
                .negate()
                .toFile(outputPath);

            await safeSendMessage(sock, remoteJid, {
                image: { url: outputPath },
                caption: '✅ Image colors inverted'
            });

            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in negate command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to invert image colors' );
        }
    },

    async grayscale(sock, message) {
        try {
            const remoteJid = message.key.remoteJid;

            // Check if media commands are enabled for this group
            if (!(await areMediaCommandsEnabled(sock, remoteJid))) {
                return;
            }

            if (!message.message?.imageMessage) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* Reply to an image with .grayscale'
                );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Converting image to grayscale...' );

            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            const outputPath = path.join(tempDir, `${Date.now()}.png`);

            await sharp(buffer)
                .grayscale()
                .toFile(outputPath);

            await safeSendMessage(sock, remoteJid, {
                image: { url: outputPath },
                caption: '✅ Image converted to grayscale!'
            });

            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in grayscale command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to convert image to grayscale'
            );
        }
    },

    async rotate(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;

            // Check if media commands are enabled for this group
            if (!(await areMediaCommandsEnabled(sock, remoteJid))) {
                return;
            }

            if (!message.message?.imageMessage) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* .rotate [degrees]\nExample: .rotate 90'
                );
                return;
            }

            const degrees = parseInt(args[0]) || 90;
            if (![90, 180, 270].includes(degrees)) {
                await safeSendText(sock, remoteJid, '*❌ Error:* Rotation degrees must be 90, 180, or 270'
                );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Rotating image...' );

            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            const outputPath = path.join(tempDir, `${Date.now()}.png`);

            await sharp(buffer)
                .rotate(degrees)
                .toFile(outputPath);

            await safeSendMessage(sock, remoteJid, {
                image: { url: outputPath },
                caption: `✅ Image rotated ${degrees}°!`
            });

            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in rotate command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to rotate image'
            );
        }
    },

    async flip(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;

            // Check if media commands are enabled for this group
            if (!(await areMediaCommandsEnabled(sock, remoteJid))) {
                return;
            }

            if (!message.message?.imageMessage || !args[0]) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* .flip [horizontal|vertical]'
                );
                return;
            }

            const direction = args[0].toLowerCase();
            if (!['horizontal', 'vertical'].includes(direction)) {
                await safeSendText(sock, remoteJid, '*❌ Error:* Direction must be "horizontal" or "vertical"'
                );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Flipping image...' );

            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            const outputPath = path.join(tempDir, `${Date.now()}.png`);

            await sharp(buffer)
                .flip(direction === 'vertical')
                .flop(direction === 'horizontal')
                .toFile(outputPath);

            await safeSendMessage(sock, remoteJid, {
                image: { url: outputPath },
                caption: `✅ Image flipped ${direction}ly!`
            });

            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in flip command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to flip image'
            );
        }
    },

    async negate(sock, message) {
        try {
            const remoteJid = message.key.remoteJid;

            // Check if media commands are enabled for this group
            if (!(await areMediaCommandsEnabled(sock, remoteJid))) {
                return;
            }

            if (!message.message?.imageMessage) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* Reply to an image with .negate'
                );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Inverting image colors...' );

            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            const outputPath = path.join(tempDir, `${Date.now()}.png`);

            await sharp(buffer)
                .negate()
                .toFile(outputPath);

            await safeSendMessage(sock, remoteJid, {
                image: { url: outputPath },
                caption: '✅ Image colors inverted!'
            });

            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in negate command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to invert image colors'
            );
        }
    },

    async blur(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;

            // Check if media commands are enabled for this group
            if (!(await areMediaCommandsEnabled(sock, remoteJid))) {
                return;
            }

            if (!message.message?.imageMessage) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* .blur [sigma]\nExample: .blur 5'
                );
                return;
            }

            const sigma = parseFloat(args[0]) || 5;
            if (sigma < 0.3 || sigma > 20) {
                await safeSendText(sock, remoteJid, '*❌ Error:* Blur sigma must be between 0.3 and 20'
                );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Applying blur effect...' );

            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            const outputPath = path.join(tempDir, `${Date.now()}.png`);

            await sharp(buffer)
                .blur(sigma)
                .toFile(outputPath);

            await safeSendMessage(sock, remoteJid, {
                image: { url: outputPath },
                caption: `✅ Image blurred with sigma ${sigma}!`
            });

            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in blur command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to blur image'
            );
        }
    },

    async tint(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;

            // Check if media commands are enabled for this group
            if (!(await areMediaCommandsEnabled(sock, remoteJid))) {
                return;
            }

            if (!message.message?.imageMessage || args.length !== 3) {
                await safeSendText(sock, remoteJid, '*📝 Usage:* .tint [red] [green] [blue]\nExample: .tint 255 0 0'
                );
                return;
            }

            const [r, g, b] = args.map(Number);
            if ([r, g, b].some(v => isNaN(v) || v < 0 || v > 255)) {
                await safeSendText(sock, remoteJid, '*❌ Error:* Color values must be between 0 and 255'
                );
                return;
            }

            await safeSendText(sock, remoteJid, '*⏳ Processing:* Applying color tint...' );

            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const tempDir = path.join(process.cwd(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            const outputPath = path.join(tempDir, `${Date.now()}.png`);

            await sharp(buffer)
                .tint({ r, g, b })
                .toFile(outputPath);

            await safeSendMessage(sock, remoteJid, {
                image: { url: outputPath },
                caption: `✅ Image tinted with RGB(${r}, ${g}, ${b})!`
            });

            await fsPromises.unlink(outputPath);

        } catch (err) {
            logger.error('Error in tint command:', err);
            await safeSendText(sock, message.key.remoteJid, '*❌ Error:* Failed to tint image'
            );
        }
    }

};

// Export the commands object directly to ensure it's accessible
const commands = mediaCommands;

module.exports = {
    commands,
    category: 'media',
    async init() {
        try {
            logger.moduleInit('Media');

            // Check core dependencies first
            const coreDeps = {
                sharp,
                fs,
                path,
                logger
            };

            for (const [name, dep] of Object.entries(coreDeps)) {
                if (!dep) {
                    logger.error(`❌ Core media dependency '${name}' is not initialized`);
                    return false;
                }
                logger.info(`✓ Core media dependency '${name}' verified`);
            }

            // Check optional media dependencies
            const mediaDeps = {
                ytdl,
                yts,
                webp,
                axios,
                FormData
            };

            for (const [name, dep] of Object.entries(mediaDeps)) {
                if (!dep) {
                    logger.warn(`⚠️ Optional media dependency '${name}' is not available`);
                } else {
                    logger.info(`✓ Media dependency '${name}' verified`);
                }
            }

            // Ensure required directories exist
            const dirs = [
                path.join(process.cwd(), 'temp'),
                path.join(process.cwd(), 'temp/media'),
                path.join(process.cwd(), 'temp/stickers')
            ];

            for (const dir of dirs) {
                try {
                    await fsPromises.mkdir(dir, { recursive: true });
                    const stats = await fsPromises.stat(dir);
                    if (!stats.isDirectory()) {
                        throw new Error(`Path exists but is not a directory: ${dir}`);
                    }
                    logger.info(`✓ Directory verified: ${dir}`);
                } catch (err) {
                    logger.error(`❌ Directory creation failed for ${dir}:`, err);
                    return false;
                }
            }

            // Initialize queues
            audioQueue.clear();
            logger.info('✓ Audio queue initialized');

            logger.moduleSuccess('Media');
            return true;
        } catch (err) {
            logger.moduleError('Media', err);
            return false;
        }
    }
};