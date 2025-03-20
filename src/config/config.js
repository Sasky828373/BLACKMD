/**
 * BLACKSKY-MD Configuration File
 * Contains all bot configuration settings
 */

const config = {
    /**
     * Bot Owner Configuration
     * This configuration determines who can use owner-only commands
     */
    owner: {
        /**
         * Bot owner's phone number
         * Format: full phone number without any special characters
         * Example: '12025550199'
         * 
         * This can also be set via environment variable OWNER_NUMBER
         */
        number: process.env.OWNER_NUMBER || '',
        
        /**
         * Whether to strictly validate owner number
         * When true, owner commands will only work for exact match with configured number
         * When false, some flexibility is provided (not recommended for production)
         */
        strictValidation: true
    },
    
    /**
     * Bot Security Configuration
     */
    security: {
        /**
         * Whether to enforce admin permissions for group commands
         * When true, commands marked as requiring admin will only work for actual admins
         * When false, these commands will be available to all users (not recommended)
         */
        enforceAdminPermissions: true,
        
        /**
         * Whether to require the bot to be an admin to execute admin commands
         * Some commands require the bot to have admin privileges to work properly
         */
        requireBotAdminStatus: true
    },
    
    /**
     * Command Configuration
     */
    commands: {
        /**
         * Default command prefix
         * This is used to trigger commands, e.g., !help
         */
        prefix: '!',
        
        /**
         * Whether to allow multiple prefixes
         * When true, commands can be triggered with any of the specified prefixes
         */
        allowMultiplePrefixes: true,
        
        /**
         * Alternative prefixes to use if allowMultiplePrefixes is true
         */
        alternatePrefixes: ['/', '.', '#'],
        
        /**
         * Whether to enable case-insensitive command matching
         * When true, !Help, !HELP, and !help will all trigger the help command
         */
        caseInsensitive: true
    },
    
    /**
     * Message Processing Configuration
     */
    messaging: {
        /**
         * Maximum message processing queue size
         * Messages beyond this limit will be dropped during high traffic
         */
        maxQueueSize: 100,
        
        /**
         * Whether to delete command messages after processing
         * Only works in groups where the bot is an admin
         */
        deleteCommandMessages: false,
        
        /**
         * Whether to send "typing..." indicator before responding
         */
        sendTypingIndicator: true
    }
};

module.exports = config;