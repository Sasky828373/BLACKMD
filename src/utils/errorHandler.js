/**
 * Command Error Handler
 * Provides standardized error handling for command execution
 */

const logger = require('./logger');
const { safeSendText } = require('./jidHelper');
const { languageManager } = require('./language');

/**
 * Handle an error that occurred during command execution
 * @param {Object} sock - The WhatsApp socket connection
 * @param {string} jid - The JID where the error occurred
 * @param {Error} error - The error object
 * @param {string} commandName - The name of the command that failed
 * @param {string} moduleName - The module containing the command
 * @param {Object} options - Additional options
 * @param {boolean} options.reply - Whether to reply to the user (default: true)
 * @param {boolean} options.logError - Whether to log the error (default: true)
 * @param {boolean} options.userFriendly - Whether to send a user-friendly message (default: true)
 * @param {boolean} options.detailed - Whether to include technical details (default: false)
 * @param {boolean} options.useRetry - Whether to use retry mechanism (default: true)
 * @returns {Promise<void>}
 */
async function handleCommandError(sock, jid, error, commandName, moduleName, options = {}) {
    // Set default options
    const {
        reply = true,
        logError = true,
        userFriendly = true,
        detailed = false,
        useRetry = true
    } = options;
    
    // Log error
    if (logError) {
        logger.error(`Error in command '${commandName}' from module '${moduleName}':`, error);
    }
    
    if (!reply) return;
    
    // Get error category for better user messages
    const category = categorizeError(error);
    
    try {
        // Prepare user-friendly error message
        let errorMessage = '';
        
        if (userFriendly) {
            // Get standardized error message based on category
            errorMessage = getUserFriendlyErrorMessage(category, commandName);
        } else {
            // Use raw error message
            errorMessage = error.message || String(error);
        }
        
        // Add technical details if requested
        if (detailed) {
            errorMessage += `\n\nTechnical details: ${error.message || String(error)}`;
            
            if (error.stack) {
                const firstLine = error.stack.split('\n')[0];
                errorMessage += `\nType: ${firstLine}`;
            }
        }
        
        // Send error message with retry
        if (useRetry) {
            await retryMessageSend(sock, jid, { text: errorMessage });
        } else {
            await safeSendText(sock, jid, errorMessage);
        }
    } catch (sendError) {
        logger.error('Error sending error message:', sendError);
    }
}

/**
 * Safely execute a command with error handling
 * @param {Function} commandFunction - The command function to execute
 * @param {Object} sock - The WhatsApp socket connection
 * @param {Object} message - The message object
 * @param {Array} args - Command arguments
 * @param {string} commandName - The name of the command
 * @param {string} moduleName - The module containing the command
 * @returns {Promise<any>} - The result from the command function or null if it failed
 */
async function safelyExecuteCommand(commandFunction, sock, message, args, commandName, moduleName) {
    try {
        return await commandFunction(sock, message, args);
    } catch (error) {
        await handleCommandError(sock, message.key.remoteJid, error, commandName, moduleName);
        return null;
    }
}

/**
 * Create a wrapped version of a command function with built-in error handling
 * @param {Function} commandFunction - The original command function
 * @param {string} commandName - The name of the command
 * @param {string} moduleName - The module containing the command
 * @returns {Function} - The wrapped command function
 */
function wrapWithErrorHandler(commandFunction, commandName, moduleName) {
    return async (sock, message, args) => {
        return await safelyExecuteCommand(commandFunction, sock, message, args, commandName, moduleName);
    };
}

/**
 * Add error handling to all commands in a module
 * @param {Object} commandsObject - The object containing command functions
 * @param {string} moduleName - The name of the module
 * @returns {Object} - A new object with all commands wrapped with error handling
 */
function addErrorHandlingToAll(commandsObject, moduleName) {
    const wrappedCommands = {};
    
    for (const [commandName, commandFunction] of Object.entries(commandsObject)) {
        if (typeof commandFunction === 'function') {
            wrappedCommands[commandName] = wrapWithErrorHandler(commandFunction, commandName, moduleName);
        }
    }
    
    return wrappedCommands;
}

/**
 * Check if an error is a user input error
 * @param {Error} error - The error to check
 * @returns {boolean} - Whether it's a user input error
 */
