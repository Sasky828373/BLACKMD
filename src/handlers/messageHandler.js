const logger = require('../utils/logger');
const { safeSendMessage, safeSendText, safeSendImage } = require('../utils/jidHelper');
const config = require('../config/config');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs').promises;
const path = require('path');

// Message rate limiting
const messageRateLimit = new Map();
const RATE_LIMIT = 10; // messages per minute
const RATE_WINDOW = 60000; // 1 minute in milliseconds

// Command cooldowns
const commandCooldowns = new Map();

// Typing indicators
const typingStates = new Map();

// Store command handler reference
let commandProcessor = null;

/**
 * Initialize message handler
 */
async function init() {
    try {
        logger.info('Starting message handler initialization...');

        // Load command handler
        try {
            logger.info('Loading command handler module...');
            
            // Get the full path to the command handler module for better error reporting
            const commandHandlerPath = path.resolve(process.cwd(), 'src/handlers/commandHandler.js');
            logger.info(`Command handler path: ${commandHandlerPath}`);
            
            // Check if file exists
            try {
                const stats = await fs.stat(commandHandlerPath);
                logger.info(`Command handler file exists: ${stats.isFile()}`);
            } catch (statErr) {
                logger.error(`Command handler file not found: ${commandHandlerPath}`, statErr);
                // Try to list directory contents for debugging
                try {
                    const dirPath = path.dirname(commandHandlerPath);
                    const files = await fs.readdir(dirPath);
                    logger.info(`Files in ${dirPath}:`, files);
                } catch (readErr) {
                    logger.error(`Could not read directory: ${readErr.message}`);
                }
            }
            
            // Directly use the instance from bot-handler.js to avoid module cache issues
            const commandHandler = require('./commandHandler');

            // Verify command handler structure
            logger.info('Command handler module loaded, verifying structure:', {
                moduleType: typeof commandHandler,
                hasProcessCommand: typeof commandHandler.processCommand === 'function',
                hasCommands: typeof commandHandler.commands === 'object',
                commandCount: commandHandler.commands?.size || 0,
                isInitialized: typeof commandHandler.isInitialized === 'function' ? commandHandler.isInitialized() : false
            });

            if (!commandHandler || typeof commandHandler.processCommand !== 'function') {
                throw new Error('Invalid command handler structure');
            }

            // If commands are not loaded yet, try to load them
            if (commandHandler.commands?.size === 0 && typeof commandHandler.loadCommands === 'function') {
                logger.info('Commands not loaded yet, loading commands...');
                await commandHandler.loadCommands();
                logger.info('Command loading completed, command count:', commandHandler.commands?.size || 0);
            }

            commandProcessor = commandHandler.processCommand;
            logger.info('Command handler verification successful');
        } catch (err) {
            logger.error('Failed to load command handler:', err);
            logger.error('Command handler stack trace:', err.stack);
            
            // Initialize with a simple fallback command processor for resilience
            if (!commandProcessor) {
                logger.warn('Initializing fallback command processor');
                commandProcessor = async (sock, message, commandText) => {
                    logger.warn(`Using fallback processor for command: ${commandText}`);
                    await safeSendText(sock, message.key.remoteJid, 'Command processing is currently limited. Please try again later.' 
                    );
                };
            }
            
            // Don't fail initialization - continue with fallback
            logger.warn('Continuing with fallback command processor');
        }

        // Create temp directories
        try {
            const tempDir = path.join(process.cwd(), 'temp');
            await fs.mkdir(tempDir, { recursive: true });
            logger.info('Temp directory created:', tempDir);
        } catch (err) {
            logger.warn('Failed to create temp directory:', err);
            // Non-critical error, continue initialization
        }

        logger.info('Message handler initialization completed successfully');
        return true;
    } catch (err) {
        logger.error('Message handler initialization failed:', err);
        logger.error('Full error details:', {
            name: err.name,
            message: err.message,
            stack: err.stack,
            code: err.code
        });
        return false;
    }
}

/**
 * Check rate limit for a user
 */
