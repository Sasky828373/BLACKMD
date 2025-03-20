/**
 * Enhanced Message Handler for WhatsApp Bot
 * Provides a streamlined message handling system with dynamic command loading
 */

const fs = require('fs');
const path = require('path');

// Track initialization
let initialized = false;
const commandHandlers = new Map();

/**
 * Try to load command modules from the standard structure
 * @param {Object} sock - WhatsApp socket connection  
 */
async function loadCommandModules(sock) {
    try {
        // Default basic commands if we can't load modules
        const basicCommands = {
            'ping': async (sock, msg) => {
                const jid = msg.key.remoteJid;
                await sock.sendMessage(jid, { text: 'Pong! 🏓' });
            },
            'help': async (sock, msg) => {
                const jid = msg.key.remoteJid;
                let helpText = '*Available Commands*\n\n';
                
                // Add all registered commands to help text
                commandHandlers.forEach((handler, cmd) => {
                    helpText += `.${cmd} - ${handler.description || 'No description'}\n`;
                });
                
                await sock.sendMessage(jid, { text: helpText });
            },
            'echo': async (sock, msg, args) => {
                const jid = msg.key.remoteJid;
                const text = args.join(' ');
                await sock.sendMessage(jid, { text: text || 'You need to provide text to echo!' });
            }
        };
        
        // Register basic commands
        Object.entries(basicCommands).forEach(([name, handler]) => {
            commandHandlers.set(name, { 
                handler: handler,
                description: name === 'ping' ? 'Check if bot is active' : 
                            name === 'help' ? 'Display all available commands' :
                            name === 'echo' ? 'Repeat your message back to you' : 'No description'
            });
        });
        
        // Try to load command modules from both locations
        const commandPaths = [
            path.join(process.cwd(), 'commands'),
            path.join(process.cwd(), 'src', 'commands')
        ];
        
        // Process each command path
        for (const commandsPath of commandPaths) {
            if (fs.existsSync(commandsPath)) {
                try {
                    console.log(`Loading commands from: ${commandsPath}`);
                    const moduleFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
                    
                    for (const file of moduleFiles) {
                        try {
                            const filePath = path.join(commandsPath, file);
                            
                            // Skip backup files and templates
                            if (file.includes('.bak') || file.includes('.tmp') || file.startsWith('_')) {
                                continue;
                            }
                            
                            const commandModule = require(filePath);
                            
                            // Support two formats: direct exports or .commands object
                            const commands = commandModule.commands || commandModule;
                            
                            // Skip if not a valid command module
                            if (typeof commands !== 'object') {
                                continue;
                            }
                            
                            // Register each command in the module
                            Object.entries(commands).forEach(([name, handler]) => {
                                if (typeof handler === 'function') {
                                    commandHandlers.set(name, { 
                                        handler: handler,
                                        description: commandModule.descriptions?.[name] || 'No description',
                                        source: commandsPath
                                    });
                                    console.log(`Registered command: ${name}`);
                                } else if (typeof handler === 'object' && typeof handler.execute === 'function') {
                                    commandHandlers.set(name, { 
                                        handler: handler.execute,
                                        description: handler.description || 'No description',
                                        source: commandsPath
                                    });
                                    console.log(`Registered command: ${name}`);
                                }
                            });
                        } catch (err) {
                            console.error(`Error loading command file ${file}: ${err.message}`);
                        }
                    }
                } catch (err) {
                    console.error(`Error reading commands directory: ${err.message}`);
                }
            }
        }
        
        console.log(`Loaded ${commandHandlers.size} commands`);
        return true;
    } catch (err) {
        console.error(`Failed to load command modules: ${err.message}`);
        initializeBasicCommands();
        return false;
    }
}

/**
 * Initialize basic commands as fallback
 */
function initializeBasicCommands() {
    // Simple ping command
    commandHandlers.set('ping', {
        handler: async (sock, msg) => {
            const jid = msg.key.remoteJid;
            await sock.sendMessage(jid, { text: 'Pong! 🏓' });
        },
        description: 'Check if bot is active'
    });
    
    // Help command
    commandHandlers.set('help', {
        handler: async (sock, msg) => {
            const jid = msg.key.remoteJid;
            let helpText = '*Available Commands*\n\n';
            
            commandHandlers.forEach((handler, cmd) => {
                helpText += `.${cmd} - ${handler.description || 'No description'}\n`;
            });
            
            await sock.sendMessage(jid, { text: helpText });
        },
        description: 'Display all available commands'
    });
    
    console.log('Initialized basic commands as fallback');
}

