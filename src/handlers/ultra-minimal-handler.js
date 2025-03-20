/**
 * Ultra-Minimal WhatsApp Message Handler
 * Designed for maximum performance with <5ms response times
 * Stripped of all unnecessary operations for ultra-fast command execution
 */

const path = require('path');
const fs = require('fs');

// Performance optimizations
const commandHandlers = new Map(); // O(1) lookups
const commandCache = new Map();     // Cache for command results
const CACHE_LIFETIME = 60000;       // 1 minute cache lifetime

// Command complexity categories for adaptive timeouts and performance targeting
const COMMAND_COMPLEXITY = {
  ULTRA_FAST: 0,  // <3ms target (menu, ping, simple text responses)
  FAST: 1,        // <20ms target (text-only commands, simple lookups)
  MEDIUM: 2,      // <50ms target (commands with some processing)
  COMPLEX: 3      // <100ms target (media commands, search operations)
};

// Command complexity mapping for auto-tuned performance
const commandComplexityMap = {
  // Ultra-fast commands (<3ms)
  'ping': COMMAND_COMPLEXITY.ULTRA_FAST,
  'menu': COMMAND_COMPLEXITY.ULTRA_FAST,
  'help': COMMAND_COMPLEXITY.ULTRA_FAST, 
  'echo': COMMAND_COMPLEXITY.ULTRA_FAST,
  
  // Fast commands (<20ms)
  'info': COMMAND_COMPLEXITY.FAST,
  'profile': COMMAND_COMPLEXITY.FAST,
  'stats': COMMAND_COMPLEXITY.FAST,
  'register': COMMAND_COMPLEXITY.FAST,
  
  // Medium commands (<50ms)
  'weather': COMMAND_COMPLEXITY.MEDIUM,
  'translate': COMMAND_COMPLEXITY.MEDIUM,
  'dictionary': COMMAND_COMPLEXITY.MEDIUM,
  'calculate': COMMAND_COMPLEXITY.MEDIUM,
  
  // Complex commands (<100ms)
  'sticker': COMMAND_COMPLEXITY.COMPLEX,
  'image': COMMAND_COMPLEXITY.COMPLEX,
  'video': COMMAND_COMPLEXITY.COMPLEX
};

// Pre-load necessary utilities
let safeSendUtility;
let jidHelper;

/**
 * Ultra-fast command complexity detection
 * @param {string} command - Command name
 * @returns {number} - Complexity level
 */
function getCommandComplexity(command) {
  // Direct map lookup - O(1) constant time
  if (commandComplexityMap[command] !== undefined) {
    return commandComplexityMap[command];
  }
  
  // Fast pattern matching with indexOf for better performance than regex
  if (command.indexOf('sticker') !== -1 || 
      command.indexOf('gif') !== -1 || 
      command.indexOf('image') !== -1) {
    return COMMAND_COMPLEXITY.COMPLEX;
  }
  
  // Check for media-related commands
  if (command.indexOf('download') !== -1 ||
      command.indexOf('convert') !== -1 ||
      command.indexOf('generate') !== -1) {
    return COMMAND_COMPLEXITY.COMPLEX;
  }
  
  // Fast check for reaction commands (all reactions should be fast)
  if (['hug', 'pat', 'kiss', 'cuddle', 'slap', 'bonk', 
       'smile', 'cry', 'dance', 'laugh', 'bite', 'kill',
       'highfive', 'wave', 'wink', 'poke', 'punch'].includes(command)) {
    return COMMAND_COMPLEXITY.FAST;
  }
  
  // Default to FAST complexity for unknown commands
  return COMMAND_COMPLEXITY.FAST;
}

/**
 * Ultra-minimal message handler - processes incoming messages with maximum performance
 * @param {Object} sock - WhatsApp socket
 * @param {Object} message - Message object
 */
