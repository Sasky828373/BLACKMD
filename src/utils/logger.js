/**
 * Enhanced Logging Utility
 * Provides consistent logging with timestamp and level indicators
 */

const fs = require('fs');
const path = require('path');
const pino = require('pino');

// Constants
const LOG_LEVELS = {
    debug: 20,
    info: 30,
    success: 35,
    warn: 40,
    error: 50
};

// Log configuration
let config = {
    level: 'info',
    enableConsole: true,
    enableFile: true,
    logDirectory: path.join(process.cwd(), 'logs'),
    logFilename: 'whatsapp-bot.log'
};

// Create log directory if it doesn't exist
function ensureLogDirectory() {
    if (!fs.existsSync(config.logDirectory)) {
        fs.mkdirSync(config.logDirectory, { recursive: true });
    }
}

// Get current timestamp
function getTimestamp() {
    const now = new Date();
    return now.toISOString();
}

// Format log message with timestamp and level
function formatLogMessage(level, message, ...args) {
    let formattedMessage = message;
    
    // Handle object or error messages
    if (typeof message === 'object') {
        if (message instanceof Error) {
            formattedMessage = message.stack || message.toString();
        } else {
            try {
                formattedMessage = JSON.stringify(message);
            } catch (e) {
                formattedMessage = String(message);
            }
        }
    }
    
    // Format additional arguments
    if (args.length > 0) {
        args.forEach(arg => {
            if (typeof arg === 'object') {
                if (arg instanceof Error) {
                    formattedMessage += ' ' + (arg.stack || arg.toString());
                } else {
                    try {
                        formattedMessage += ' ' + JSON.stringify(arg);
                    } catch (e) {
                        formattedMessage += ' ' + String(arg);
                    }
                }
            } else {
                formattedMessage += ' ' + String(arg);
            }
        });
    }
    
    const timestamp = getTimestamp();
    return `[${timestamp}] [${level.toUpperCase()}] ${formattedMessage}`;
}

// Write log to file
function writeToLogFile(message) {
    if (!config.enableFile) return;
    
    ensureLogDirectory();
    const logFilePath = path.join(config.logDirectory, config.logFilename);
    
    fs.appendFileSync(logFilePath, message + '\n');
}

// Create Pino logger for pretty console output
const pinoLogger = pino({
    customLevels: {
        success: 35
    },
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
        }
    }
});

// Logger object
const logger = {
    debug(message, ...args) {
        if (LOG_LEVELS[config.level] <= LOG_LEVELS.debug) {
            const formattedMessage = formatLogMessage('debug', message, ...args);
            
            if (config.enableConsole) {
                pinoLogger.debug(formattedMessage);
            }
            
            writeToLogFile(formattedMessage);
        }
    },
    
    info(message, ...args) {
        if (LOG_LEVELS[config.level] <= LOG_LEVELS.info) {
            const formattedMessage = formatLogMessage('info', message, ...args);
            
            if (config.enableConsole) {
                pinoLogger.info(formattedMessage);
            }
            
            writeToLogFile(formattedMessage);
        }
    },
    
    success(message, ...args) {
        if (LOG_LEVELS[config.level] <= LOG_LEVELS.success) {
            const formattedMessage = formatLogMessage('success', message, ...args);
            
            if (config.enableConsole) {
                pinoLogger.success(formattedMessage);
            }
            
            writeToLogFile(formattedMessage);
        }
    },
    
    warn(message, ...args) {
        if (LOG_LEVELS[config.level] <= LOG_LEVELS.warn) {
            const formattedMessage = formatLogMessage('warn', message, ...args);
            
            if (config.enableConsole) {
                pinoLogger.warn(formattedMessage);
            }
            
            writeToLogFile(formattedMessage);
        }
    },
    
    error(message, ...args) {
        if (LOG_LEVELS[config.level] <= LOG_LEVELS.error) {
            const formattedMessage = formatLogMessage('error', message, ...args);
            
            if (config.enableConsole) {
                pinoLogger.error(formattedMessage);
            }
            
            writeToLogFile(formattedMessage);
        }
    },
    
    setLogLevel(level) {
        if (LOG_LEVELS[level]) {
            config.level = level;
        }
    },
    
    enableFileLogging(enable = true, filePath = null) {
        config.enableFile = enable;
        
        if (filePath) {
            config.logFilename = path.basename(filePath);
            config.logDirectory = path.dirname(filePath);
        }
    },
    
    // Module initialization start logging - used by command modules to indicate initialization beginning
    moduleInit(moduleName) {
        const formattedMessage = formatLogMessage('info', `🔄 Initializing module: ${moduleName}`);
        
        if (config.enableConsole) {
            pinoLogger.info(formattedMessage);
        }
        
        writeToLogFile(formattedMessage);
    },
    
    // Module success logging - used by command modules to indicate successful initialization
    moduleSuccess(moduleName) {
        const formattedMessage = formatLogMessage('success', `✅ Module initialized: ${moduleName}`);
        
        if (config.enableConsole) {
            pinoLogger.success(formattedMessage);
        }
        
        writeToLogFile(formattedMessage);
    },
    
    // Module error logging - used by command modules to indicate initialization failure
    moduleError(moduleName, error) {
        const errorMessage = error instanceof Error ? error.stack || error.message : String(error);
        const formattedMessage = formatLogMessage('error', `❌ Module initialization failed: ${moduleName}`, errorMessage);
        
        if (config.enableConsole) {
            pinoLogger.error(formattedMessage);
        }
        
        writeToLogFile(formattedMessage);
    }
};

module.exports = logger;