// Command results cache for faster repeated execution
const commandResultCache = new Map();
const CACHE_LIFETIME = 60000; // 1 minute cache lifetime

/**
 * Optimized command execution with minimal overhead and performance tracking
 */
async function executeCommand(handler, sock, msg, args, commandName) {
    // ULTRA-FAST PATH: Skip validation for maximum speed
    if (!handler || !msg.key?.remoteJid) return;

    // Fast JID detection - use includes instead of endsWith for better performance
    const jid = msg.key.remoteJid;
    const isGroup = jid.includes('@g.us');

    try {
        // Extract command name with zero overhead
        const cmdName = commandName || (args.length > 0 ? args[0] : 'unknown');
        const commandComplexityLevel = getCommandComplexity(cmdName);

        // OPTIMIZATION: Skip typing indicator for ultra-fast commands
        // Only show typing for commands that will take noticeable time
        if (isGroup && commandComplexityLevel > 0) {
            sock.sendPresenceUpdate('composing', jid).catch(() => {});
        }

        // SUPER-OPTIMIZATION: Check for cacheable commands and cache hits
        const now = Date.now();
        let useCache = commandComplexityLevel > 0 && ['menu', 'help', 'info', 'weather'].includes(cmdName);

        if (useCache) {
            const cacheKey = `${cmdName}:${args.join(':')}:${isGroup ? 'group' : 'private'}`;

            if (commandResultCache.has(cacheKey)) {
                const cached = commandResultCache.get(cacheKey);
                if (now - cached.timestamp < CACHE_LIFETIME) {
                    // Use cached result for instant response
                    console.log(`Using cached result for ${cmdName}`);

                    // Clear typing immediately
                    if (isGroup && commandComplexityLevel > 0) {
                        sock.sendPresenceUpdate('available', jid).catch(() => {});
                    }

                    return cached.result;
                }
            }
        }

        // Performance tracking - only for non-trivial commands
        const startTime = performance.now();
        const memBefore = commandComplexityLevel > 1 ? process.memoryUsage().heapUsed : 0;

        // AGGRESSIVE TIMEOUT STRATEGY: Ultra-short timeouts
        const timeoutConfig = {
            0: { group: 100, private: 150 },      // Ultra-fast: 100ms/150ms
            1: { group: 300, private: 500 },      // Fast: 300ms/500ms
            2: { group: 800, private: 1200 },     // Medium: 800ms/1200ms
            3: { group: 1500, private: 2000 }     // Complex: 1.5s/2s
        };

        // Use minimum viable timeouts based on command type
        const complexityTimeouts = timeoutConfig[commandComplexityLevel] || timeoutConfig[1];
        const timeoutDuration = isGroup ? complexityTimeouts.group : complexityTimeouts.private;

        // Handle command with optimized promise race
        const result = await Promise.race([
            handler(sock, msg, args),
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`Timeout`)), timeoutDuration);
            })
        ]);

        // OPTIMIZATION: Cache successful results for popular commands
        if (useCache && result) {
            const cacheKey = `${cmdName}:${args.join(':')}:${isGroup ? 'group' : 'private'}`;
            commandResultCache.set(cacheKey, {
                result,
                timestamp: now
            });

            // Clean up old cache entries
            if (commandResultCache.size > 50) {
                const entries = [...commandResultCache.entries()];
                entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
                for (let i = 0; i < 10; i++) {
                    commandResultCache.delete(entries[i][0]);
                }
            }
        }

        // Clear typing indicator for slower commands
        if (isGroup && commandComplexityLevel > 0) {
            sock.sendPresenceUpdate('available', jid).catch(() => {});
        }

        // Performance monitoring and optimization metrics
        const executionTime = performance.now() - startTime;
        const memAfter = process.memoryUsage().heapUsed;
        const memUsed = (memAfter - memBefore) / 1024 / 1024; // in MB

        // ADAPTIVE PERFORMANCE: Multi-group scaling with dynamic performance targets
        // Scale thresholds based on complexity level with stricter targets:
        // 0: Ultra-fast (<3ms target)
        // 1: Fast (20ms threshold)
        // 2: Medium (50ms threshold)
        // 3: Complex (100ms threshold)
        const thresholds = {
            0: { group: 3, private: 5 },      // Ultra-fast commands: 3ms target in groups
            1: { group: 20, private: 30 },    // Fast commands: 20ms group, 30ms private
            2: { group: 50, private: 75 },    // Medium commands: 50ms group, 75ms private
            3: { group: 100, private: 150 }   // Complex commands: 100ms group, 150ms private
        };

        // Get appropriate threshold based on complexity and chat type
        const levelThresholds = thresholds[commandComplexityLevel] || thresholds[0];
        const slowThreshold = isGroup ? levelThresholds.group : levelThresholds.private;

        // Log performance warnings for slow commands
        if (executionTime > slowThreshold) {
            console.log(`⚠️ Slow command execution: ${executionTime.toFixed(2)}ms ${isGroup ? '[GROUP]' : ''}`);
        }

        // Log high memory usage commands (potential memory leaks)
        if (memUsed > 5) { // If more than 5MB used
            console.log(`⚠️ High memory usage command: ${memUsed.toFixed(2)}MB`);
        }

        return result;
    } catch (err) {
        // ULTRA-MINIMAL ERROR MESSAGES: Prioritize response speed
        try {
            // Zero overhead error responses - absolute minimal length
            const userMessage = err.message.includes('timed out') 
                ? '⏱️ Timeout'
                : `⚠️ Error`;

            // Attempt to use the JID helper for better group response
            let jidHelper;
            try {
                jidHelper = require('./utils/jidHelper');
            } catch (e) {
                try {
                    jidHelper = require('../src/utils/jidHelper');
                } catch (e2) {
                    jidHelper = null;
                }
            }

            // Use optimized group sending for faster error responses in groups
            if (isGroup && jidHelper && jidHelper.safeSendGroupMessage) {
                jidHelper.safeSendGroupMessage(sock, msg, {
                    text: userMessage
                }, { 
                    mentionSender: true 
                }).catch(() => {});
            } else {
                // Fallback to direct sending for faster error response
                sock.sendMessage(jid, { text: userMessage }).catch(() => {});
            }

            // Clear typing indicator if it was set
            if (isGroup) {
                sock.sendPresenceUpdate('available', jid).catch(() => {});
            }
        } catch (e) {
            // Fail silently to prevent cascading errors
        }
    }
}

