/**
 * Educational Command Module
 * Educational tools and utilities for WhatsApp Bot
 */

// Import required modules
const logger = require('../../utils/logger');
const axios = require('axios');
const mathjs = require('mathjs');
const { safeSendText } = require('../../utils/jidHelper');

// Create a basic educational module
const educationalCommands = {
    async translate(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;
            const [targetLang, ...textParts] = args;
            const textToTranslate = textParts.join(' ');

            if (!targetLang || !textToTranslate) {
                await safeSendText(sock, remoteJid, '*🌐 Usage:* .translate [target_language] [text]\nExample: .translate es Hello, how are you?');
                return;
            }

            // Target language should be a valid 2-letter ISO language code
            const validLanguageCodes = ['af', 'sq', 'am', 'ar', 'hy', 'az', 'eu', 'be', 'bn', 'bs', 'bg', 'ca', 'ceb', 'zh', 'zh-CN', 'zh-TW', 'co', 'hr', 'cs', 'da', 'nl', 'en', 'eo', 'et', 'fi', 'fr', 'fy', 'gl', 'ka', 'de', 'el', 'gu', 'ht', 'ha', 'haw', 'he', 'hi', 'hmn', 'hu', 'is', 'ig', 'id', 'ga', 'it', 'ja', 'jv', 'kn', 'kk', 'km', 'rw', 'ko', 'ku', 'ky', 'lo', 'la', 'lv', 'lt', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'mi', 'mr', 'mn', 'my', 'ne', 'no', 'ny', 'or', 'ps', 'fa', 'pl', 'pt', 'pa', 'ro', 'ru', 'sm', 'gd', 'sr', 'st', 'sn', 'sd', 'si', 'sk', 'sl', 'so', 'es', 'su', 'sw', 'sv', 'tl', 'tg', 'ta', 'tt', 'te', 'th', 'tr', 'tk', 'uk', 'ur', 'ug', 'uz', 'vi', 'cy', 'xh', 'yi', 'yo', 'zu'];

            if (!validLanguageCodes.includes(targetLang.toLowerCase())) {
                await safeSendText(sock, remoteJid, '*❌ Invalid target language code*\nPlease use a valid 2-letter ISO language code (e.g., "es" for Spanish).');
                return;
            }

            await safeSendText(sock, remoteJid, '🔄 Translating...');

            // Use a free translation API
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(textToTranslate)}`;

            const response = await axios.get(url);

            if (response.data && response.data[0] && response.data[0][0]) {
                const translation = response.data[0].map(item => item[0]).join('');
                const detectedLang = response.data[2];

                await safeSendText(sock, remoteJid, `*🌐 Translation (${detectedLang} → ${targetLang})*\n\n${translation}`);
            } else {
                await safeSendText(sock, remoteJid, '*❌ Translation failed*\nPlease try again with a different text or language.');
            }
        } catch (err) {
            logger.error('Error in translate command:', err);
            await safeSendText(sock, message.key.remoteJid, 'Error translating text');
        }
    },

    async dictionary(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;
            const word = args.join(' ').trim();

            if (!word) {
                await safeSendText(sock, remoteJid, '*📚 Usage:* .dictionary [word]\nExample: .dictionary serendipity');
                return;
            }

            await safeSendText(sock, remoteJid, '🔍 Looking up word...');

            // Use a free dictionary API
            const response = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);

            if (response.data && response.data.length > 0) {
                const entry = response.data[0];
                let result = `*📚 ${entry.word}*\n`;
                
                if (entry.phonetic) {
                    result += `Pronunciation: ${entry.phonetic}\n`;
                }
                
                result += '\n';

                // Get definitions
                if (entry.meanings && entry.meanings.length > 0) {
                    entry.meanings.forEach((meaning, index) => {
                        if (index < 3) { // Limit to 3 meanings to avoid overflow
                            result += `*${meaning.partOfSpeech}*\n`;
                            
                            meaning.definitions.slice(0, 2).forEach((def, idx) => {
                                result += `${idx + 1}. ${def.definition}\n`;
                                
                                if (def.example) {
                                    result += `   Example: "${def.example}"\n`;
                                }
                            });
                            
                            result += '\n';
                        }
                    });
                }
                
                await safeSendText(sock, remoteJid, result);
            } else {
                await safeSendText(sock, remoteJid, `*❌ Word not found*\nCould not find the word "${word}" in the dictionary.`);
            }
        } catch (err) {
            logger.error('Error in dictionary command:', err);
            await safeSendText(sock, message.key.remoteJid, 'Error looking up word');
        }
    },

    async define(sock, message, args) {
        return await this.dictionary(sock, message, args);
    },

    async calculate(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;
            const expression = args.join(' ').trim();

            if (!expression) {
                await safeSendText(sock, remoteJid, '*🔢 Usage:* .calculate [expression]\nExample: .calculate 2 + 2 * 3');
                return;
            }

            try {
                // Safely evaluate the expression
                const result = mathjs.evaluate(expression);
                await safeSendText(sock, remoteJid, `*🔢 ${expression} = ${result}*`);
            } catch (error) {
                await safeSendText(sock, remoteJid, `*❌ Math Error:* ${error.message}`);
            }
        } catch (err) {
            logger.error('Error in calculate command:', err);
            await safeSendText(sock, message.key.remoteJid, 'Error in calculation');
        }
    },

    async periodic(sock, message, args) {
        try {
            const remoteJid = message.key.remoteJid;
            const element = args[0]?.trim();

            if (!element) {
                await safeSendText(sock, remoteJid, '*🧪 Usage:* .periodic [element]\nExample: .periodic Na');
                return;
            }

            // Define periodic table elements (simplified)
            const elements = {
                'h': { name: 'Hydrogen', symbol: 'H', atomicNumber: 1, weight: 1.008 },
                'he': { name: 'Helium', symbol: 'He', atomicNumber: 2, weight: 4.0026 },
                'li': { name: 'Lithium', symbol: 'Li', atomicNumber: 3, weight: 6.94 },
                'be': { name: 'Beryllium', symbol: 'Be', atomicNumber: 4, weight: 9.0122 },
                'b': { name: 'Boron', symbol: 'B', atomicNumber: 5, weight: 10.81 },
                'c': { name: 'Carbon', symbol: 'C', atomicNumber: 6, weight: 12.011 },
                'n': { name: 'Nitrogen', symbol: 'N', atomicNumber: 7, weight: 14.007 },
                'o': { name: 'Oxygen', symbol: 'O', atomicNumber: 8, weight: 15.999 },
                'f': { name: 'Fluorine', symbol: 'F', atomicNumber: 9, weight: 18.998 },
                'ne': { name: 'Neon', symbol: 'Ne', atomicNumber: 10, weight: 20.180 },
                'na': { name: 'Sodium', symbol: 'Na', atomicNumber: 11, weight: 22.990 },
                'mg': { name: 'Magnesium', symbol: 'Mg', atomicNumber: 12, weight: 24.305 },
                'al': { name: 'Aluminum', symbol: 'Al', atomicNumber: 13, weight: 26.982 },
                'si': { name: 'Silicon', symbol: 'Si', atomicNumber: 14, weight: 28.085 },
                'p': { name: 'Phosphorus', symbol: 'P', atomicNumber: 15, weight: 30.974 },
                's': { name: 'Sulfur', symbol: 'S', atomicNumber: 16, weight: 32.06 },
                'cl': { name: 'Chlorine', symbol: 'Cl', atomicNumber: 17, weight: 35.45 },
                'ar': { name: 'Argon', symbol: 'Ar', atomicNumber: 18, weight: 39.948 },
                'k': { name: 'Potassium', symbol: 'K', atomicNumber: 19, weight: 39.098 },
                'ca': { name: 'Calcium', symbol: 'Ca', atomicNumber: 20, weight: 40.078 },
                'fe': { name: 'Iron', symbol: 'Fe', atomicNumber: 26, weight: 55.845 },
                'cu': { name: 'Copper', symbol: 'Cu', atomicNumber: 29, weight: 63.546 },
                'zn': { name: 'Zinc', symbol: 'Zn', atomicNumber: 30, weight: 65.38 },
                'ag': { name: 'Silver', symbol: 'Ag', atomicNumber: 47, weight: 107.87 },
                'au': { name: 'Gold', symbol: 'Au', atomicNumber: 79, weight: 196.97 },
                'pb': { name: 'Lead', symbol: 'Pb', atomicNumber: 82, weight: 207.2 },
                'u': { name: 'Uranium', symbol: 'U', atomicNumber: 92, weight: 238.03 }
            };

            // Find element by symbol, case-insensitive
            const key = element.toLowerCase();
            const foundElement = elements[key];

            if (foundElement) {
                const response = `*🧪 ${foundElement.name} (${foundElement.symbol})*\n\n• Atomic Number: ${foundElement.atomicNumber}\n• Atomic Weight: ${foundElement.weight} u\n\nElement ${foundElement.atomicNumber} in the periodic table.`;
                await safeSendText(sock, remoteJid, response);
            } else {
                await safeSendText(sock, remoteJid, `*❌ Element not found*\nCould not find element with symbol "${element}".`);
            }
        } catch (err) {
            logger.error('Error in periodic command:', err);
            await safeSendText(sock, message.key.remoteJid, 'Error retrieving element information');
        }
    },

    // Initialize function
    async init() {
        try {
            return true;
        } catch (err) {
            console.error('Error initializing educational module:', err);
            return false;
        }
    }
};

module.exports = {
    commands: educationalCommands,
    category: 'educational',
    init: educationalCommands.init
};
