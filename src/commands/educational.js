/**
 * Educational Commands for WhatsApp Bot
 * Access to educational tools and features
 */

const educationalCommands = require('./educational/commands');
const logger = require('../utils/logger');

// Export commands with category information
module.exports = {
  commands: educationalCommands.commands,
  category: 'educational',
  
  // Module initialization
  async init(sock) {
    try {
      logger.info('Initializing educational module wrapper...');
      
      // Call the initialization of nested educational commands module
      if (typeof educationalCommands.init === 'function') {
        await educationalCommands.init(sock);
      }
      
      logger.info('Educational module wrapper initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize educational module wrapper:', error);
      return false;
    }
  }
};
