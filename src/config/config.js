/**
 * BLACKSKY-MD Configuration File
 * Contains all bot configuration settings
 */

const config = {
    /**
     * Bot Configuration
     * General settings for the bot
     */
    bot: {
        /**
         * Default command prefix
         * This is used to trigger commands, e.g., !help
         */
        prefix: process.env.BOT_PREFIX || '.',
        
        /**
         * Bot name
         * Used in welcome messages and responses
         */
        name: process.env.BOT_NAME || 'BLACKSKY-MD',
        
        /**
         * Bot language
         * Default language for responses
         */
        language: process.env.BOT_LANG || 'en'
    },

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
         * For security, using the environment variable is recommended
         */
        number: process.env.OWNER_NUMBER || '4915563151347, // Replace this with your WhatsApp number
        
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
        prefix: process.env.BOT_PREFIX || '.',
        
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
    },
    
    /**
     * External API Keys
     * These keys are used for various commands
     * You can set these via environment variables or directly here
     * IMPORTANT: Never commit your actual API keys to a public repository
     */
    apis: {
        /**
         * OpenWeatherMap API Key
         * Used for weather commands
         * Get key at: https://openweathermap.org/api
         */
        openweather: process.env.OPENWEATHERMAP_API_KEY || '0176411203b847c32979f7f06f8fe762',
        
        /**
         * Google API Key
         * Used for various Google services
         * Get key at: https://console.cloud.google.com/
         */
        google: process.env.GOOGLE_API_KEY || '',
        
        /**
         * YouTube API Key
         * Used for YouTube commands
         * Get key at: https://console.cloud.google.com/
         */
        youtube: process.env.YOUTUBE_API_KEY || '',
        
        /**
         * Spotify API Credentials
         * Used for music info commands
         * Get keys at: https://developer.spotify.com/
         */
        spotify: {
            clientId: process.env.SPOTIFY_CLIENT_ID || '',
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET || ''
        },
        
        /**
         * News API Key
         * Used for news commands
         * Get key at: https://newsapi.org/
         */
        news: process.env.NEWS_API_KEY || '',
        
        /**
         * OpenAI API Key
         * Used for AI features
         * Get key at: https://platform.openai.com/
         */
        openai: process.env.OPENAI_API_KEY || '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',
        
        /**
         * RemoveBG API Key
         * Used for background removal in images
         * Get key at: https://www.remove.bg/api
         */
        removebg: process.env.REMOVEBG_API_KEY || '',
        
        /**
         * Wolfram Alpha App ID
         * Used for scientific calculations
         * Get ID at: https://products.wolframalpha.com/api/
         */
        wolfram: process.env.WOLFRAM_APP_ID || '',
        
        /**
         * TMDB API Key
         * Used for movie and TV info
         * Get key at: https://www.themoviedb.org/documentation/api
         */
        tmdb: process.env.TMDB_API_KEY || '',
        
        /**
         * DeepL API Key
         * Used for translations
         * Get key at: https://www.deepl.com/pro-api
         */
        deepl: process.env.DEEPL_API_KEY || '',
        
        /**
         * Twilio API Credentials
         * Used for SMS functionality
         * Get keys at: https://www.twilio.com/
         */
        twilio: {
            accountSid: process.env.TWILIO_ACCOUNT_SID || '',
            authToken: process.env.TWILIO_AUTH_TOKEN || '',
            phoneNumber: process.env.TWILIO_PHONE_NUMBER || ''
        }
    },
    
    /**
     * Heroku Configuration
     * Settings specific to Heroku deployment
     */
    heroku: {
        /**
         * Whether the bot is running on Heroku
         * This is detected automatically based on environment
         */
        isHeroku: process.env.PLATFORM === 'heroku' || !!process.env.DYNO,
        
        /**
         * Heroku app name
         * Used for generating app URL
         */
        appName: process.env.HEROKU_APP_NAME || '',
        
        /**
         * HTTP server port (set by Heroku)
         */
        port: process.env.PORT || 3000
    }
};

module.exports = config;
