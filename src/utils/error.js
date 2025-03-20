const logger = require('./logger');
const { safeSendMessage, safeSendText, safeSendImage } = require('./jidHelper');

/**
 * Handles errors in WhatsApp bot commands
 * @param {Object} sock - WhatsApp socket connection
 * @param {string} jid - Chat JID where error occurred
 * @param {Error} err - Error object
 * @param {string} message - Error message to display to user
 */
const handleError = async (sock, jid, err, message) => {
    // Log detailed error information
    logger.error('WhatsApp Bot Error:', {
        message: message,
        errorMessage: err.message,
        errorName: err.name,
        stack: err.stack,
        chat: jid
    });

    // Log additional connection state if available
    if (sock?.ws) {
        logger.info('Connection state:', {
            connected: sock.ws.readyState === sock.ws.OPEN,
            state: sock.ws.readyState
        });
    }

    try {
        // Send error message to user with more context
        await safeSendMessage(sock, jid, { 
            text: `❌ ${message}\n\nError Details: ${err.message}\nPlease try again or contact the bot administrator.` 
        });
    } catch (sendErr) {
        logger.error('Failed to send error message to user:', sendErr);
    }
};

module.exports = {
    handleError
};