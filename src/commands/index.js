const logger = require('../utils/logger');
const { 
    validateMediaCommands, 
    validateEducationalCommands 
} = require('../utils/commandValidator');

// Import all command modules
const ownerCommands = require('./owner');
const groupCommands = require('./group');
const groupNewCommands = require('./group_new');
const userCommands = require('./user');
const userExtendedCommands = require('./user_extended'); // Added extended user commands
const basicCommands = require('./basic');
const funCommands = require('./fun');
const mediaCommands = require('./media');
// Educational commands are loaded from educational.js, which imports from educational/commands.js
// This prevents double loading of the same commands
const educationalCommands = require('./educational');
// NSFW module now fixed with ESM compatibility for file-type package
const nsfwCommands = require('./nsfw');
const reactionCommands = require('./reactions');
const utilityCommands = require('./utility');
const menuCommands = require('./menu'); // Added menu commands

// Initialize modules in the correct order
async function initializeModules(sock) {
    logger.info('🔄 Starting command module initialization...');

    const modules = [
        { name: 'Basic', module: basicCommands },
        { name: 'Owner', module: ownerCommands },
        { name: 'Group Base', module: groupCommands },
        { name: 'Group Extended', module: groupNewCommands },
        { name: 'User', module: userCommands },
        { name: 'User Extended', module: userExtendedCommands },
        { name: 'Fun', module: funCommands },
        { name: 'Media', module: mediaCommands, validator: validateMediaCommands },
        { name: 'Educational', module: educationalCommands, validator: validateEducationalCommands },
        { name: 'NSFW', module: nsfwCommands },
        { name: 'Reactions', module: reactionCommands },
        { name: 'Utility', module: utilityCommands },
        { name: 'Menu', module: menuCommands }
    ];

    // Initialize each module
    for (const { name, module, validator } of modules) {
        try {
            // First, check if the module is properly defined
            if (!module) {
                logger.error(`❌ Module ${name} is undefined or null`);
                continue;
            }

            // Check for the presence of category and commands
            if (module.category) {
                logger.info(`✓ Found category "${module.category}" in ${name} module`);
            } else {
                logger.warn(`⚠️ Missing category in ${name} module`);
            }

            if (module.commands) {
                const commandCount = Object.keys(module.commands).filter(
                    cmd => typeof module.commands[cmd] === 'function' && cmd !== 'init'
                ).length;
                logger.info(`✓ Found ${commandCount} commands in ${name} module`);
            } else {
                logger.warn(`⚠️ Missing commands object in ${name} module`);
            }

            // Run validator if available
            if (validator) {
                logger.info(`→ Running validator for ${name} module...`);
                const validationResult = await validator(sock);
                if (!validationResult) {
                    logger.warn(`⚠️ Validation failed for ${name} module but will continue with initialization`);
                }
            }

            // Check and call the init method
            if (typeof module.init === 'function') {
                logger.info(`→ Initializing ${name} module...`);
                const success = await module.init(sock);
                if (success) {
                    logger.info(`✅ Successfully initialized ${name} module`);
                } else {
                    logger.error(`❌ Failed to initialize ${name} module (init returned false)`);
                }
            } else {
                logger.warn(`⚠️ No init method found in ${name} module`);
            }
        } catch (err) {
            logger.error(`❌ Error initializing ${name} module:`, err);
            logger.error(`Stack trace: ${err.stack}`);
        }
    }
}

// Import the command adapter for standardization
const { extractCommands, countCommands, standardizeCommandModule } = require('../utils/commandAdapter');

// Helper function to safely load commands
function loadCommandsFromModule(module, name) {
    try {
        if (!module) {
            logger.warn(`⚠️ Module "${name}" is null or undefined`);
            return {};
        }
        
        // Standardize the module format
        const standardized = standardizeCommandModule(module, name);
        const commandsObject = standardized.commands;
        const category = standardized.category || name.split('_')[0];
        const commandCount = countCommands(module, name);
        
        logger.info(`✓ Successfully loaded ${commandCount} commands from "${name}" (category: "${category}")`);
        
        if (commandCount === 0) {
            logger.warn(`⚠️ No commands found in "${name}" module`);
        }
        
        return commandsObject;
    } catch (err) {
        logger.error(`❌ Error loading "${name}" commands:`, err);
        console.error(err); // Print to console for debugging
        return {};
    }
}

// Initialize all modules function export
// The actual initialization will be called from src/index.js with the sock object

// Combine all commands with proper error handling
const commands = {
    // Basic commands
    ...loadCommandsFromModule(basicCommands, 'basic'),

    // Owner commands
    ...loadCommandsFromModule(ownerCommands, 'owner'),

    // Group commands - both base and extended
    ...loadCommandsFromModule(groupCommands, 'group_base'),
    ...loadCommandsFromModule(groupNewCommands, 'group_extended'),

    // User commands
    ...loadCommandsFromModule(userCommands, 'user'),
    ...loadCommandsFromModule(userExtendedCommands, 'user_extended'),

    // Fun commands
    ...loadCommandsFromModule(funCommands, 'fun'),

    // Media commands
    ...loadCommandsFromModule(mediaCommands, 'media'),

    // Educational commands
    ...loadCommandsFromModule(educationalCommands, 'educational'),

    // NSFW commands
    ...loadCommandsFromModule(nsfwCommands, 'nsfw'),

    // Reaction commands
    ...loadCommandsFromModule(reactionCommands, 'reactions'),

    // Utility commands
    ...loadCommandsFromModule(utilityCommands, 'utility'),
    
    // Menu commands
    ...loadCommandsFromModule(menuCommands, 'menu')
};

// Log total number of commands loaded
const commandCount = Object.keys(commands).length;
logger.info(`\n✅ Total commands loaded: ${commandCount}`);

module.exports = {
    commands,
    initializeModules
};