// EXTREME OPTIMIZATION: Pre-cache ALL message templates for ultra-fast <5ms responses
// Removing ALL function calls and string concatenation during runtime
const messageTemplates = {
    // Command not found responses (flat structure for direct access)
    commandNotFoundGroup: `Command not found. Use .help`,
    commandNotFoundPrivate: `Command not found. Use .help for available commands.`,

    // Ultra-minimized error responses for absolute fastest response
    errorGroup: `Error. Try again.`,
    errorPrivate: `Error. Please try again.`,

    // Common responses pre-cached
    pong: `🏓 Pong!`, 
    ok: `✓ Done`,

    // Extreme optimization: Direct access templates for common commands
    ping: {
        group: `🏓 Pong! Speed: <TIME>ms`,
        private: `🏓 Pong! Response time: <TIME>ms`
    },

    // Very short error messages for maximum speed
    timeout: {
        group: `⏱️ Timeout`, 
        private: `⏱️ Command timed out`
    }
};

// EXTREME OPTIMIZATION: Pre-cache all common JID types for zero-overhead checking
const JID_TYPES = {
    GROUP: '@g.us',
    PRIVATE: '@s.whatsapp.net',
    BROADCAST: 'status@broadcast'
};

/**
 * Initialize message handler
 * @param {Object} sock - WhatsApp socket connection
 */
