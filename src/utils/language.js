/**
 * Language Manager
 * Provides multi-language support with fallback for missing translations
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { ensureDirectoryExists, readJsonFile, writeJsonFile } = require('./fileUtils');

// Default language settings
const DEFAULT_LANGUAGE = 'en';
const TRANSLATIONS_DIR = path.join(process.cwd(), 'data', 'translations');

// Default translations
const DEFAULT_TRANSLATIONS = {
    system: {
        error: 'An error occurred: {0}',
        command_not_found: 'Command not found: {0}',
        missing_permissions: 'You do not have permission to use this command.',
        command_on_cooldown: 'Please wait {0} seconds before using this command again.',
        nsfw_not_allowed: 'NSFW content is not allowed in this group.'
    },
    basic: {
        ping_response: 'Pong! Response time: {0}ms',
        help_title: 'Help Menu',
        help_description: 'Here are the available commands:',
        info_title: 'Bot Information',
        info_uptime: 'Uptime: {0}',
        info_memory: 'Memory Usage: {0}MB'
    },
    menu: {
        header: 'Command Menu',
        footer: 'Use !help <command> for more information about a specific command.'
    }
};

class LanguageManager {
    constructor(options = {}) {
        this.languages = {};
        this.currentLanguage = options.defaultLanguage || DEFAULT_LANGUAGE;
        this.translationsDir = options.translationsDir || TRANSLATIONS_DIR;
        this.missingTranslationsLogged = new Set();

        // Ensure translations directory exists
        ensureDirectoryExists(this.translationsDir);
        
        // Load English as default language
        this.languages[DEFAULT_LANGUAGE] = { ...DEFAULT_TRANSLATIONS };
        this.saveTranslation(DEFAULT_LANGUAGE, this.languages[DEFAULT_LANGUAGE]);
    }

    /**
     * Load translations from files
     * @returns {Promise<boolean>} Whether loading was successful
     */
    async loadTranslations() {
        try {
            logger.info('Loading translations...');
            
            const files = fs.readdirSync(this.translationsDir);
            let translationsLoaded = 0;
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const languageCode = file.replace('.json', '');
                    const filePath = path.join(this.translationsDir, file);
                    
                    const translation = readJsonFile(filePath);
                    if (translation) {
                        this.languages[languageCode] = translation;
                        translationsLoaded++;
                    }
                }
            }
            
            logger.info(`Loaded ${translationsLoaded} translations`);
            
            // Ensure default language exists
            if (!this.languages[DEFAULT_LANGUAGE]) {
                this.languages[DEFAULT_LANGUAGE] = { ...DEFAULT_TRANSLATIONS };
                this.saveTranslation(DEFAULT_LANGUAGE, this.languages[DEFAULT_LANGUAGE]);
            }
            
            return true;
        } catch (error) {
            logger.error('Error loading translations:', error);
            
            // Ensure default language is available even on error
            this.languages[DEFAULT_LANGUAGE] = { ...DEFAULT_TRANSLATIONS };
            
            return false;
        }
    }

    /**
     * Get translated text for a key in the current language
     * @param {string} key - Dot-notation key to look up (e.g., "system.error")
     * @param {string|null} lang - Override language (uses current language if null)
     * @param {...any} args - Arguments to format the string with
     * @returns {string} - Translated text or key if not found
     */
    getText(key, lang = null, ...args) {
        const language = lang || this.currentLanguage;
        
        // Try to get translation in requested language
        let translation = this.getTranslationByKey(key, language);
        
        // Fall back to default language if not found
        if (!translation && language !== DEFAULT_LANGUAGE) {
            translation = this.getTranslationByKey(key, DEFAULT_LANGUAGE);
            
            // Log missing translation (only once per key)
            const logKey = `${language}:${key}`;
            if (!this.missingTranslationsLogged.has(logKey)) {
                this.logMissingOnce(`Missing translation for key '${key}' in language '${language}'`);
                this.missingTranslationsLogged.add(logKey);
            }
        }
        
        // If still not found, return the key itself
        if (!translation) {
            return key;
        }
        
        // Format translation with arguments
        return this.formatTranslation(translation, ...args);
    }

    /**
     * Log a missing translation message only once to prevent spam
     * @param {string} message - The message to log
     */
    logMissingOnce(message) {
        logger.warn(message);
    }

    /**
     * Get a list of missing translations for a specific language
     * @param {string} compareLanguage - The language to compare against default language
     * @returns {Array} - List of missing translation keys
     */
    getMissingTranslations(compareLanguage) {
        const missing = [];
        const defaultLang = this.languages[DEFAULT_LANGUAGE];
        const compareLang = this.languages[compareLanguage] || {};
        
        // Helper function to check nested objects recursively
        const checkNested = (obj1, obj2, currentPath = '') => {
            for (const key in obj1) {
                const newPath = currentPath ? `${currentPath}.${key}` : key;
                
                if (typeof obj1[key] === 'object' && obj1[key] !== null) {
                    if (!obj2[key] || typeof obj2[key] !== 'object') {
                        missing.push(newPath);
                    } else {
                        checkNested(obj1[key], obj2[key], newPath);
                    }
                } else if (obj2[key] === undefined) {
                    missing.push(newPath);
                }
            }
        };
        
        checkNested(defaultLang, compareLang);
        return missing;
    }

    /**
     * Analyze the completeness of translations for all languages
     * @returns {Object} - Statistics about translation completeness
     */
    getTranslationStats() {
        const stats = {};
        const defaultLang = this.languages[DEFAULT_LANGUAGE];
        const defaultCount = this.countLeafKeys(defaultLang);
        
        for (const lang in this.languages) {
            if (lang === DEFAULT_LANGUAGE) {
                stats[lang] = {
                    total: defaultCount,
                    translated: defaultCount,
                    percentage: 100
                };
                continue;
            }
            
            const langObj = this.languages[lang];
            const missing = this.getMissingTranslations(lang);
            const translated = defaultCount - missing.length;
            const percentage = Math.round((translated / defaultCount) * 100);
            
            stats[lang] = {
                total: defaultCount,
                translated,
                percentage,
                missing
            };
        }
        
        return stats;
    }

    /**
     * Check if a language is supported
     * @param {string} language - Language code to check
     * @returns {boolean} - Whether the language is supported
     */
    isLanguageSupported(language) {
        return !!this.languages[language];
    }

    /**
     * Get list of available languages
     * @returns {Array<string>} - List of language codes
     */
    getAvailableLanguages() {
        return Object.keys(this.languages);
    }

    /**
     * Get specific translation from a language
     * @param {string} key - Dot-notation key
     * @param {string} language - Language code
     * @returns {string|null} - Translation or null if not found
     */
    getTranslationByKey(key, language) {
        const langObj = this.languages[language];
        if (!langObj) return null;
        
        // Parse dot notation (e.g., "system.error")
        const parts = key.split('.');
        let current = langObj;
        
        for (const part of parts) {
            if (current[part] === undefined) {
                return null;
            }
            current = current[part];
        }
        
        return current;
    }

    /**
     * Format a translation string with arguments
     * @param {string} translation - Translation string with placeholders
     * @param {...any} args - Arguments to insert
     * @returns {string} - Formatted translation
     * @private
     */
    formatTranslation(translation, ...args) {
        if (!args.length) return translation;
        
        return translation.replace(/{(\d+)}/g, (match, index) => {
            const argIndex = Number(index);
            return args[argIndex] !== undefined ? args[argIndex] : match;
        });
    }

    /**
     * Count total number of leaf keys in a nested object
     * @param {Object} obj - The object to count keys in
     * @returns {number} - Number of leaf keys
     * @private
     */
    countLeafKeys(obj) {
        let count = 0;
        
        const countNested = (o) => {
            for (const key in o) {
                if (typeof o[key] === 'object' && o[key] !== null) {
                    countNested(o[key]);
                } else {
                    count++;
                }
            }
        };
        
        countNested(obj);
        return count;
    }

    /**
     * Set current language
     * @param {string} language - Language code to set
     * @returns {boolean} - Whether the language was set successfully
     */
    setLanguage(language) {
        if (this.isLanguageSupported(language)) {
            this.currentLanguage = language;
            logger.info(`Language set to ${language}`);
            return true;
        }
        
        logger.warn(`Language ${language} is not supported`);
        return false;
    }

    /**
     * Add a new language or update an existing one
     * @param {string} language - Language code
     * @param {Object} translations - Translation object
     * @returns {boolean} - Whether the operation was successful
     */
    addLanguage(language, translations) {
        this.languages[language] = translations;
        this.saveTranslation(language, translations);
        return true;
    }

    /**
     * Save a translation to file
     * @param {string} language - Language code
     * @param {Object} translations - Translation object
     * @returns {boolean} - Whether the operation was successful
     * @private
     */
    saveTranslation(language, translations) {
        const filePath = path.join(this.translationsDir, `${language}.json`);
        return writeJsonFile(filePath, translations);
    }
}

// Create singleton instance
const languageManager = new LanguageManager();

// Ensure translations are loaded when the module is imported
(async () => {
    await languageManager.loadTranslations();
})();

module.exports = {
    LanguageManager,
    languageManager
};