async function handleMessage(sock, message) {
  try {
    // Get JID and check if it's a group message
    const jid = message.key.remoteJid;
    const isGroup = jid && jid.includes('@g.us');
    
    // Skip non-text messages for maximum speed
    const messageType = Object.keys(message.message || {})[0];
    if (!messageType || (messageType !== 'conversation' && messageType !== 'extendedTextMessage')) {
      return;
    }
    
    // Ultra-fast text extraction (no regex)
    const textContent = messageType === 'conversation' 
      ? message.message.conversation 
      : message.message.extendedTextMessage?.text || '';
    
    // Skip non-command messages immediately
    if (!textContent || textContent.length < 2 || textContent[0] !== '.') {
      return;
    }
    
    // Get sender ID for permission checks and mentions in groups
    const senderId = isGroup && message.key.participant ? message.key.participant : jid;
    
    // Ultra-fast prefix handling (extract command with minimum ops)
    const messageContent = textContent.trim();
    const spaceIndex = messageContent.indexOf(' ');
    const command = spaceIndex !== -1 
      ? messageContent.substring(1, spaceIndex).toLowerCase() 
      : messageContent.substring(1).toLowerCase();
    
    // Skip empty commands
    if (!command) return;
    
    // Fast argument extraction using substring and split
    const args = spaceIndex !== -1 
      ? messageContent.substring(spaceIndex + 1).split(' ').filter(arg => arg !== '') 
      : [];
    
    // ULTRA-FAST PATH: Command execution
    console.log(`==== COMMAND DETECTED ====`);
    console.log(`Command: ${command}`);
    console.log(`Arguments: ${args.join(' ')}`);
    
    // Add extra group context for debugging and group-specific handling
    if (isGroup) {
      // Extract participant information for group messages
      console.log(`[JID-HELPER] Converting group message to participant JID: ${senderId}`);
      
      // Add sender to message context for easy access in command handlers
      message._sender = senderId;
      
      // Extract @mentions from message (common in group chats)
      if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
        message._mentionedJids = message.message.extendedTextMessage.contextInfo.mentionedJid;
        console.log(`Mentioned users: ${message._mentionedJids.length}`);
      }
    }
    
    // Find command handler with O(1) lookup
    const commandData = commandHandlers.get(command);
    if (!commandData || typeof commandData.handler !== 'function') {
      console.log(`==== COMMAND NOT FOUND ====`);
      return;
    }
    
    console.log(`==== MESSAGE PROCESSING COMPLETE ====`);
    
    // Execute command with optimized execution and group-awareness
    await executeCommand(commandData.handler, sock, message, args, command);
    
    // Log command execution completion with group context
    console.log(`Command execution completed for: ${command}`);
    const executionContext = isGroup ? `Group command` : 'Private command'; 
    console.log(`${executionContext} ${command} executed`);
    
  } catch (err) {
    // Ultra-minimal error logging with context
    const errorContext = message.key.remoteJid.includes('@g.us') ? 'GROUP' : 'PRIVATE';
    console.error(`Error handling message [${errorContext}]: ${err.message}`);
  }
}

/**
 * Ultra-optimized command execution with performance tracking
 * @param {Function} handler - Command handler
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {Array} args - Command arguments
 * @param {string} commandName - Command name
 */
