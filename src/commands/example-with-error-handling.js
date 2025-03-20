/**
 * Example Command Module with Proper Error Handling
 * This module demonstrates best practices for error handling in WhatsApp bot commands
 */

const errorHandler = require('../utils/errorHandler');
const { calculate } = require('../utils/calculationUtils');
const { safeSendText, safeSendMessage, safeSendImage } = require('../utils/jidHelper');

module.exports = {
  /**
   * Raw command implementation without error handling
   * For demonstration purposes only
   */
  commands: {
    /**
     * Echo a message back to the user
     * Simple command with minimal error handling
     */
    async echo(sock, message, args) {
      try {
        const jid = message.key.remoteJid;
        const text = args.join(' ') || 'Echo!';
        
        await safeSendMessage(sock, jid, { text });
        return { success: true };
      } catch (error) {
        console.error('Error in echo command:', error);
        
        // Basic error handling
        const jid = message.key.remoteJid;
        await safeSendText(sock, jid, '❌ An error occurred while processing your command.' 
        );
        
        return { success: false, error };
      }
    },
    
    /**
     * Command with explicit try/catch block
     */
    async calculate(sock, message, args) {
      const jid = message.key.remoteJid;
      
      try {
        // Input validation
        if (!args.length) {
          await safeSendText(sock, jid, '❓ Please provide a mathematical expression to calculate.' 
          );
          return { success: false, error: 'No expression provided' };
        }
        
        const expression = args.join(' ');
        
        // Call calculation utility
        const result = calculate(expression);
        
        // Check for calculation errors
        if (result.error) {
          await safeSendMessage(sock, jid, { 
            text: `❌ Error: ${result.error}` 
          });
          return { success: false, error: result.error };
        }
        
        // Send result
        await safeSendMessage(sock, jid, { 
          text: `🧮 *Calculation Result*\n\n*Expression:* ${expression}\n*Result:* ${result.formatted}` 
        });
        
        return { success: true, result: result.value };
      } catch (error) {
        // Comprehensive error handling
        console.error(`Error in calculate command: ${error.message}`);
        
        // Send user-friendly error message
        await safeSendMessage(sock, jid, { 
          text: `❌ Sorry, I couldn't process that calculation.\n\nError: ${error.message}` 
        });
        
        return { success: false, error };
      }
    },
    
    /**
     * Command using the wrapWithErrorHandler wrapper
     */
    async random(sock, message, args) {
      // Ensure we have a valid message object and JID
      if (!message || !message.key || !message.key.remoteJid) {
        throw new Error('Invalid message object');
      }
      
      const jid = message.key.remoteJid;
      
      // Ensure args is an array
      args = args || [];
      
      // Parse range arguments with defaults
      const min = parseInt(args[0]) || 1;
      const max = parseInt(args[1]) || 100;
      
      // Validate ranges
      if (min >= max) {
        throw new Error('The minimum value must be less than the maximum value.');
      }
      
      // Generate random number
      const randomValue = Math.floor(Math.random() * (max - min + 1)) + min;
      
      // Send the result
      await safeSendMessage(sock, jid, { 
        text: `🎲 Random number between ${min} and ${max}: *${randomValue}*` 
      });
      
      return { success: true, result: randomValue };
    }
  },
  
  async init() {
    console.log('Example command module with error handling initialized');
    
    // Wrap the random command with error handling
    this.commands.random = errorHandler.wrapWithErrorHandler(
      this.commands.random,
      'random',
      'example-with-error-handling'
    );
    
    return true;
  }
};