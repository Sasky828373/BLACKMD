const logger = require('../utils/logger');
const config = require('../config/config');
const { languageManager } = require('../utils/language');
const axios = require('axios');

const { safeSendText, safeSendMessage, safeSendImage } = require('../utils/jidHelper');

const utilityCommands = {
    async weather(sock, sender, args) {
        try {
            const city = args.join(' ');
            if (!city) {
                await safeSendText(sock, sender, 'Please provide a city name');
                return;
            }

            const API_KEY = process.env.OPENWEATHER_API_KEY;
            if (!API_KEY) {
                logger.error('OpenWeather API key not found');
                await safeSendText(sock, sender, 'Weather service is currently unavailable');
                return;
            }

            const response = await axios.get(
                `http://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`
            );

            const weather = response.data;
            const message = `Weather in ${weather.name}:
🌡️ Temperature: ${weather.main.temp}°C
💧 Humidity: ${weather.main.humidity}%
🌪️ Wind: ${weather.wind.speed} m/s
☁️ Conditions: ${weather.weather[0].description}`;

            await safeSendText(sock, sender, message);
        } catch (err) {
            logger.error('Weather command error:', err);
            await safeSendText(sock, sender, 'Error fetching weather data. Please try again later.');
        }
    },

    async translate(sock, sender, args) {
        try {
            const [from, to, ...text] = args;
            if (!from || !to || text.length === 0) {
                await safeSendText(sock, sender, 'Usage: !translate [from] [to] [text]\nExample: !translate en es Hello');
                return;
            }

            const API_KEY = process.env.TRANSLATION_API_KEY;
            if (!API_KEY) {
                logger.error('Translation API key not found');
                await safeSendText(sock, sender, 'Translation service is currently unavailable');
                return;
            }

            // Using a mock translation for now - implement actual API later
            const translatedText = `Translated text will appear here (${from} -> ${to}): ${text.join(' ')}`;
            await safeSendText(sock, sender, translatedText);
        } catch (err) {
            logger.error('Translation error:', err);
            await safeSendText(sock, sender, 'Error during translation. Please try again later.');
        }
    },

    async calculate(sock, sender, args) {
        try {
            const expression = args.join(' ');
            if (!expression) {
                await safeSendText(sock, sender, '⚠️ Please provide a mathematical expression\nExample: .calculate 2 + 2 * 3');
                return;
            }

            // Enhanced sanitization and validation
            if (expression.length > 100) {
                await safeSendText(sock, sender, '❌ Expression too long. Maximum 100 characters allowed.');
                return;
            }

            // Block dangerous expressions
            const blockedPatterns = [
                'require', 'import', 'eval', 'process', 'global',
                '__', 'constructor', 'prototype', 'window', 'document'
            ];

            if (blockedPatterns.some(pattern => expression.toLowerCase().includes(pattern))) {
                await safeSendText(sock, sender, '❌ Invalid expression. Only mathematical operations are allowed.');
                return;
            }

            const sanitized = expression
                .replace(/[^0-9+\-*/(). ]/g, '')
                .replace(/\/{2,}/g, '/') 
                .replace(/\*{2,}/g, '*'); 

            if (sanitized.includes('..')) {
                throw new Error('Invalid expression');
            }

            // Use a safer evaluation method
            const result = new Function(`return ${sanitized}`)();

            if (isNaN(result) || !isFinite(result)) {
                await safeSendText(sock, sender, '❌ Invalid result. Please check your expression.');
                return;
            }

            await safeSendText(sock, sender, `🧮 ${expression} = ${Number(result.toFixed(8))}`);
        } catch (err) {
            logger.error('Calculate command error:', err);
            await safeSendText(sock, sender, '❌ Invalid expression. Please provide a valid mathematical expression.');
        }
    },

    async dictionary(sock, sender, args) {
        try {
            const word = args[0];
            if (!word) {
                await safeSendText(sock, sender, 'Please provide a word to look up');
                return;
            }

            const API_KEY = process.env.DICTIONARY_API_KEY;
            if (!API_KEY) {
                logger.error('Dictionary API key not found');
                await safeSendText(sock, sender, 'Dictionary service is currently unavailable');
                return;
            }

            // Mock dictionary response - implement actual API later
            const definition = `Definition for ${word} will appear here`;
            await safeSendText(sock, sender, definition);
        } catch (err) {
            logger.error('Dictionary lookup error:', err);
            await safeSendText(sock, sender, 'Error looking up word. Please try again later.');
        }
    },
    async covid(sock, sender, args) {
        const country = args.join(' ') || 'World';
        // TODO: Implement COVID-19 statistics API integration
        await safeSendText(sock, sender, `Getting COVID-19 stats for ${country}...`);
    },

    async currency(sock, sender, args) {
        const [amount, from, to] = args;
        if (!amount || !from || !to) {
            await safeSendText(sock, sender, 'Usage: !currency [amount] [from] [to]\nExample: !currency 100 USD EUR');
            return;
        }
        // TODO: Implement currency conversion
        await safeSendText(sock, sender, 'Converting currency...');
    },

    async shortlink(sock, sender, args) {
        const url = args[0];
        if (!url) {
            await safeSendText(sock, sender, 'Please provide a URL to shorten');
            return;
        }
        // TODO: Implement URL shortening
        await safeSendText(sock, sender, 'Shortening URL...');
    },

    async wiki(sock, sender, args) {
        const query = args.join(' ');
        if (!query) {
            await safeSendText(sock, sender, 'Please provide a search term');
            return;
        }
        // TODO: Implement Wikipedia API integration
        await safeSendText(sock, sender, `Searching Wikipedia for: ${query}`);
    },

    async poll(sock, sender, args) {
        const [question, ...options] = args.join(' ').split('|').map(item => item.trim());
        if (!question || options.length < 2) {
            await safeSendText(sock, sender, 'Usage: !poll Question | Option1 | Option2 | ...');
            return;
        }
        const pollText = `📊 Poll: ${question}\n\n${options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}`;
        await safeSendText(sock, sender, pollText);
    },

    async news(sock, sender, args) {
        const category = args[0] || 'general';
        // TODO: Implement news API integration
        await safeSendText(sock, sender, `Getting ${category} news...`);
    },

    async timezone(sock, sender, args) {
        const location = args.join(' ');
        if (!location) {
            await safeSendText(sock, sender, 'Please provide a city or country');
            return;
        }
        // TODO: Implement timezone API integration
        await safeSendText(sock, sender, `Getting time for ${location}...`);
    },

    async encode(sock, sender, args) {
        try {
            const [type, ...text] = args;
            if (!type || text.length === 0) {
                await safeSendText(sock, sender, '⚠️ Usage: .encode [type] [text]\nTypes: base64, hex, binary\nExample: .encode base64 Hello World');
                return;
            }

            const input = text.join(' ');
            if (input.length > 1000) {
                await safeSendText(sock, sender, '❌ Text too long. Maximum 1000 characters allowed.');
                return;
            }

            let result;
            switch (type.toLowerCase()) {
                case 'base64':
                    result = Buffer.from(input).toString('base64');
                    break;
                case 'hex':
                    result = Buffer.from(input).toString('hex');
                    break;
                case 'binary':
                    result = input.split('').map(char => 
                        char.charCodeAt(0).toString(2).padStart(8, '0')
                    ).join(' ');
                    break;
                default:
                    await safeSendText(sock, sender, '❌ Invalid encoding type. Available types: base64, hex, binary');
                    return;
            }

            await safeSendText(sock, sender, `🔄 Encoded (${type}):\n${result}`);
        } catch (err) {
            logger.error('Encode command error:', err);
            await safeSendText(sock, sender, '❌ Error encoding text. Please try again.');
        }
    },

    async decode(sock, sender, args) {
        try {
            const [type, ...text] = args;
            if (!type || text.length === 0) {
                await safeSendText(sock, sender, '⚠️ Usage: .decode [type] [text]\nTypes: base64, hex, binary\nExample: .decode base64 SGVsbG8gV29ybGQ=');
                return;
            }

            const input = text.join(' ');
            if (input.length > 1000) {
                await safeSendText(sock, sender, '❌ Text too long. Maximum 1000 characters allowed.');
                return;
            }

            let result;
            switch (type.toLowerCase()) {
                case 'base64':
                    if (!/^[A-Za-z0-9+/=]+$/.test(input)) {
                        throw new Error('Invalid base64 input');
                    }
                    result = Buffer.from(input, 'base64').toString();
                    break;
                case 'hex':
                    if (!/^[0-9A-Fa-f]+$/.test(input)) {
                        throw new Error('Invalid hex input');
                    }
                    result = Buffer.from(input, 'hex').toString();
                    break;
                case 'binary':
                    if (!/^[01\s]+$/.test(input)) {
                        throw new Error('Invalid binary input');
                    }
                    result = input.split(' ')
                        .map(bin => String.fromCharCode(parseInt(bin, 2)))
                        .join('');
                    break;
                default:
                    await safeSendText(sock, sender, '❌ Invalid decoding type. Available types: base64, hex, binary');
                    return;
            }

            await safeSendText(sock, sender, `🔄 Decoded: ${result}`);
        } catch (err) {
            logger.error('Decode command error:', err);
            await safeSendText(sock, sender, '❌ Invalid input for decoding. Please check your input format and try again.');
        }
    },

    async qrread(sock, sender) {
        // TODO: Implement QR code reading from image
        await safeSendText(sock, sender, 'QR code reading feature coming soon!');
    },

    async wolfram(sock, sender, args) {
        const query = args.join(' ');
        if (!query) {
            await safeSendText(sock, sender, 'Please provide a query');
            return;
        }
        // TODO: Implement Wolfram Alpha API integration
        await safeSendText(sock, sender, `Querying Wolfram Alpha: ${query}`);
    },

    async github(sock, sender, args) {
        const query = args.join(' ');
        if (!query) {
            await safeSendText(sock, sender, 'Please provide a search term');
            return;
        }
        // TODO: Implement GitHub API integration
        await safeSendText(sock, sender, `Searching GitHub for: ${query}`);
    },

    async npm(sock, sender, args) {
        const packageName = args[0];
        if (!packageName) {
            await safeSendText(sock, sender, 'Please provide a package name');
            return;
        }
        // TODO: Implement NPM API integration
        await safeSendText(sock, sender, `Searching NPM for: ${packageName}`);
    },

    async ipinfo(sock, sender, args) {
        const ip = args[0] || 'self';
        // TODO: Implement IP information API integration
        await safeSendText(sock, sender, `Getting information for IP: ${ip}`);
    },

    async whois(sock, sender, args) {
        const domain = args[0];
        if (!domain) {
            await safeSendText(sock, sender, 'Please provide a domain name');
            return;
        }
        // TODO: Implement WHOIS lookup
        await safeSendText(sock, sender, `Looking up WHOIS for: ${domain}`);
    },
    async ocr(sock, sender) {
        // TODO: Implement optical character recognition
        await safeSendText(sock, sender, 'OCR feature coming soon!');
    },

    async qrgen(sock, sender, args) {
        const text = args.join(' ');
        if (!text) {
            await safeSendText(sock, sender, 'Please provide text to generate QR code');
            return;
        }
        // TODO: Implement QR code generation
        await safeSendText(sock, sender, 'Generating QR code...');
    },

    async screenshot(sock, sender, args) {
        const url = args[0];
        if (!url) {
            await safeSendText(sock, sender, 'Please provide a URL to screenshot');
            return;
        }
        // TODO: Implement website screenshot
        await safeSendText(sock, sender, 'Taking screenshot...');
    },

    async color(sock, sender, args) {
        const colorCode = args[0];
        if (!colorCode) {
            await safeSendText(sock, sender, 'Please provide a color code (hex/rgb)');
            return;
        }
        // TODO: Implement color information
        await safeSendText(sock, sender, 'Getting color information...');
    },

    async lyrics(sock, sender, args) {
        const song = args.join(' ');
        if (!song) {
            await safeSendText(sock, sender, 'Please provide a song name');
            return;
        }
        // TODO: Implement lyrics search
        await safeSendText(sock, sender, 'Searching lyrics...');
    },

    async movie(sock, sender, args) {
        const title = args.join(' ');
        if (!title) {
            await safeSendText(sock, sender, 'Please provide a movie title');
            return;
        }
        // TODO: Implement movie information search
        await safeSendText(sock, sender, 'Searching movie info...');
    },

    async anime(sock, sender, args) {
        const title = args.join(' ');
        if (!title) {
            await safeSendText(sock, sender, 'Please provide an anime title');
            return;
        }
        // TODO: Implement anime information search
        await safeSendText(sock, sender, 'Searching anime info...');
    },

    async spotify(sock, sender, args) {
        const track = args.join(' ');
        if (!track) {
            await safeSendText(sock, sender, 'Please provide a track name');
            return;
        }
        // TODO: Implement Spotify track search
        await safeSendText(sock, sender, 'Searching Spotify...');
    },

    async urban(sock, sender, args) {
        const term = args.join(' ');
        if (!term) {
            await safeSendText(sock, sender, 'Please provide a term to look up');
            return;
        }
        // TODO: Implement Urban Dictionary lookup
        await safeSendText(sock, sender, 'Searching Urban Dictionary...');
    },

    async crypto(sock, sender, args) {
        const coin = args[0]?.toLowerCase() || 'bitcoin';
        // TODO: Implement cryptocurrency price lookup
        await safeSendText(sock, sender, `Getting price for ${coin}...`);
    },

    async stock(sock, sender, args) {
        const symbol = args[0]?.toUpperCase();
        if (!symbol) {
            await safeSendText(sock, sender, 'Please provide a stock symbol');
            return;
        }
        // TODO: Implement stock price lookup
        await safeSendText(sock, sender, `Getting price for ${symbol}...`);
    },

    async reminder(sock, sender, args) {
        const [time, ...message] = args;
        if (!time || message.length === 0) {
            await safeSendText(sock, sender, 'Usage: !reminder [time] [message]\nExample: !reminder 30m Call Mom');
            return;
        }
        // TODO: Implement reminder system
        await safeSendText(sock, sender, `Reminder set for: ${message.join(' ')}`);
    },

    async translate2(sock, sender, args) {
        // Duplicate command as backup
        await utilityCommands.translate(sock, sender, args);
    },

    async countdown(sock, sender, args) {
        if (args.length < 2) {
            await safeSendText(sock, sender, 'Usage: !countdown [minutes] [event]\nExample: !countdown 10 Meeting');
            return;
        }
        
        const minutes = parseInt(args[0]);
        if (isNaN(minutes) || minutes <= 0 || minutes > 1440) { // Max 24 hours
            await safeSendText(sock, sender, 'Please provide a valid number of minutes (1-1440)');
            return;
        }
        
        const event = args.slice(1).join(' ');
        await safeSendText(sock, sender, `⏰ Countdown set: ${minutes} minutes until ${event}`);
        
        // Store countdown (would normally use a database)
        if (!global.countdowns) global.countdowns = [];
        global.countdowns.push({
            minutes,
            event,
            userId: sender.split('@')[0],
            endTime: Date.now() + minutes * 60 * 1000
        });
    },

    async poll2(sock, sender, args) {
        // Enhanced poll with emoji reactions
        if (args.length < 3) {
            await safeSendText(sock, sender, 'Usage: !poll2 [question] [option1] [option2] ...\nExample: !poll2 Best color? Red Blue Green');
            return;
        }
        
        const question = args[0];
        const options = args.slice(1);
        
        if (options.length > 10) {
            await safeSendText(sock, sender, 'Maximum 10 options allowed');
            return;
        }
        
        const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        
        let pollMessage = `📊 *${question}*\n\n`;
        options.forEach((option, i) => {
            pollMessage += `${emojis[i]} ${option}\n`;
        });
        
        await safeSendText(sock, sender, pollMessage);
    },

    async todo(sock, sender, args) {
        if (args.length === 0) {
            await safeSendText(sock, sender, 'Usage:\n!todo add [task]\n!todo list\n!todo done [number]\n!todo clear');
            return;
        }
        
        const action = args[0].toLowerCase();
        const userId = sender.split('@')[0];
        
        // Initialize todo storage
        if (!global.todos) global.todos = {};
        if (!global.todos[userId]) global.todos[userId] = [];
        
        switch (action) {
            case 'add':
                if (args.length < 2) {
                    await safeSendText(sock, sender, 'Please specify a task to add');
                    return;
                }
                
                const task = args.slice(1).join(' ');
                global.todos[userId].push({
                    text: task,
                    created: Date.now()
                });
                
                await safeSendText(sock, sender, `✅ Task added: ${task}`);
                break;
                
            case 'list':
                if (global.todos[userId].length === 0) {
                    await safeSendText(sock, sender, '📝 Your todo list is empty');
                    return;
                }
                
                let listMessage = '📝 *Your Todo List:*\n\n';
                global.todos[userId].forEach((task, i) => {
                    listMessage += `${i + 1}. ${task.text}\n`;
                });
                
                await safeSendText(sock, sender, listMessage);
                break;
                
            case 'done':
                if (args.length < 2) {
                    await safeSendText(sock, sender, 'Please specify a task number to mark as done');
                    return;
                }
                
                const taskNum = parseInt(args[1]);
                if (isNaN(taskNum) || taskNum <= 0 || taskNum > global.todos[userId].length) {
                    await safeSendText(sock, sender, 'Invalid task number');
                    return;
                }
                
                const removedTask = global.todos[userId].splice(taskNum - 1, 1)[0];
                await safeSendText(sock, sender, `✅ Task completed: ${removedTask.text}`);
                break;
                
            case 'clear':
                global.todos[userId] = [];
                await safeSendText(sock, sender, '🗑️ Todo list cleared');
                break;
                
            default:
                await safeSendText(sock, sender, 'Unknown action. Use: add, list, done, or clear');
        }
    },

    async notes(sock, sender, args) {
        if (args.length === 0) {
            await safeSendText(sock, sender, 'Usage:\n!notes add [title] [content]\n!notes list\n!notes view [number]\n!notes delete [number]');
            return;
        }
        
        const action = args[0].toLowerCase();
        const userId = sender.split('@')[0];
        
        // Initialize notes storage
        if (!global.notes) global.notes = {};
        if (!global.notes[userId]) global.notes[userId] = [];
        
        switch (action) {
            case 'add':
                if (args.length < 3) {
                    await safeSendText(sock, sender, 'Please specify both a title and content');
                    return;
                }
                
                const title = args[1];
                const content = args.slice(2).join(' ');
                
                global.notes[userId].push({
                    title,
                    content,
                    created: Date.now()
                });
                
                await safeSendText(sock, sender, `📝 Note "${title}" saved`);
                break;
                
            case 'list':
                if (global.notes[userId].length === 0) {
                    await safeSendText(sock, sender, '📚 You have no saved notes');
                    return;
                }
                
                let listMessage = '📚 *Your Notes:*\n\n';
                global.notes[userId].forEach((note, i) => {
                    listMessage += `${i + 1}. ${note.title}\n`;
                });
                
                await safeSendText(sock, sender, listMessage);
                break;
                
            case 'view':
                if (args.length < 2) {
                    await safeSendText(sock, sender, 'Please specify a note number to view');
                    return;
                }
                
                const noteNum = parseInt(args[1]);
                if (isNaN(noteNum) || noteNum <= 0 || noteNum > global.notes[userId].length) {
                    await safeSendText(sock, sender, 'Invalid note number');
                    return;
                }
                
                const note = global.notes[userId][noteNum - 1];
                await safeSendText(sock, sender, `📝 *${note.title}*\n\n${note.content}`);
                break;
                
            case 'delete':
                if (args.length < 2) {
                    await safeSendText(sock, sender, 'Please specify a note number to delete');
                    return;
                }
                
                const delNoteNum = parseInt(args[1]);
                if (isNaN(delNoteNum) || delNoteNum <= 0 || delNoteNum > global.notes[userId].length) {
                    await safeSendText(sock, sender, 'Invalid note number');
                    return;
                }
                
                const deletedNote = global.notes[userId].splice(delNoteNum - 1, 1)[0];
                await safeSendText(sock, sender, `🗑️ Note "${deletedNote.title}" deleted`);
                break;
                
            default:
                await safeSendText(sock, sender, 'Unknown action. Use: add, list, view, or delete');
        }
    },

    async reverse(sock, sender, args) {
        const text = args.join(' ');
        if (!text) {
            await safeSendText(sock, sender, 'Please provide text to reverse');
            return;
        }
        
        const reversed = text.split('').reverse().join('');
        await safeSendText(sock, sender, `🔄 Reversed: ${reversed}`);
    },

    async init() {
        logger.info('Utility commands initialized');
        return true;
    }
};

module.exports = {
    commands: utilityCommands,
    init: utilityCommands.init
};