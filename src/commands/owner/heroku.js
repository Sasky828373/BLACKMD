/**
 * Heroku Deployment Commands
 * Commands for helping with Heroku deployment
 */

const { getCredsForTransmission } = require('../../utils/herokuHelper');
const { safeSendMessage } = require('../../utils/jidHelper');
const { isBotOwner } = require('../../utils/permissions');
const logger = require('../../utils/logger');

module.exports = {
    commands: {
        /**
         * Get credentials data for Heroku deployment
         * @param {Object} sock - WhatsApp socket connection
         * @param {Object} message - The message object
         * @returns {Promise<void>}
         */
        getcreds: async (sock, message) => {
            try {
                // Check if the user is the bot owner
                const senderId = message.key.remoteJid;
                
                if (!isBotOwner(senderId)) {
                    await safeSendMessage(sock, senderId, { text: '❌ This command is only for the bot owner' });
                    return;
                }
                
                // Get credentials data
                const credsData = await getCredsForTransmission();
                
                if (!credsData) {
                    await safeSendMessage(sock, senderId, { text: '❌ Failed to get credentials data' });
                    return;
                }
                
                // Check data size
                const dataSizeInKB = Math.round(credsData.length / 1024);
                
                // Send credentials data
                await safeSendMessage(sock, senderId, { 
                    text: `*WhatsApp Credentials for Heroku Deployment*\n\n` +
                          `📋 Data size: ${dataSizeInKB} KB\n\n` +
                          `*Instructions:*\n` +
                          `1. Add the value below as \`CREDS_DATA\` in your Heroku environment variables\n` +
                          `2. Ensure \`PLATFORM=heroku\` is also set\n` +
                          `3. Data is base64 encoded and compressed\n\n` +
                          `\`\`\`\n${credsData}\n\`\`\``
                });
                
                // Send follow-up message with deployment instructions
                await safeSendMessage(sock, senderId, {
                    text: `*Heroku Deployment Steps*\n\n` +
                          `1. Create a new Heroku app\n` +
                          `2. Connect your GitHub repository\n` +
                          `3. Set the following environment variables:\n` +
                          `   - \`CREDS_DATA\`: the data from the previous message\n` +
                          `   - \`PLATFORM\`: heroku\n` +
                          `   - \`NODE_ENV\`: production\n` +
                          `   - \`OWNER_NUMBER\`: your WhatsApp number\n` +
                          `4. Deploy your app\n\n` +
                          `*Note:* Keep your credentials secure and don't share them!`
                });
                
                logger.info('Credentials data sent to bot owner for Heroku deployment');
            } catch (error) {
                logger.error('Error in getcreds command:', error);
                await safeSendMessage(sock, message.key.remoteJid, { 
                    text: '❌ Error generating credentials data: ' + error.message 
                });
            }
        }
    },
    
    // Command metadata
    category: 'owner',
    description: 'Heroku Deployment Commands',
    
    // Initialize (required for consistent module structure)
    async init() {
        logger.info('Heroku deployment commands loaded');
        return true;
    }
};