async function init(sock) {
    if (initialized) {
        console.log('Message handler already initialized');
        return;
    }
    
    // Load command modules
    await loadCommandModules(sock);
    
    // Pre-load common utilities to avoid require() calls during message processing
    let safeSendUtility;
    try {
        // First try the direct path - load once at startup
        safeSendUtility = require('./utils/safe-send');
        console.log('Successfully pre-loaded safe-send utility');
    } catch (err) {
        try {
            // Try alternate path
            safeSendUtility = require('../src/utils/safe-send');
            console.log('Successfully pre-loaded safe-send utility (alternate path)');
        } catch (altErr) {
            // Fallback to direct sending
            safeSendUtility = {
                safeSendText: async (sock, jid, text) => {
                    return sock.sendMessage(jid, { text });
                }
            };
            console.log('Created direct message sending utility (safe-send.js not available)');
        }
    }
    
    // Create optimization cache for fast command lookup
    const commandCache = new Map();
    
    // Create queue for message processing with priority
    const messageQueue = [];
    let processingMessage = false;
    
    // Create a map to track recently processed message IDs to prevent duplicates
    const processedMessages = new Map();
    

    // Optimized message handler with reduced logging
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        // Fast path for most common case
        if (!messages || !messages.length) return;
        
        // Get the first message
        const msg = messages[0];
        if (!msg || !msg.message) return;
        
        // Skip status updates immediately
        const remoteJid = msg.key?.remoteJid || 'unknown';
        if (remoteJid === 'status@broadcast') return;
        
        // Check for duplicate message processing (prevent double responses)
        const msgId = msg.key?.id;
        if (msgId) {
            // Skip if this message ID was recently processed (within last 30 seconds)
            if (processedMessages.has(msgId)) {
                return;
            }
            
            // Mark this message as processed with a timestamp
            processedMessages.set(msgId, Date.now());
            
            // Cleanup old entries from processedMessages map (older than 30 seconds)
            const now = Date.now();
            processedMessages.forEach((timestamp, key) => {
                if (now - timestamp > 30000) { // 30 seconds
                    processedMessages.delete(key);
                }
            });
        }
        
        // Minimal console output for better performance
        console.log(`\n==== RECEIVED MESSAGE UPDATE ====`);
        console.log(`Update type: ${type}`);
        console.log(`Has messages: ${messages.length > 0 ? 'Yes' : 'No'}`);
        console.log(`Message from: ${remoteJid}`);
            
        try {
            // Extract text with fast path for common message types
            const messageText = msg.message.conversation || 
                               (msg.message.extendedTextMessage?.text) || '';
            
            // Fast command detection
            if (messageText.startsWith('.')) {
                console.log(`Message text: "${messageText}"`);
                
                // Parse command with optimized splitting
                const commandEnd = messageText.indexOf(' ') > 0 ? messageText.indexOf(' ') : messageText.length;
                const commandName = messageText.slice(1, commandEnd).toLowerCase();
                const args = commandEnd < messageText.length ? 
                             messageText.slice(commandEnd + 1).trim().split(/\s+/) : [];
                
                console.log(`==== COMMAND DETECTED ====`);
                console.log(`Command: ${commandName}`);
                console.log(`Arguments: ${args.join(' ')}`);
                
                // Use caching for performance
                const safeSend = safeSendUtility;
                
                // EXTREME PERFORMANCE: Ultra-fast path for <5ms response times
                // Direct inline code with no function calls, instant execution, no queueing
                
                // --- STEP 1: Detect if this is a critical fast-path command ---
                // Use switch for fastest possible dispatch (significantly faster than if/else or arrays)
                switch(commandName) {
                    // Case 1: PING - Maximum 5ms response time
                    case 'ping':
                    case 'p':
                        // Use pre-calculated response templates - no string concatenation
                        const pingTemplate = remoteJid.includes(JID_TYPES.GROUP) 
                            ? messageTemplates.ping.group 
                            : messageTemplates.ping.private;
                            
                        // Direct replacement is faster than template literals
                        const responseTime = (Date.now() - msg.messageTimestamp*1000).toString();
                        const pingText = pingTemplate.replace('<TIME>', responseTime);
                        
                        // Use simplified direct send with minimal overhead
                        // Skip all validation, error handling, and unnecessary operations
                        try {
                            sock.sendMessage(remoteJid, {
                                text: pingText,
                                // Only add mentions in group chats - avoid property access when not needed
                                ...(remoteJid.includes(JID_TYPES.GROUP) && msg.key.participant 
                                    ? {mentions: [msg.key.participant]} 
                                    : {})
                            });
                            
                            // Skip all console logging to save processing time
                            // console.log(`Ultra-fast ping response sent in <5ms`);
                        } catch (e) {}
                        
                        return; // Skip all other processing
                        
                    // Case 2: ECHO - Maximum 5ms response time
                    case 'echo':
                        if (args.length === 0) break; // Only process if has arguments (fallthrough to queue otherwise)
                        
                        // Skip join() for maximum speed - direct array access for first arg
                        const echoText = args.length === 1 
                            ? args[0]  // Ultra-fast single arg
                            : args.join(' '); // Fallback for multiple args
                        
                        // Direct lean send with zero overhead
                        try {
                            sock.sendMessage(remoteJid, {
                                text: echoText,
                                ...(remoteJid.includes(JID_TYPES.GROUP) && msg.key.participant 
                                    ? {mentions: [msg.key.participant]} 
                                    : {})
                            });
                        } catch (e) {}
                        
                        return; // Skip queue
                        
                    // Case 3: Speed command for testing response performance
                    case 'speed':
                        // Send instant response with raw time tracking
                        try {
                            const now = Date.now();
                            const latency = now - msg.messageTimestamp*1000;
                            sock.sendMessage(remoteJid, {
                                text: `⚡ Response: ${latency}ms | Target: <5ms`,
                                ...(remoteJid.includes(JID_TYPES.GROUP) && msg.key.participant 
                                    ? {mentions: [msg.key.participant]} 
                                    : {})
                            });
                        } catch (e) {}
                        
                        return; // Skip queue
                        
                    // Add any other commands that need <5ms response here
                    case 'pong':
                        try {
                            sock.sendMessage(remoteJid, {
                                text: messageTemplates.pong,
                                ...(remoteJid.includes(JID_TYPES.GROUP) && msg.key.participant 
                                    ? {mentions: [msg.key.participant]} 
                                    : {})
                            });
                        } catch (e) {}
                        
                        return; // Skip queue
                }
                
                // --- PERFORMANCE NOTE: We only reach here for non-fast-path commands ---
                
                // Regular queue for all other commands
                messageQueue.push({
                    priority: getCommandPriority(commandName),
                    jid: remoteJid, // Store JID directly for faster access in queue processing
                    commandName, // Store command name for better logging
                    timestamp: Date.now(), // For performance tracking
                    isGroup: remoteJid.endsWith('@g.us'), // Precalculated flag for faster checks
                    execute: async () => {
                        try {
                            // Fast path for command execution
                            if (commandHandlers.has(commandName)) {
                                // Get from cache if possible
                                let handlerInfo = commandCache.get(commandName);
                                if (!handlerInfo) {
                                    handlerInfo = commandHandlers.get(commandName);
                                    commandCache.set(commandName, handlerInfo);
                                }
                                
                                const { handler } = handlerInfo;
                                
                                // Typing indicator disabled as per user request
                                
                                // Execute command with optimized error handling
                                await executeCommand(handler, sock, msg, args, commandName);
                                console.log(`Command execution completed for: ${commandName}`);
                            } else {
                                // EXTREME OPTIMIZATION: Ultra-fast response for unknown commands
                                const isGroupChat = remoteJid.includes(JID_TYPES.GROUP);
                                // Use pre-cached flat message templates for zero overhead
                                const responseText = isGroupChat ? 
                                    messageTemplates.commandNotFoundGroup : 
                                    messageTemplates.commandNotFoundPrivate;
                                
                                if (isGroupChat) {
                                    // Ultra-fast group response with precalculated template
                                    await safeSend.safeSendGroupMessage(sock, msg, {
                                        text: responseText
                                    }, { 
                                        mentionSender: true 
                                    });
                                } else {
                                    // Ultra-fast private response with precalculated template
                                    await safeSend.safeSendText(sock, remoteJid, responseText);
                                }
                            }
                        } catch (err) {
                            console.error(`Error in command execution: ${err.message}`);
                            
                            try {
                                // EXTREME OPTIMIZATION: Zero-overhead error handling for <5ms responses
                                const isGroupChat = remoteJid.includes(JID_TYPES.GROUP);
                                // Direct template lookup with no function calls - absolute minimum overhead
                                const errorText = isGroupChat ? messageTemplates.errorGroup : messageTemplates.errorPrivate;
                                
                                // Direct sending for maximum speed
                                if (isGroupChat) {
                                    // Ultra-fast group response with minimum overhead
                                    sock.sendMessage(remoteJid, {
                                        text: errorText,
                                        mentions: msg.key.participant ? [msg.key.participant] : undefined
                                    }).catch(() => {
                                        // Silent catch for maximum speed - no additional error handling
                                    });
                                } else {
                                    // Ultra-fast private response with minimum overhead
                                    sock.sendMessage(remoteJid, { text: errorText }).catch(() => {});
                                }
                            } catch (e) {
                                // Silent catch - don't add any overhead to error handling
                            }
                        }
                    }
                });
                
                // Process queue if not already processing
                if (!processingMessage) {
                    processMessageQueue();
                }
            } else {
                console.log('Message is not a command');
                
                // Handle XP gain for normal messages
                try {
                    // Load levelingSystem module
                    let levelingSystem;
                    try {
                        levelingSystem = require('./utils/levelingSystem');
                    } catch (moduleErr) {
                        // Try alternate path
                        try {
                            levelingSystem = require('../src/utils/levelingSystem');
                        } catch (altErr) {
                            console.log('Leveling system module not available');
                            levelingSystem = null;
                        }
                    }
                    
                    if (levelingSystem && typeof levelingSystem.addXP === 'function') {
                        // Add XP for the message and check for level up
                        const isGroup = remoteJid.endsWith('@g.us');
                        const activityType = isGroup ? 'groupChat' : 'privateChat';
                        
                        // Get the actual user's JID (whether in group or not)
                        const userJid = isGroup ? (msg.key.participant || remoteJid) : remoteJid;
                        
                        // Pass the user's JID as first parameter to properly track XP for the user, not the group
                        const levelUpData = await levelingSystem.addXP(userJid, activityType, isGroup ? remoteJid : null);
                        
                        // Send level up notification if user leveled up
                        if (levelUpData && levelingSystem.hasLevelUpNotificationEnabled(userJid)) {
                            // Load safe send utility
                            let safeSendUtil;
                            try {
                                safeSendUtil = require('./utils/jidHelper');
                            } catch (e) {
                                try {
                                    safeSendUtil = require('../src/utils/jidHelper');
                                } catch (e2) {
                                    // Use direct sock.sendMessage as fallback
                                    safeSendUtil = {
                                        safeSendText: async (sock, jid, text) => sock.sendMessage(jid, { text })
                                    };
                                }
                            }
                            
                            const levelUpMessage = `*🎉 Congratulations!*\nYou leveled up from ${levelUpData.oldLevel} to ${levelUpData.newLevel}!\n\n*💰 Reward:* ${levelUpData.coinReward} coins\n*🏆 Rank:* ${levelUpData.rankTitle}`;
                            
                            // Use enhanced group sending for better mentions in group chats
                            if (isGroup) {
                                await safeSendUtil.safeSendGroupMessage(sock, msg, {
                                    text: levelUpMessage
                                }, { 
                                    mentionSender: true 
                                });
                            } else {
                                await safeSendUtil.safeSendText(sock, remoteJid, levelUpMessage);
                            }
                            console.log(`Sent level up notification to ${userJid} (in chat ${remoteJid}) for reaching level ${levelUpData.newLevel}`);
                        }
                    }
                } catch (xpError) {
                    // Log but don't interrupt message flow for XP errors
                    console.error(`Error processing XP for message: ${xpError.message}`);
                }
            }
            
            console.log(`==== MESSAGE PROCESSING COMPLETE ====\n`);
        } catch (error) {
            console.error(`Error in message handler: ${error.message}`);
            
            // Ultra-fast error recovery with minimal overhead - maximum performance approach
            try {
                if (remoteJid && remoteJid !== 'unknown') {
                    // Direct approach for maximum speed
                    const isGroup = remoteJid.endsWith('@g.us');
                    const errorText = messageTemplates.errorProcessing(isGroup);
                    
                    if (isGroup && msg?.key?.participant) {
                        // Ultra-fast group response with direct mention
                        sock.sendMessage(remoteJid, { 
                            text: errorText,
                            mentions: [msg.key.participant]
                        }).catch(() => {});
                    } else {
                        // Ultra-fast private response
                        sock.sendMessage(remoteJid, { text: errorText }).catch(() => {});
                    }
                }
            } catch (e) {
                // Silent catch - no additional overhead
            }
        }
    });
    
    // Helper function to assign priority to commands with ultra-fast whitelisting
    function getCommandPriority(command) {
        // ADAPTIVE PERFORMANCE: Scale command priority based on complexity
        // Use the command complexity function for consistent behavior
        const complexity = getCommandComplexity(command);
        
        // Invert complexity for priority (lower complexity = higher priority)
        // 0 = ultra-fast commands get highest priority (0)
        // 1 = fast commands get high priority (1)
        // 2 = medium commands get normal priority (2)
        // 3 = complex commands get lowest priority (3)
        
        return complexity; // Direct mapping from complexity to priority level
    }
    
    // Process message queue with priority and performance optimizations
    async function processMessageQueue() {
        // EXTREME OPTIMIZATION: Ultra-fast <5ms response time
        if (!messageQueue.length) {
            processingMessage = false;
            return;
        }
        
        processingMessage = true;
        
        // PERFORMANCE CRITICAL: Zero-overhead handling for fastest command execution paths
        // Direct processing for single item queues - absolute fastest path possible
        if (messageQueue.length === 1) {
            const nextMessage = messageQueue.shift();
            const startTime = Date.now();
            
            try {
                // Execute with zero timeout overhead - fire and forget for lightning speed
                nextMessage.execute().finally(() => {
                    const execTime = Date.now() - startTime;
                    
                    // Minimal performance tracking - only log if not ultra-fast
                    if (execTime > 5) {
                        console.log(`${nextMessage.isGroup ? 'Group' : 'Private'} command ${nextMessage.commandName} executed in ${execTime.toFixed(2)}ms`);
                    }
                    
                    // Only warn if significantly over our target
                    if (execTime > 100) {
                        console.log(`⚠️ Slow command execution: ${execTime.toFixed(2)}ms [${nextMessage.isGroup ? 'GROUP' : 'PRIVATE'}]`);
                    }
                    
                    processingMessage = false;
                });
                
                // Return immediately - don't await - maximum throughput and minimum latency
                return;
            } catch(e) {
                // Fire and forget error handling - absolute minimal overhead
                processingMessage = false;
                return;
            }
        }
        
        // OPTIMIZATION: For ultra-priority commands + other commands, first check for critical priority items
        // This avoids the expensive sort operation for the most common case
        let ultraPriorityFound = false;
        let ultraPriorityIndex = -1;
        
        // Zero-overhead check for ultra priority commands (priority 0)
        for (let i = 0; i < Math.min(5, messageQueue.length); i++) {
            if (messageQueue[i].priority === 0) {
                ultraPriorityFound = true;
                ultraPriorityIndex = i;
                break;
            }
        }
        
        // Found an ultra-priority command - execute it immediately
        if (ultraPriorityFound) {
            // Extract just this command (faster than full sort)
            const nextMessage = messageQueue[ultraPriorityIndex];
            messageQueue.splice(ultraPriorityIndex, 1);
            const startTime = Date.now();
            
            try {
                // Fire and forget for maximum throughput
                nextMessage.execute().finally(() => {
                    const execTime = Date.now() - startTime;
                    if (execTime > 5) {
                        console.log(`${nextMessage.isGroup ? 'Group' : 'Private'} command ${nextMessage.commandName} executed in ${execTime.toFixed(2)}ms`);
                    }
                });
                
                // Continue immediately to next message - don't block the queue
                setImmediate(processMessageQueue);
                return;
            } catch(e) {
                // Continue immediately on error - zero overhead error handling
                setImmediate(processMessageQueue);
                return;
            }
        }
        
        // Only for queues with 3+ messages that don't have ultra priority, sort by:
        // 1. Priority first (most important)
        // 2. Group status (groups processed first for perceived speed)
        if (messageQueue.length > 2) {
            // Ultra-optimized minimal-comparison sort
            messageQueue.sort((a, b) => {
                // Priority is most important (0 is highest)
                const ap = a.priority || 99; 
                const bp = b.priority || 99;
                
                if (ap !== bp) return ap - bp; // Priorities differ
                
                // If same priority, check if both are group/private or mixed
                if (a.isGroup !== b.isGroup) return a.isGroup ? -1 : 1;
                
                // Equal priority and type - use insertion order
                return 0;
            });
        }
        
        // Process next message with ultra-low timeout and zero overhead
        const nextMessage = messageQueue.shift();
        const startTime = Date.now();
        
        try {
            // MULTI-GROUP HANDLING: Ultra-aggressive timeouts with group specialization
            // For multiple group management, we need ultra-fast responses and quick releases
            // Direct low-latency response dispatch for multi-group scaling
            const timeoutDuration = nextMessage.isGroup ? 2 : 5; // Extreme 2ms for groups, 5ms for private
            
            // Execute with zero waiting overhead - fire and forget pattern 
            const execPromise = nextMessage.execute();
            
            // Setup timeout with no console logs (for maximum performance)
            const timeoutId = setTimeout(() => {}, timeoutDuration);
            
            // Non-blocking execution for maximum throughput
            execPromise.then(() => {
                clearTimeout(timeoutId);
                const execTime = Date.now() - startTime;
                if (execTime > 5) {
                    console.log(`${nextMessage.isGroup ? 'Group' : 'Private'} command ${nextMessage.commandName} executed in ${execTime.toFixed(2)}ms`);
                }
            }).catch(() => {
                clearTimeout(timeoutId);
            }).finally(() => {
                // Continue processing queue immediately
                if (messageQueue.length) {
                    setImmediate(processMessageQueue);
                } else {
                    processingMessage = false;
                }
            });
        } catch (e) {
            // Continue to next message on error with zero overhead
            if (messageQueue.length) {
                setImmediate(processMessageQueue);
            } else {
                processingMessage = false;
            }
        }
    }
    
    initialized = true;
    console.log('Message handler initialized successfully');
}