function isUserInputError(error) {
    // Check for common input error patterns
    return (
        error.message?.includes('Invalid') ||
        error.message?.includes('Missing') ||
        error.message?.includes('required') ||
        error.message?.includes('not found') ||
        error.message?.includes('must be') ||
        error.name === 'ValidationError' ||
        error.name === 'InputError'
    );
}

/**
 * Categorize an error to provide more specific handling and user messages
 * @param {Error} error - The error to categorize
 * @returns {string} - Error category
 */
function categorizeError(error) {
    if (!error) return 'unknown';
    
    // Network errors
    if (
        error.code === 'ENOTFOUND' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET' ||
        error.code === 'ECONNREFUSED' ||
        error.message?.includes('network') ||
        error.message?.includes('connection')
    ) {
        return 'network';
    }
    
    // Permission errors
    if (
        error.code === 'EACCES' ||
        error.message?.includes('permission') ||
        error.message?.includes('not allowed') ||
        error.message?.includes('denied')
    ) {
        return 'permission';
    }
    
    // User input errors
    if (isUserInputError(error)) {
        return 'input';
    }
    
    // Resource not found
    if (
        error.code === 'ENOENT' ||
        error.message?.includes('not found') ||
        error.message?.includes('does not exist')
    ) {
        return 'not_found';
    }
    
    // Timeout errors
    if (
        error.code === 'TIMEOUT' ||
        error.message?.includes('timeout') ||
        error.message?.includes('timed out')
    ) {
        return 'timeout';
    }
    
    // Media processing errors
    if (
        error.message?.includes('image') ||
        error.message?.includes('video') ||
        error.message?.includes('audio') ||
        error.message?.includes('media')
    ) {
        return 'media';
    }
    
    // Baileys-specific errors
    if (
        error.message?.includes('Baileys') ||
        error.message?.includes('Connection') ||
        error.message?.includes('closed')
    ) {
        return 'baileys';
    }
    
    return 'unknown';
}

/**
 * Get user-friendly message based on error category
 * @param {string} category - Error category
 * @param {string} commandName - Name of the command that failed
 * @returns {string} - User-friendly error message
 */
function getUserFriendlyErrorMessage(category, commandName) {
    switch (category) {
        case 'network':
            return languageManager.getText('error.network') || 
                'There seems to be a network issue. Please try again later.';
            
        case 'permission':
            return languageManager.getText('error.permission') || 
                'You do not have permission to use this command.';
            
        case 'input':
            return languageManager.getText('error.input', null, commandName) || 
                `Incorrect usage of the command. Try '!help ${commandName}' for instructions.`;
            
        case 'not_found':
            return languageManager.getText('error.not_found') || 
                'The requested resource could not be found.';
            
        case 'timeout':
            return languageManager.getText('error.timeout') || 
                'The operation timed out. Please try again later.';
            
        case 'media':
            return languageManager.getText('error.media') || 
                'There was an error processing the media file.';
            
        case 'baileys':
            return languageManager.getText('error.connection') || 
                'There was an issue with the WhatsApp connection. Please try again later.';
            
        default:
            return languageManager.getText('error.unknown') || 
                'An unknown error occurred. Please try again later.';
    }
}

/**
 * Retry sending a message with exponential backoff
 * @param {Object} sock - WhatsApp socket connection
 * @param {any} jid - JID to send to
 * @param {Object} content - Message content
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
 * @param {number} options.initialDelay - Initial delay in ms (default: 500)
 * @param {Function} options.sendFunction - Function to use for sending (default: safeSendMessage)
 * @returns {Promise<Object|null>} - Message sending result or null if all retries failed
 */
async function retryMessageSend(sock, jid, content, options = {}) {
    const {
        maxRetries = 3,
        initialDelay = 500,
        sendFunction = safeSendText
    } = options;
    
    let lastError = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // Try to send the message
            return await sendFunction(sock, jid, content);
        } catch (error) {
            lastError = error;
            
            // Log retry attempt
            logger.warn(`Message send failed (attempt ${attempt + 1}/${maxRetries}):`, error.message);
            
            // Wait before retrying with exponential backoff
            if (attempt < maxRetries - 1) {
                const delay = initialDelay * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    // All retries failed
    logger.error(`Failed to send message after ${maxRetries} attempts:`, lastError);
    return null;
}

module.exports = {
    handleCommandError,
    safelyExecuteCommand,
    wrapWithErrorHandler,
    addErrorHandlingToAll,
    isUserInputError,
    categorizeError,
    getUserFriendlyErrorMessage,
    retryMessageSend
};