const logger = require('../../utils/logger');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');

// Import commands
const educationalCommands = require('./commands');

// Directory initialization with error handling
async function initializeDirectories() {
    const dirs = [
        'data/educational',
        'data/educational/flashcards',
        'data/educational/mindmaps',
        'data/educational/quiz_scores', 
        'data/educational/study_materials',
        'data/educational/language_exercises',
        'data/educational/math_solutions',
        'data/educational/study_plans'
    ];

    try {
        // Ensure base data directory exists first
        const baseDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(baseDir)) {
            await fsPromises.mkdir(baseDir, { recursive: true });
            logger.info('Created base data directory');
        }

        // Log each directory path for debugging
        for (const dir of dirs) {
            const fullPath = path.join(process.cwd(), dir);
            logger.info(`Attempting to initialize directory: ${fullPath}`);

            try {
                if (!fs.existsSync(fullPath)) {
                    await fsPromises.mkdir(fullPath, { recursive: true });
                    logger.info(`✓ Educational directory created: ${dir}`);
                } else {
                    logger.info(`✓ Educational directory exists: ${dir}`);
                }
            } catch (dirErr) {
                logger.error(`Failed to initialize directory ${dir}:`, dirErr);
                throw dirErr;
            }
        }
        return true;
    } catch (err) {
        logger.error('Error initializing educational directories:', err);
        logger.error('Stack trace:', err.stack);
        return false;
    }
}

module.exports = {
    commands: educationalCommands,
    category: 'educational',
    fs,
    fsPromises,
    async init() {
        try {
            logger.info('🔄 Initializing Educational module...');

            // Verify core dependencies first
            const coreDeps = {
                'fs': fs,
                'fsPromises': fsPromises,
                'path': path,
                'logger': logger,
                'commands': educationalCommands
            };

            for (const [name, dep] of Object.entries(coreDeps)) {
                if (!dep) {
                    logger.error(`❌ Core educational dependency '${name}' is not initialized`);
                    return false;
                }
                logger.info(`✓ Core educational dependency '${name}' verified`);
            }

            // Initialize all required directories
            const initialized = await initializeDirectories();
            if (!initialized) {
                logger.error('❌ Failed to initialize educational directories');
                return false;
            }

            logger.info('✅ Educational module initialized successfully');
            return true;
        } catch (err) {
            logger.error('❌ Failed to initialize Educational module:', err);
            logger.error('Stack trace:', err.stack);
            return false;
        }
    }
};