async function executeCommand(handler, sock, msg, args, commandName) {
  if (!handler || !msg.key?.remoteJid) return;
  
  // Fast JID detection
  const jid = msg.key.remoteJid;
  const isGroup = jid.includes('@g.us');
  
  // Get sender ID (especially important for group messages)
  const senderId = isGroup && msg.key.participant ? msg.key.participant : jid;
  
  try {
    // Get command complexity for adaptive performance tuning
    const commandComplexityLevel = getCommandComplexity(commandName);
    
    // STAGE 1: PERFORMANCE TRACKING START
    const startTime = performance.now();
    const memBefore = commandComplexityLevel > 1 ? process.memoryUsage().heapUsed : 0;
    
    // Define adaptive timeouts based on command complexity 
    const timeoutConfig = {
      0: { group: 100, private: 150 },      // Ultra-fast: 100ms/150ms
      1: { group: 300, private: 500 },      // Fast: 300ms/500ms
      2: { group: 800, private: 1200 },     // Medium: 800ms/1200ms
      3: { group: 1500, private: 2000 }     // Complex: 1.5s/2s
    };
    
    // Get appropriate timeout duration
    const complexityTimeouts = timeoutConfig[commandComplexityLevel] || timeoutConfig[1];
    const timeoutDuration = isGroup ? complexityTimeouts.group : complexityTimeouts.private;
    
    // Check if we have jidHelper for group-aware message handling
    const canUseSafeSend = jidHelper && 
      ((isGroup && typeof jidHelper.safeSendGroupMessage === 'function') ||
       (typeof jidHelper.safeSendMessage === 'function'));
    
    // STAGE 2: COMMAND EXECUTION (with timeout protection)
    const result = await Promise.race([
      handler(sock, msg, args),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Command timed out`)), timeoutDuration);
      })
    ]);
    
    // STAGE 3: PERFORMANCE ANALYSIS
    const executionTime = performance.now() - startTime;
    
    // Define performance targets based on complexity
    const thresholds = {
      0: { group: 3, private: 5 },      // Ultra-fast: 3ms target in groups
      1: { group: 20, private: 30 },    // Fast: 20ms group, 30ms private
      2: { group: 50, private: 75 },    // Medium: 50ms group, 75ms private
      3: { group: 100, private: 150 }   // Complex: 100ms group, 150ms private
    };
    
    // Get appropriate threshold
    const levelThresholds = thresholds[commandComplexityLevel] || thresholds[1];
    const slowThreshold = isGroup ? levelThresholds.group : levelThresholds.private;
    
    // Log performance warnings if needed
    if (executionTime > slowThreshold) {
      console.log(`⚠️ Slow command execution: ${executionTime.toFixed(2)}ms ${isGroup ? '[GROUP]' : ''}`);
    }
    
    // Track memory usage for complex commands
    if (commandComplexityLevel > 1) {
      const memAfter = process.memoryUsage().heapUsed;
      const memUsed = (memAfter - memBefore) / 1024 / 1024; // in MB
      
      if (memUsed > 5) { // If more than 5MB used
        console.log(`⚠️ High memory usage command: ${memUsed.toFixed(2)}MB`);
      }
    }
    
    // Report command completion with timing
    console.log(`${isGroup ? 'Group' : 'Private'} command ${commandName} executed in ${executionTime.toFixed(2)}ms`);
    
    return result;
    
  } catch (err) {
    // Enhanced error handling with group-awareness
    console.error(`Error executing ${commandName}: ${err.message}`);
    
    // Attempt minimal user feedback with group-awareness
    try {
      // Prepare error message - ultra minimal for performance
      const errorMsg = { text: `⚠️ Error` };
      
      // Use appropriate method based on message type and available helpers
      if (isGroup && jidHelper && jidHelper.safeSendGroupMessage) {
        // Group-optimized messaging with mention
        jidHelper.safeSendGroupMessage(sock, jid, errorMsg, {
          quoted: msg,
          mentionedJid: [senderId]
        }).catch(() => {/* Silent */});
      } else if (jidHelper && jidHelper.safeSendMessage) {
        // Regular safe send
        jidHelper.safeSendMessage(sock, jid, errorMsg).catch(() => {/* Silent */});
      } else if (jidHelper && jidHelper.safeSendText) {
        // Text-only send
        jidHelper.safeSendText(sock, jid, `⚠️ Error`).catch(() => {/* Silent */});
      } else {
        // Fallback to direct send
        sock.sendMessage(jid, errorMsg).catch(() => {/* Silent */});
      }
    } catch (e) {
      // Completely silent error handling
    }
  }
}

/**
 * Fast command loading with caching
 * @returns {Promise<boolean>} Success status
 */
async function loadCommands() {
  try {
    // Paths to check for commands
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
                    complexity: getCommandComplexity(name),
                    source: path.basename(file, '.js')
                  });
                  console.log(`Registered command: ${name}`);
                } else if (typeof handler === 'object' && typeof handler.execute === 'function') {
                  commandHandlers.set(name, { 
                    handler: handler.execute,
                    complexity: getCommandComplexity(name),
                    source: path.basename(file, '.js')
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
    console.error(`Failed to load commands: ${err.message}`);
    return false;
  }
}

/**
 * Initialize the handler
 * @param {Object} sock - WhatsApp socket
 * @returns {Promise<boolean>} Success status
 */
async function init(sock) {
  try {
    // Load commands
    await loadCommands();
    
    // Pre-load utilities (only once at initialization)
    try {
      jidHelper = require('../utils/jidHelper');
      safeSendUtility = jidHelper;
      console.log('Successfully pre-loaded safe-send utility');
    } catch (err) {
      console.error(`Failed to load jidHelper: ${err.message}`);
    }
    
    // Track processed messages to prevent duplicates
    const processedMessages = new Set();
    
    // Expose message handler with duplicate prevention
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      
      // Performance optimization: process only the first message
      const message = messages[0];
      if (!message || !message.key) return;
      
      // CRITICAL FIX: Prevent duplicate message processing
      // Create a unique ID for this message
      const messageId = `${message.key.id}_${message.key.remoteJid}`;
      
      // Skip if we've already processed this message
      if (processedMessages.has(messageId)) {
        return;
      }
      
      // Add to processed messages
      processedMessages.add(messageId);
      
      // Cleanup old entries (keep last 100 to prevent memory leaks)
      if (processedMessages.size > 100) {
        const entries = Array.from(processedMessages);
        for (let i = 0; i < entries.length - 100; i++) {
          processedMessages.delete(entries[i]);
        }
      }
      
      // Log basic info for debugging
      console.log('==== RECEIVED MESSAGE UPDATE ====');
      console.log(`Update type: ${type}`);
      console.log(`Has messages: ${messages.length > 0 ? 'Yes' : 'No'}`);
      
      if (message.key && message.key.remoteJid) {
        console.log(`Message from: ${message.key.remoteJid}`);
        
        // Only log text for text messages
        if (message.message && (
            message.message.conversation || 
            message.message.extendedTextMessage?.text
        )) {
          const text = message.message.conversation || 
                      message.message.extendedTextMessage?.text;
          console.log(`Message text: "${text}"`);
        }
      }
      
      // Process message
      await handleMessage(sock, message);
    });
    
    console.log('Message handler initialized successfully');
    return true;
  } catch (err) {
    console.error(`Failed to initialize message handler: ${err.message}`);
    return false;
  }
}

module.exports = {
  init,
  handleMessage,
  commandHandlers
};