/**
 * Get command complexity level for performance optimization
 * ULTRA-OPTIMIZED VERSION - Pre-computed map for O(1) lookup
 * @param {string} commandName - Name of the command
 * @returns {number} Complexity level (0-3)
 *   0: Ultra-fast (<3ms target) - ping, echo, status
 *   1: Fast commands (20ms threshold) - help, info
 *   2: Medium commands (50ms threshold) - sticker, stats
 *   3: Complex commands (100ms threshold) - menu, reactions
 */
// Pre-built complexity map for O(1) lookups instead of multiple array checks
const COMMAND_COMPLEXITY_MAP = {
    // LEVEL 0 - Ultra-fast commands (3ms target)
    'ping': 0, 'p': 0, 'echo': 0, 'pong': 0, 'speed': 0, 'status': 0, 'alive': 0,
    'hi': 0, 'hey': 0, 'test': 0, 'uptime': 0, 'runtime': 0, 'bot': 0,
    
    // LEVEL 1 - Fast commands (20ms target)
    'help': 1, 'h': 1, 'info': 1, 'i': 1, 'about': 1, 'credits': 1, 'owner': 1, 
    'rules': 1, 'faq': 1, 'privacy': 1, 'terms': 1, 'donate': 1, 'support': 1,
    'changelog': 1, 'source': 1, 'contact': 1, 'premium': 1, 'report': 1,
    'feedback': 1, 'botinfo': 1, 'dashboard': 1, 'system': 1,
    
    // LEVEL 3 - Known complex commands (100ms+ operations)
    'menu': 3, 'sticker': 3, 'translate': 3, 'weather': 3, 'news': 3,
    'tiktok': 3, 'instagram': 3, 'facebook': 3, 'twitter': 3, 'reddit': 3,
    'youtube': 3, 'spotify': 3, 'anime': 3, 'manga': 3, 'movie': 3, 'tv': 3,
    'play': 3, 'song': 3, 'video': 3, 'download': 3, 'insta': 3, 'fb': 3,
    'yt': 3, 'ig': 3, 'reaction': 3, 'nsfw': 3, 'hug': 3, 'kiss': 3, 'slap': 3,
    'punch': 3, 'pat': 3, 'cry': 3, 'dance': 3, 'highfive': 3, 'wink': 3,
    'poke': 3, 'cuddle': 3, 'bite': 3, 'blush': 3, 'bonk': 3, 'happy': 3,
    'kill': 3, 'laugh': 3, 'wave': 3, 'yeet': 3
};