function checkRateLimit(userId) {
    const now = Date.now();
    const userRates = messageRateLimit.get(userId) || [];
    const validRates = userRates.filter(time => now - time < RATE_WINDOW);

    if (validRates.length >= RATE_LIMIT) {
        return false;
    }

    validRates.push(now);
    messageRateLimit.set(userId, validRates);
    return true;
}

/**
 * Check command cooldown
 */
function checkCommandCooldown(userId, command) {
    // Cooldowns are disabled
    return 0;
}

/**
 * Show typing indicator - DISABLED
 */
async function showTypingIndicator(sock, jid) {
    // Function disabled as per user request
    return;
}

// Message content extraction function - optimized for performance
function extractTextContent(message) {
    // Faster path - direct conversation
    if (message.message?.conversation) {
        return message.message.conversation;
    }
    
    // Extended text message
    if (message.message?.extendedTextMessage?.text) {
        return message.message.extendedTextMessage.text;
    }
    
    // Media captions
    if (message.message?.imageMessage?.caption) {
        return message.message.imageMessage.caption;
    }
    
    if (message.message?.videoMessage?.caption) {
        return message.message.videoMessage.caption;
    }
    
    return '';
}

/**
 * Handle incoming messages - optimized for faster response times
 */
async function messageHandler(sock, message) {
    try {
        // Fast validation
        if (!message?.message || !message.key?.remoteJid) {
            return;
        }

        const sender = message.key.remoteJid;
        
        // Fast check for self-messages (important ones like credentials)
        if (sock.user && sender === sock.user.id) {
            const messageText = message.message?.conversation || 
                              message.message?.extendedTextMessage?.text;
            
            if (messageText && messageText.startsWith('{') && messageText.includes('BOT_CREDENTIALS_BACKUP')) {
                try {
                    const data = JSON.parse(messageText);
                    
                    if (data && data.type === 'BOT_CREDENTIALS_BACKUP') {
                        const { sessionManager } = require('../utils/sessionManager');
                        await sessionManager.handleCredentialsBackup(message);
                        return;
                    }
                } catch (jsonErr) {
                    // Continue with normal processing
                }
            }
        }

        // Get message content - optimized extraction
        const messageContent = extractTextContent(message);
        if (!messageContent) {
            return;
        }

        // Cache prefix lookup
        const prefix = '!'; // Hardcode for speed instead of config?.bot?.prefix || '!';
        
        // Fast command check
        if (messageContent.charAt(0) === prefix) {
            // Check rate limit - but don't block execution with await
            if (!checkRateLimit(sender)) {
                return;
            }

            const commandText = messageContent.slice(1).trim();
            if (!commandText) {
                return;
            }

            // Command check - faster split using indexOf
            const spaceIndex = commandText.indexOf(' ');
            const command = spaceIndex > 0 ? commandText.substring(0, spaceIndex) : commandText;
            
            // Cooldown check
            const cooldown = checkCommandCooldown(sender, command);
            if (cooldown > 0) {
                safeSendText(sock, sender, `⏳ Please wait ${cooldown} seconds before using this command again.`);
                return;
            }

            // Determine if group - delayed until needed
            const isGroup = sender.endsWith('@g.us');

            // Show typing indicator in background - don't await
            showTypingIndicator(sock, sender);

            try {
                // Fast check for command processor
                if (commandProcessor) {
                    // Process command without waiting for typing indicator
                    await commandProcessor(sock, message, commandText, { isGroup });
                    
                    // Minimal logging
                    console.log(`Command processed: ${command}`);
                }
            } catch (err) {
                // Simplified error handling
                console.error(`Command error: ${err.message}`);
                safeSendText(sock, sender, '❌ Command failed. Try .help for assistance.');
            }
        }
    } catch (err) {
        // Minimal error logging
        console.error(`MessageHandler error: ${err.message}`);
    }
}

// Ensure the init function is exposed correctly and properly initialized
logger.info('Setting up messageHandler module exports');

// Add a simple initialization check function
function isInitialized() {
    return commandProcessor !== null;
}

// Export the module with all required functions
module.exports = { 
    messageHandler, 
    init,
    isInitialized
};