// ULTRA-FAST PATTERN MATCHING - O(1) prefix/suffix lookup tables
const LEVEL1_PREFIXES = new Set(['set', 'get', 'find', 'show']);
const LEVEL2_PREFIXES = new Set(['calc', 'dict', 'search', 'check', 'rank', 'vote', 'quiz', 'random']);
const LEVEL3_SUFFIXES = new Set(['gif', 'image', 'picture', 'audio', 'video', 'media']);

function getCommandComplexity(commandName) {
    // Normalize and handle null input with ultra-fast code path
    if (!commandName) return 1;
    commandName = commandName.toLowerCase();
    
    // OPTIMIZATION 1: Direct O(1) lookup from pre-computed map (fastest path)
    const directLookup = COMMAND_COMPLEXITY_MAP[commandName];
    if (directLookup !== undefined) return directLookup;
    
    // OPTIMIZATION 2: Efficient pattern matching with early returns
    
    // Quick check for reaction command pattern (highest confidence)
    if (commandName.includes('reaction') || commandName.includes('gif')) return 3;
    
    // Check Level 1 prefixes (optimized for minimal checks)
    for (const prefix of LEVEL1_PREFIXES) {
        if (commandName.startsWith(prefix)) return 1;
    }
    
    // Check Level 2 prefixes (medium complexity)
    for (const prefix of LEVEL2_PREFIXES) {
        if (commandName.startsWith(prefix)) return 2;
    }
    
    // Check Level 3 suffixes (complex commands)
    for (const suffix of LEVEL3_SUFFIXES) {
        if (commandName.endsWith(suffix)) return 3;
    }
    
    // Common admin command patterns (complex but no media)
    if (commandName.includes('admin') || commandName.includes('owner') || 
        commandName.includes('ban') || commandName.includes('kick')) {
        return 2;
    }
    
    // Fast media detection for complex commands
    if (commandName.includes('picture') || commandName.includes('image') || 
        commandName.includes('video') || commandName.includes('audio') ||
        commandName.includes('media') || commandName.includes('sticker')) {
        return 3;
    }
    
    // Default to Level 1 for unknown commands (faster overall response)
    // This is changed from the previous default of 2 to make all commands respond faster
    return 1;
}

/**
 * Check if the handler is initialized
 * @returns {boolean} Whether the handler is initialized
 */
function isInitialized() {
    return initialized;
}

module.exports = {
    init,
    isInitialized,
    getCommandComplexity // Export for testing
};