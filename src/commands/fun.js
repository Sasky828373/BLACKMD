const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs').promises;
const { isFeatureEnabled } = require('../utils/groupSettings');
const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');
const { formatNumber, randomInt, shuffleArray, sleep } = require('../utils/helpers');
const crypto = require('crypto');
const mathjs = require('mathjs');
const moment = require('moment');
const { safeSendText, safeSendMessage, safeSendImage } = require('../utils/jidHelper');

/**
 * Helper function to check if games are enabled for a group
 * @param {Object} sock WhatsApp socket
 * @param {string} remoteJid Group or sender JID
 * @returns {Promise<boolean>} Whether games are enabled
 */
async function areGamesEnabled(sock, remoteJid) {
    // If it's a group, check if games feature is enabled
    if (remoteJid.endsWith('g.us')) {
        const gamesEnabled = await isFeatureEnabled(remoteJid, 'games');
        if (!gamesEnabled) {
            await safeSendText(sock, remoteJid, '❌ Games are disabled in this group. Ask an admin to enable them with *.feature games on*');
            return false;
        }
    }
    return true;
}

// Game state initialization - improved with timeouts and better state tracking
function initializeGameState() {
    if (!global.games) {
        global.games = {
            tictactoe: new Map(),
            hangman: new Map(),
            wordle: new Map(),
            quiz: new Map(),
            trivia: new Map()
        };
    }

    // Clean up expired games every hour
    if (!global.gameCleanupInterval) {
        global.gameCleanupInterval = setInterval(() => {
            const now = Date.now();
            const TIMEOUT = 30 * 60 * 1000; // 30 minutes

            for (const [gameType, gameMap] of Object.entries(global.games)) {
                for (const [gameId, game] of gameMap.entries()) {
                    if (now - game.lastActivity > TIMEOUT) {
                        gameMap.delete(gameId);
                        logger.info(`Game ${gameType} in ${gameId} expired and cleaned up`);
                    }
                }
            }
        }, 60 * 60 * 1000); // Run cleanup hourly
    }
}

// TicTacToe board rendering
function renderBoard(board) {
    const cells = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
    let result = '';
    
    for (let i = 0; i < 9; i++) {
        // Replace with X, O or number
        if (board[i] === 'X') {
            result += '❌';
        } else if (board[i] === 'O') {
            result += '⭕';
        } else {
            result += cells[i];
        }
        
        // Add row separators
        if (i % 3 === 2) {
            result += '\n';
        } else {
            result += ' | ';
        }
    }
    
    return result;
}

// Check if someone won the TicTacToe game
function checkWinner(board) {
    const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
        [0, 4, 8], [2, 4, 6]             // Diagonals
    ];
    
    for (const pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (board[a] !== ' ' && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    
    return null;
}

// Get AI move for TicTacToe
function getBotMove(board) {
    // Check for winning moves
    const winningMove = findWinningMove(board, 'O');
    if (winningMove !== -1) return winningMove;
    
    // Block player from winning
    const blockingMove = findWinningMove(board, 'X');
    if (blockingMove !== -1) return blockingMove;
    
    // Take center if available
    if (board[4] === ' ') return 4;
    
    // Take a corner
    const corners = [0, 2, 6, 8];
    const availableCorners = corners.filter(i => board[i] === ' ');
    if (availableCorners.length > 0) {
        return availableCorners[Math.floor(Math.random() * availableCorners.length)];
    }
    
    // Take any available square
    const availableMoves = board.map((cell, index) => cell === ' ' ? index : -1).filter(i => i !== -1);
    if (availableMoves.length > 0) {
        return availableMoves[Math.floor(Math.random() * availableMoves.length)];
    }
    
    return -1; // No moves available
}

// Find winning move for TicTacToe
function findWinningMove(board, player) {
    const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
        [0, 4, 8], [2, 4, 6]             // Diagonals
    ];
    
    for (const pattern of winPatterns) {
        const [a, b, c] = pattern;
        // Check if two are filled and one is empty
        if (board[a] === player && board[b] === player && board[c] === ' ') return c;
        if (board[a] === player && board[c] === player && board[b] === ' ') return b;
        if (board[b] === player && board[c] === player && board[a] === ' ') return a;
    }
    
    return -1; // No winning move
}

// Hangman display
function getHangmanDisplay(game) {
    const hangmanStages = [
        `
  +---+
  |   |
      |
      |
      |
      |
=========`,
        `
  +---+
  |   |
  O   |
      |
      |
      |
=========`,
        `
  +---+
  |   |
  O   |
  |   |
      |
      |
=========`,
        `
  +---+
  |   |
  O   |
 /|   |
      |
      |
=========`,
        `
  +---+
  |   |
  O   |
 /|\\  |
      |
      |
=========`,
        `
  +---+
  |   |
  O   |
 /|\\  |
 /    |
      |
=========`,
        `
  +---+
  |   |
  O   |
 /|\\  |
 / \\  |
      |
=========`
    ];
    
    const guessedWord = game.word.split('').map(letter => 
        game.guessedLetters.includes(letter) ? letter : '_'
    ).join(' ');
    
    return `
${hangmanStages[game.wrongGuesses]}

Word: ${guessedWord}
Guessed: ${game.guessedLetters.join(', ') || 'None'}
Wrong guesses: ${game.wrongGuesses}/6
    `;
}

// Wordle display
function handleWordleGuess(word, guess) {
    const result = [];
    const wordArr = word.toLowerCase().split('');
    const guessArr = guess.toLowerCase().split('');
    
    // First pass: mark correct letters (green)
    for (let i = 0; i < guessArr.length; i++) {
        if (guessArr[i] === wordArr[i]) {
            result[i] = '🟩'; // Correct position
            wordArr[i] = null; // Mark as used
        }
    }
    
    // Second pass: mark present but incorrect position (yellow)
    for (let i = 0; i < guessArr.length; i++) {
        if (result[i]) continue; // Skip already marked positions
        
        const letterIndex = wordArr.indexOf(guessArr[i]);
        if (letterIndex !== -1) {
            result[i] = '🟨'; // Present but wrong position
            wordArr[letterIndex] = null; // Mark as used
        } else {
            result[i] = '⬛'; // Not present
        }
    }
    
    return result.join('');
}

// Initialize all game state tracking
initializeGameState();

const funCommands = {
    async quote(sock, sender) {
        try {
            const quotes = [
                { text: "Life is what happens when you're busy making other plans.", author: "John Lennon" },
                { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
                { text: "Your time is limited, so don't waste it living someone else's life.", author: "Steve Jobs" },
                { text: "If life were predictable it would cease to be life, and be without flavor.", author: "Eleanor Roosevelt" },
                { text: "If you look at what you have in life, you'll always have more.", author: "Oprah Winfrey" },
                { text: "Life is a succession of lessons which must be lived to be understood.", author: "Ralph Waldo Emerson" },
                { text: "The only impossible journey is the one you never begin.", author: "Tony Robbins" },
                { text: "The purpose of our lives is to be happy.", author: "Dalai Lama" },
                { text: "Live in the sunshine, swim the sea, drink the wild air.", author: "Ralph Waldo Emerson" },
                { text: "Go confidently in the direction of your dreams!", author: "Henry David Thoreau" },
                { text: "Life is really simple, but we insist on making it complicated.", author: "Confucius" },
                { text: "May you live all the days of your life.", author: "Jonathan Swift" },
                { text: "Life is trying things to see if they work.", author: "Ray Bradbury" },
                { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
                { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" }
            ];
            
            const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
            await safeSendText(sock, sender, `💬 "${randomQuote.text}"\n\n- ${randomQuote.author}`);
        } catch (err) {
            logger.error('Quote error:', err);
            await safeSendText(sock, sender, '❌ An error occurred while fetching a quote.');
        }
    },

    async joke(sock, sender) {
        try {
            const jokes = [
                "Why don't scientists trust atoms? Because they make up everything!",
                "I told my wife she was drawing her eyebrows too high. She looked surprised.",
                "What do you call fake spaghetti? An impasta!",
                "Why did the scarecrow win an award? Because he was outstanding in his field!",
                "Did you hear about the mathematician who's afraid of negative numbers? He'll stop at nothing to avoid them.",
                "Why don't eggs tell jokes? They'd crack each other up.",
                "I'm reading a book on anti-gravity. It's impossible to put down!",
                "What do you call a fish with no eye? Fsh.",
                "How do you organize a space party? You planet!",
                "Why was the math book sad? Because it had too many problems.",
                "What did the janitor say when he jumped out of the closet? Supplies!",
                "What's orange and sounds like a parrot? A carrot.",
                "Why did the bicycle fall over? Because it was two tired!",
                "What did one wall say to the other wall? I'll meet you at the corner.",
                "How do you make a tissue dance? Put a little boogie in it."
            ];
            
            const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
            await safeSendText(sock, sender, `😄 ${randomJoke}`);
        } catch (err) {
            logger.error('Joke error:', err);
            await safeSendText(sock, sender, '❌ An error occurred while fetching a joke.');
        }
    },
    
    async yomama(sock, sender) {
        try {
            const yoMamaJokes = [
                "Yo mama's so fat, when she fell I didn't laugh, but the sidewalk cracked up.",
                "Yo mama's so fat, when she skips a meal, the stock market drops.",
                "Yo mama's so fat, when she wears high heels, she strikes oil.",
                "Yo mama's so fat, when she sits around the house, she REALLY sits around the house.",
                "Yo mama's so fat, her belt size is 'equator'.",
                "Yo mama's so fat, she jumped in the air and got stuck.",
                "Yo mama's so fat, when she goes to a restaurant, she doesn't get a menu, she gets an estimate.",
                "Yo mama's so fat, when she goes on a scale, it says 'to be continued'.",
                "Yo mama's so fat, she doesn't need the internet, because she's already worldwide.",
                "Yo mama's so fat, when she takes a selfie, it needs to be a panorama.",
                "Yo mama's so fat, when she wears a yellow raincoat, people yell 'taxi!'",
                "Yo mama's so fat, I had to take a train and two buses just to get on her good side.",
                "Yo mama's so fat, when she goes to the beach, the whales start singing 'We Are Family'.",
                "Yo mama's so fat, when she steps on a scale, it displays her phone number.",
                "Yo mama's so fat, her car has stretch marks.",
                "Yo mama's so fat, Thanos had to snap twice.",
                "Yo mama's so fat, when she falls down the stairs, it sounds like Beethoven's 5th Symphony.",
                "Yo mama's so fat, even Dora couldn't explore her.",
                "Yo mama's so fat, her blood type is Ragu.",
                "Yo mama's so fat, when she walked past the TV, I missed 3 episodes."
            ];
            
            const randomYoMamaJoke = yoMamaJokes[Math.floor(Math.random() * yoMamaJokes.length)];
            await safeSendText(sock, sender, `🔥 ${randomYoMamaJoke}`);
        } catch (err) {
            logger.error('Yo Mama joke error:', err);
            await safeSendText(sock, sender, '❌ An error occurred while fetching a yo mama joke.');
        }
    },

    async meme(sock, sender) {
        try {
            // First try to fetch from a meme API with fallbacks
            await safeSendText(sock, sender, '🔍 Finding a funny meme for you...');
            
            // Multiple API endpoints for better reliability
            const memeApis = [
                'https://meme-api.com/gimme',
                'https://meme-api.com/gimme/wholesomememes',
                'https://meme-api.com/gimme/dankmemes'
            ];
            
            // Fallback to these pre-vetted meme URLs if API fails
            const fallbackMemeUrls = [
                'https://i.imgur.com/LLz6g0Y.jpg',  // Updated working URLs
                'https://i.imgur.com/XvAFW5s.jpg',
                'https://i.imgur.com/7bEYwDM.jpg',
                'https://i.imgur.com/aqPAIEP.jpg',
                'https://i.imgur.com/LF5I4ZF.jpg',
                'https://i.redd.it/tj1zdm55xqq81.jpg',
                'https://i.redd.it/2vawrxpwgyp81.jpg',
                'https://i.redd.it/5fxniwolm1q81.jpg'
            ];
            
            // Try APIs first with exponential backoff
            let memeUrl = null;
            let memeTitle = null;
            let success = false;
            
            // Exponential backoff config
            let retries = 2;
            let delay = 500;
            const maxDelay = 2000;
            
            // Shuffle APIs for load balancing
            const shuffledApis = [...memeApis].sort(() => Math.random() - 0.5);
            
            // Try each API with retries
            for (const api of shuffledApis) {
                if (success) break;
                
                for (let attempt = 0; attempt <= retries; attempt++) {
                    try {
                        logger.info(`Attempting to fetch meme from ${api}, attempt ${attempt+1}`);
                        
                        // Fetch meme with timeout
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 5000);
                        
                        const response = await fetch(api, { 
                            signal: controller.signal,
                            headers: { 'Accept': 'application/json' }
                        });
                        clearTimeout(timeoutId);
                        
                        if (!response.ok) {
                            throw new Error(`API returned status ${response.status}`);
                        }
                        
                        const data = await response.json();
                        
                        // Verify we have a valid image URL
                        if (data && data.url && (
                            data.url.endsWith('.jpg') || 
                            data.url.endsWith('.jpeg') || 
                            data.url.endsWith('.png') || 
                            data.url.endsWith('.gif')
                        )) {
                            memeUrl = data.url;
                            memeTitle = data.title || "Enjoy this meme!";
                            success = true;
                            break;
                        } else {
                            throw new Error('Invalid meme data received');
                        }
                    } catch (apiError) {
                        logger.warn(`API meme error (${api}): ${apiError.message}`);
                        
                        if (attempt === retries) {
                            logger.error(`All retries failed for ${api}`);
                            continue; // Try next API
                        }
                        
                        // Wait with exponential backoff before retry
                        const jitter = Math.random() * 200 - 100;
                        await new Promise(r => setTimeout(r, delay + jitter));
                        delay = Math.min(delay * 2, maxDelay);
                    }
                }
            }
            
            // If all APIs failed, use fallback URLs
            if (!success) {
                logger.warn('All meme APIs failed, using fallback meme URLs');
                const randomIndex = Math.floor(Math.random() * fallbackMemeUrls.length);
                memeUrl = fallbackMemeUrls[randomIndex];
                memeTitle = "😂 Enjoy this meme!";
            }
            
            // Download and validate the image before sending
            try {
                // Use axios instead of fetch for better buffer handling
                const axios = require('axios');
                
                logger.info(`Downloading meme from URL: ${memeUrl}`);
                
                const imageResponse = await axios.get(memeUrl, { 
                    responseType: 'arraybuffer',
                    timeout: 8000,  // Increased timeout for larger images
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
                    }
                });
                
                if (imageResponse.status !== 200) {
                    throw new Error(`Image fetch failed with status ${imageResponse.status}`);
                }
                
                const imageBuffer = Buffer.from(imageResponse.data);
                
                // Validate it's actually an image by checking size
                if (imageBuffer.length < 1000) {
                    throw new Error('Image too small, likely invalid');
                }
                
                // Process the image to ensure high quality
                const tempDir = path.join(process.cwd(), 'temp');
                await fs.mkdir(tempDir, { recursive: true });
                
                const tempFilePath = path.join(tempDir, `meme_${Date.now()}.jpg`);
                await fs.writeFile(tempFilePath, imageBuffer);
                
                logger.info(`Saved meme to temporary path: ${tempFilePath}`);
                
                // Send the meme with high quality mode
                await safeSendMessage(sock, sender, {
                    image: imageBuffer,
                    caption: memeTitle,
                    jpegThumbnail: imageBuffer.slice(0, Math.min(imageBuffer.length, 16000)), // Smaller thumbnail for preview
                });
                
                logger.info(`Successfully sent meme with high quality settings`);
            } catch (imageError) {
                logger.error(`Failed to process meme image: ${imageError.message}`);
                
                // Fallback to direct URL if buffer processing failed
                try {
                    logger.info(`Attempting fallback send method for meme`);
                    await safeSendMessage(sock, sender, {
                        image: { url: memeUrl },
                        caption: memeTitle
                    });
                } catch (fallbackError) {
                    logger.error(`Fallback meme send failed: ${fallbackError.message}`);
                    await safeSendText(sock, sender, '❌ Sorry, I had trouble processing that meme. Please try again.');
                }
            }
        } catch (err) {
            logger.error('Meme command error:', err);
            await safeSendText(sock, sender, '❌ Sorry, I couldn\'t find a meme right now. Please try again later.');
        }
    },

    async tictactoe(sock, message, args) {
        try {
            const sender = message.key.remoteJid;
            if (!(await areGamesEnabled(sock, sender))) return;
            
            if (!global.games.tictactoe) global.games.tictactoe = new Map();
            const gameId = sender;
            let game = global.games.tictactoe.get(gameId);
            
            // Create new game if no active game
            if (!game) {
                game = {
                    board: [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                    currentPlayer: 'X',
                    moves: 0,
                    lastActivity: Date.now()
                };
                global.games.tictactoe.set(gameId, game);
                
                await safeSendText(sock, sender, `🎮 New TicTacToe game started!\n\n${renderBoard(game.board)}\n\nYou are ❌. Send a number 1-9 to place your mark.`);
                return;
            }
            
            // Handle "exit" command
            if (args[0]?.toLowerCase() === 'exit') {
                global.games.tictactoe.delete(gameId);
                await safeSendText(sock, sender, '🎮 TicTacToe game exited.');
                return;
            }
            
            // Check if it's player's turn
            if (game.currentPlayer !== 'X') {
                await safeSendText(sock, sender, '⏳ Please wait for the bot to make its move...');
                return;
            }
            
            // Parse move (1-9)
            const move = parseInt(args[0]) - 1;
            if (isNaN(move) || move < 0 || move > 8) {
                await safeSendText(sock, sender, '❌ Please enter a number between 1-9.');
                return;
            }
            
            // Check if the move is valid
            if (game.board[move] !== ' ') {
                await safeSendText(sock, sender, '❌ That space is already taken. Try another one.');
                return;
            }
            
            // Apply player's move
            game.board[move] = 'X';
            game.moves++;
            game.lastActivity = Date.now();
            
            // Check if player won or game is a draw
            const winner = checkWinner(game.board);
            if (winner) {
                await safeSendText(sock, sender, `🎮 TicTacToe\n\n${renderBoard(game.board)}\n\n🎉 You win! Congratulations!`);
                global.games.tictactoe.delete(gameId);
                return;
            }
            
            if (game.moves === 9) {
                await safeSendText(sock, sender, `🎮 TicTacToe\n\n${renderBoard(game.board)}\n\n🤝 It's a draw!`);
                global.games.tictactoe.delete(gameId);
                return;
            }
            
            // Bot's turn
            game.currentPlayer = 'O';
            await safeSendText(sock, sender, `🎮 TicTacToe\n\n${renderBoard(game.board)}\n\nBot is thinking...`);
            
            // Small delay to simulate "thinking"
            setTimeout(async () => {
                try {
                    const botMove = getBotMove(game.board);
                    if (botMove === -1) {
                        await safeSendText(sock, sender, '❌ No valid moves left. It\'s a draw!');
                        global.games.tictactoe.delete(gameId);
                        return;
                    }
                    
                    game.board[botMove] = 'O';
                    game.moves++;
                    
                    // Check if bot won or game is a draw
                    const winner = checkWinner(game.board);
                    if (winner) {
                        await safeSendText(sock, sender, `🎮 TicTacToe\n\n${renderBoard(game.board)}\n\n😔 Bot wins this time!`);
                        global.games.tictactoe.delete(gameId);
                        return;
                    }
                    
                    if (game.moves === 9) {
                        await safeSendText(sock, sender, `🎮 TicTacToe\n\n${renderBoard(game.board)}\n\n🤝 It's a draw!`);
                        global.games.tictactoe.delete(gameId);
                        return;
                    }
                    
                    // Player's turn again
                    game.currentPlayer = 'X';
                    await safeSendText(sock, sender, `🎮 TicTacToe\n\n${renderBoard(game.board)}\n\nYour turn! Send a number 1-9.`);
                } catch (err) {
                    logger.error('TicTacToe bot move error:', err);
                    await safeSendText(sock, sender, '❌ An error occurred during the bot\'s move.');
                }
            }, 1500);
            
        } catch (err) {
            logger.error('TicTacToe error:', err);
            await safeSendText(sock, sender, '❌ An error occurred with the TicTacToe game.');
        }
    },

    async hangman(sock, message, args) {
        try {
            const sender = message.key.remoteJid;
            if (!(await areGamesEnabled(sock, sender))) return;
            
            if (!global.games.hangman) global.games.hangman = new Map();
            const gameId = sender;
            let game = global.games.hangman.get(gameId);
            
            // Word list for hangman
            const words = [
                "APPLE", "BANANA", "ORANGE", "PINEAPPLE", "STRAWBERRY",
                "ELEPHANT", "GIRAFFE", "LION", "TIGER", "ZEBRA",
                "COMPUTER", "KEYBOARD", "MOUSE", "MONITOR", "PRINTER",
                "PIZZA", "HAMBURGER", "SANDWICH", "SPAGHETTI", "TACO",
                "SOCCER", "BASKETBALL", "TENNIS", "VOLLEYBALL", "BASEBALL"
            ];
            
            // Create new game if no active game or command is "new"
            if (!game || args[0]?.toLowerCase() === 'new') {
                const randomWord = words[Math.floor(Math.random() * words.length)];
                game = {
                    word: randomWord,
                    guessedLetters: [],
                    wrongGuesses: 0,
                    lastActivity: Date.now()
                };
                global.games.hangman.set(gameId, game);
                
                await safeSendText(sock, sender, `🎮 New Hangman game started!\n${getHangmanDisplay(game)}\n\nGuess a letter!`);
                return;
            }
            
            // Handle "exit" command
            if (args[0]?.toLowerCase() === 'exit') {
                global.games.hangman.delete(gameId);
                await safeSendText(sock, sender, `🎮 Hangman game exited. The word was: ${game.word}`);
                return;
            }
            
            // Parse guess
            const guess = args[0]?.toUpperCase();
            if (!guess || guess.length !== 1 || !guess.match(/[A-Z]/i)) {
                await safeSendText(sock, sender, '❌ Please enter a single letter (A-Z).');
                return;
            }
            
            // Check if letter was already guessed
            if (game.guessedLetters.includes(guess)) {
                await safeSendText(sock, sender, `You already guessed '${guess}'! Try another letter.\n${getHangmanDisplay(game)}`);
                return;
            }
            
            // Record the guess
            game.guessedLetters.push(guess);
            game.lastActivity = Date.now();
            
            // Check if guess is correct
            if (game.word.includes(guess)) {
                // Check if won
                const isWon = game.word.split('').every(letter => game.guessedLetters.includes(letter));
                if (isWon) {
                    await safeSendText(sock, sender, `🎮 Hangman\n${getHangmanDisplay(game)}\n\n🎉 You won! The word was: ${game.word}`);
                    global.games.hangman.delete(gameId);
                    return;
                }
                
                await safeSendText(sock, sender, `🎮 Hangman\n${getHangmanDisplay(game)}\n\n✅ Good guess! '${guess}' is in the word.`);
            } else {
                game.wrongGuesses++;
                
                // Check if lost
                if (game.wrongGuesses >= 6) {
                    await safeSendText(sock, sender, `🎮 Hangman\n${getHangmanDisplay(game)}\n\n😔 Game over! The word was: ${game.word}`);
                    global.games.hangman.delete(gameId);
                    return;
                }
                
                await safeSendText(sock, sender, `🎮 Hangman\n${getHangmanDisplay(game)}\n\n❌ Sorry, '${guess}' is not in the word.`);
            }
            
        } catch (err) {
            logger.error('Hangman error:', err);
            await safeSendText(sock, sender, '❌ An error occurred with the Hangman game.');
        }
    },

    async wordle(sock, message, args) {
        try {
            const sender = message.key.remoteJid;
            if (!(await areGamesEnabled(sock, sender))) return;
            
            if (!global.games.wordle) global.games.wordle = new Map();
            const gameId = sender;
            let game = global.games.wordle.get(gameId);
            
            // Word list for wordle (5-letter words)
            const words = [
                "APPLE", "BRICK", "CHILD", "DREAM", "EVERY",
                "FAITH", "GRACE", "HEAVY", "IVORY", "JUMBO",
                "KNIFE", "LUCKY", "MOVIE", "NIGHT", "OCEAN",
                "PIANO", "QUEST", "RADIO", "SPARK", "TIGER",
                "ULTRA", "VINYL", "WATER", "XENON", "YOUTH", "ZEBRA"
            ];
            
            // Create new game if no active game or command is "new"
            if (!game || args[0]?.toLowerCase() === 'new') {
                const randomWord = words[Math.floor(Math.random() * words.length)];
                game = {
                    word: randomWord,
                    guesses: [],
                    maxGuesses: 6,
                    lastActivity: Date.now()
                };
                global.games.wordle.set(gameId, game);
                
                await safeSendText(sock, sender, `🎮 New Wordle game started!\n\nGuess the 5-letter word. You have ${game.maxGuesses} attempts.\n\n🟩 = Correct letter, correct position\n🟨 = Correct letter, wrong position\n⬛ = Letter not in word`);
                return;
            }
            
            // Handle "exit" command
            if (args[0]?.toLowerCase() === 'exit') {
                global.games.wordle.delete(gameId);
                await safeSendText(sock, sender, `🎮 Wordle game exited. The word was: ${game.word}`);
                return;
            }
            
            // Parse guess
            const guess = args[0]?.toUpperCase();
            if (!guess || guess.length !== 5 || !guess.match(/^[A-Z]{5}$/i)) {
                await safeSendText(sock, sender, '❌ Please enter a valid 5-letter word.');
                return;
            }
            
            // Record the guess
            const result = handleWordleGuess(game.word, guess);
            game.guesses.push({ word: guess, result });
            game.lastActivity = Date.now();
            
            // Generate results display
            let display = '🎮 Wordle\n\n';
            for (const g of game.guesses) {
                display += `${g.word}: ${g.result}\n`;
            }
            display += `\nAttempts: ${game.guesses.length}/${game.maxGuesses}`;
            
            // Check if won
            if (guess === game.word) {
                await safeSendText(sock, sender, `${display}\n\n🎉 You won! The word was: ${game.word}`);
                global.games.wordle.delete(gameId);
                return;
            }
            
            // Check if lost
            if (game.guesses.length >= game.maxGuesses) {
                await safeSendText(sock, sender, `${display}\n\n😔 Game over! The word was: ${game.word}`);
                global.games.wordle.delete(gameId);
                return;
            }
            
            // Continue game
            await safeSendText(sock, sender, `${display}\n\nKeep guessing!`);
            
        } catch (err) {
            logger.error('Wordle error:', err);
            await safeSendText(sock, sender, '❌ An error occurred with the Wordle game.');
        }
    },

    async quiz(sock, message, args) {
        try {
            const sender = message.key.remoteJid;
            if (!(await areGamesEnabled(sock, sender))) return;
            
            if (!global.games.quiz) global.games.quiz = new Map();
            const gameId = sender;
            let game = global.games.quiz.get(gameId);
            
            // List of quiz questions
            const questions = [
                {
                    question: "What is the capital of France?",
                    options: ["London", "Paris", "Berlin", "Madrid"],
                    answer: 1 // Paris (index 1)
                },
                {
                    question: "Which planet is known as the Red Planet?",
                    options: ["Earth", "Mars", "Jupiter", "Venus"],
                    answer: 1 // Mars (index 1)
                },
                {
                    question: "Who painted the Mona Lisa?",
                    options: ["Vincent van Gogh", "Pablo Picasso", "Leonardo da Vinci", "Michelangelo"],
                    answer: 2 // Leonardo da Vinci (index 2)
                },
                {
                    question: "What is the largest ocean on Earth?",
                    options: ["Atlantic Ocean", "Indian Ocean", "Arctic Ocean", "Pacific Ocean"],
                    answer: 3 // Pacific Ocean (index 3)
                },
                {
                    question: "Which element has the chemical symbol 'O'?",
                    options: ["Gold", "Oxygen", "Osmium", "Oganesson"],
                    answer: 1 // Oxygen (index 1)
                }
            ];
            
            // Create new game if no active game or command is "new"
            if (!game || args[0]?.toLowerCase() === 'new') {
                const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
                game = {
                    question: randomQuestion.question,
                    options: randomQuestion.options,
                    answer: randomQuestion.answer,
                    lastActivity: Date.now()
                };
                global.games.quiz.set(gameId, game);
                
                let questionText = `🎮 Quiz Time!\n\n${game.question}\n\n`;
                for (let i = 0; i < game.options.length; i++) {
                    questionText += `${i + 1}. ${game.options[i]}\n`;
                }
                questionText += "\nReply with the number of your answer.";
                
                await safeSendText(sock, sender, questionText);
                return;
            }
            
            // Handle "exit" command
            if (args[0]?.toLowerCase() === 'exit') {
                global.games.quiz.delete(gameId);
                await safeSendText(sock, sender, `🎮 Quiz exited. The answer was: ${game.options[game.answer]}`);
                return;
            }
            
            // Parse answer
            const answer = parseInt(args[0]) - 1;
            if (isNaN(answer) || answer < 0 || answer >= game.options.length) {
                await safeSendText(sock, sender, `❌ Please enter a number between 1 and ${game.options.length}.`);
                return;
            }
            
            // Check answer
            if (answer === game.answer) {
                await safeSendText(sock, sender, `🎮 Quiz\n\n✅ Correct! "${game.options[game.answer]}" is the right answer!`);
            } else {
                await safeSendText(sock, sender, `🎮 Quiz\n\n❌ Wrong! The correct answer was: "${game.options[game.answer]}"`);
            }
            
            // End game
            global.games.quiz.delete(gameId);
            
        } catch (err) {
            logger.error('Quiz error:', err);
            await safeSendText(sock, sender, '❌ An error occurred with the Quiz game.');
        }
    },

    async rps(sock, message, args) {
        try {
            const sender = message.key.remoteJid;
            if (!(await areGamesEnabled(sock, sender))) return;
            
            const validMoves = ['rock', 'paper', 'scissors'];
            const playerMove = args[0]?.toLowerCase();
            
            if (!playerMove || !validMoves.includes(playerMove)) {
                await safeSendText(sock, sender, '🎮 Rock Paper Scissors\n\nUsage: !rps [rock|paper|scissors]');
                return;
            }
            
            const botMove = validMoves[Math.floor(Math.random() * validMoves.length)];
            
            // Determine winner
            let result;
            if (playerMove === botMove) {
                result = "It's a tie!";
            } else if (
                (playerMove === 'rock' && botMove === 'scissors') ||
                (playerMove === 'paper' && botMove === 'rock') ||
                (playerMove === 'scissors' && botMove === 'paper')
            ) {
                result = "You win!";
            } else {
                result = "Bot wins!";
            }
            
            // Emoji mapping
            const moveEmoji = {
                'rock': '🪨',
                'paper': '📄',
                'scissors': '✂️'
            };
            
            await safeSendText(sock, sender, `🎮 Rock Paper Scissors\n\nYou: ${moveEmoji[playerMove]} ${playerMove}\nBot: ${moveEmoji[botMove]} ${botMove}\n\n${result}`);
            
        } catch (err) {
            logger.error('RPS error:', err);
            await safeSendText(sock, sender, '❌ An error occurred with the Rock Paper Scissors game.');
        }
    },

    async roll(sock, message, args) {
        try {
            const sender = message.key.remoteJid;
            
            // Default to d6 if no arguments
            let sides = 6;
            
            if (args.length > 0) {
                // Support for dX format (e.g., d20)
                if (args[0].startsWith('d')) {
                    sides = parseInt(args[0].substring(1));
                } else {
                    sides = parseInt(args[0]);
                }
            }
            
            // Validate sides
            if (isNaN(sides) || sides < 1 || sides > 1000) {
                await safeSendText(sock, sender, "Please specify a valid number of sides between 1 and 1000.");
                return;
            }
            
            // Roll the dice
            const result = Math.floor(Math.random() * sides) + 1;
            
            await safeSendMessage(sock, sender, { text: `🎲 You rolled: ${result} (d${sides})` });
            
        } catch (err) {
            logger.error('Roll error:', err);
            await safeSendText(sock, sender, '❌ An error occurred with the dice roll.');
        }
    },

    async flip(sock, sender) {
        try {
            const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
            
            await safeSendMessage(sock, sender, { text: `🪙 Coin flip: ${result}` });
            
        } catch (err) {
            logger.error('Flip error:', err);
            await safeSendText(sock, sender, '❌ An error occurred with the coin flip.');
        }
    },

    async choose(sock, sender, args) {
        try {
            if (!args || args.length < 2) {
                await safeSendText(sock, sender, "Please provide at least two options to choose from, separated by spaces.");
                return;
            }
            
            const randomChoice = args[Math.floor(Math.random() * args.length)];
            
            await safeSendMessage(sock, sender, { text: `🎯 I choose: ${randomChoice}` });
            
        } catch (err) {
            logger.error('Choose error:', err);
            await safeSendText(sock, sender, '❌ An error occurred while making a choice.');
        }
    },

    async truthordare(sock, sender, args) {
        try {
            const choice = args[0]?.toLowerCase();
            
            if (!choice || !['truth', 'dare'].includes(choice)) {
                await safeSendText(sock, sender, '🎮 Truth or Dare\n\nUsage: !truthordare [truth|dare]');
                return;
            }
            
            const truths = [
                "What is your biggest fear?",
                "What is the most embarrassing thing you've ever done?",
                "What is a secret you've never told anyone?",
                "Who do you have a crush on?",
                "What is your biggest regret?",
                "What is the most childish thing you still do?",
                "What is the worst thing you've ever said to someone?",
                "What is your worst habit?",
                "If you could be invisible for a day, what would you do?",
                "What is the most embarrassing music you listen to?"
            ];
            
            const dares = [
                "Send the last photo you took.",
                "Text someone you haven't talked to in at least 6 months.",
                "Call the 5th person in your contact list and sing them Happy Birthday.",
                "Do 10 push-ups.",
                "Speak in an accent for the next 10 minutes.",
                "Post a funny selfie as your profile picture for 1 hour.",
                "Send a message to your crush.",
                "Do your best animal impression.",
                "Show the last three searches in your browser history.",
                "Write a poem about the person to your left."
            ];
            
            if (choice === 'truth') {
                const randomTruth = truths[Math.floor(Math.random() * truths.length)];
                await safeSendText(sock, sender, `🎮 Truth or Dare: TRUTH\n\n${randomTruth}`);
            } else {
                const randomDare = dares[Math.floor(Math.random() * dares.length)];
                await safeSendText(sock, sender, `🎮 Truth or Dare: DARE\n\n${randomDare}`);
            }
            
        } catch (err) {
            logger.error('Truth or Dare error:', err);
            await safeSendText(sock, sender, '❌ An error occurred with the Truth or Dare game.');
        }
    },

    async wouldyourather(sock, sender) {
        try {
            const questions = [
                "Would you rather be able to fly or be invisible?",
                "Would you rather be a famous actor or a famous musician?",
                "Would you rather have the power to read minds or see the future?",
                "Would you rather live in a world with no technology or a world with no animals?",
                "Would you rather always be 10 minutes late or always be 20 minutes early?",
                "Would you rather have unlimited money or unlimited time?",
                "Would you rather be incredibly attractive or incredibly intelligent?",
                "Would you rather know the date of your death or the cause of your death?",
                "Would you rather never be able to use a smartphone again or never be able to use a computer again?",
                "Would you rather always have to say everything on your mind or never be able to speak again?",
                "Would you rather live in outer space or under the sea?",
                "Would you rather lose all your memories or never be able to make new ones?",
                "Would you rather be unable to use apps or unable to use social media?",
                "Would you rather be an amazing artist or an amazing musician?",
                "Would you rather be completely bald or have hair over your entire body?"
            ];
            
            const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
            await safeSendText(sock, sender, `🎮 Would You Rather...\n\n${randomQuestion}`);
            
        } catch (err) {
            logger.error('Would You Rather error:', err);
            await safeSendText(sock, sender, '❌ An error occurred with the Would You Rather game.');
        }
    },

    async neverhaveiever(sock, sender) {
        try {
            const statements = [
                "Never have I ever broken a bone.",
                "Never have I ever been arrested.",
                "Never have I ever cheated on a test.",
                "Never have I ever been caught lying.",
                "Never have I ever gone skinny dipping.",
                "Never have I ever sent a text to the wrong person.",
                "Never have I ever fallen asleep at work or in class.",
                "Never have I ever regretted a post I made on social media.",
                "Never have I ever lied to get out of plans.",
                "Never have I ever stayed up for more than 48 hours straight.",
                "Never have I ever cried during a movie.",
                "Never have I ever screamed during a horror movie.",
                "Never have I ever had food poisoning.",
                "Never have I ever gone a whole day without using my phone.",
                "Never have I ever regretted a haircut."
            ];
            
            const randomStatement = statements[Math.floor(Math.random() * statements.length)];
            await safeSendText(sock, sender, `🎮 Never Have I Ever...\n\n${randomStatement}\n\nReply with "I have" or "I have never"`);
            
        } catch (err) {
            logger.error('Never Have I Ever error:', err);
            await safeSendText(sock, sender, '❌ An error occurred with the Never Have I Ever game.');
        }
    },

    async riddle(sock, sender) {
        try {
            const riddles = [
                {
                    question: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?",
                    answer: "An echo"
                },
                {
                    question: "What has keys but no locks, space but no room, and you can enter but can't go in?",
                    answer: "A keyboard"
                },
                {
                    question: "The more you take, the more you leave behind. What am I?",
                    answer: "Footsteps"
                },
                {
                    question: "What has a head, a tail, is brown, and has no legs?",
                    answer: "A penny"
                },
                {
                    question: "I'm light as a feather, but the strongest person can't hold me for more than a few minutes. What am I?",
                    answer: "Breath"
                },
                {
                    question: "What comes once in a minute, twice in a moment, but never in a thousand years?",
                    answer: "The letter 'M'"
                },
                {
                    question: "What has 13 hearts but no other organs?",
                    answer: "A deck of cards"
                },
                {
                    question: "What gets wetter as it dries?",
                    answer: "A towel"
                },
                {
                    question: "What has a neck but no head?",
                    answer: "A bottle"
                },
                {
                    question: "What can travel around the world while staying in a corner?",
                    answer: "A stamp"
                }
            ];
            
            // Select a random riddle
            const randomRiddle = riddles[Math.floor(Math.random() * riddles.length)];
            
            // Save the riddle for later "reveal" command
            if (!global.currentRiddles) global.currentRiddles = new Map();
            global.currentRiddles.set(sender, randomRiddle);
            
            await safeSendText(sock, sender, `🧩 Riddle\n\n${randomRiddle.question}\n\nUse .reveal to see the answer`);
            
        } catch (err) {
            logger.error('Riddle error:', err);
            await safeSendText(sock, sender, '❌ An error occurred with the Riddle game.');
        }
    },

    async reveal(sock, message) {
        try {
            const sender = message.key.remoteJid;
            
            if (!global.currentRiddles || !global.currentRiddles.has(sender)) {
                await safeSendText(sock, sender, "❌ There's no active riddle to reveal. Use .riddle to get a new riddle.");
                return;
            }
            
            const riddle = global.currentRiddles.get(sender);
            await safeSendText(sock, sender, `🧩 Riddle Answer\n\nQuestion: ${riddle.question}\n\nAnswer: ${riddle.answer}`);
            
            // Remove the riddle after revealing
            global.currentRiddles.delete(sender);
            
        } catch (err) {
            logger.error('Reveal error:', err);
            await safeSendText(sock, sender, '❌ An error occurred while revealing the riddle answer.');
        }
    },

    async fact(sock, sender) {
        try {
            const facts = [
                "The total weight of all the ants on Earth is greater than the total weight of all the humans on Earth.",
                "A day on Venus is longer than a year on Venus.",
                "The Eiffel Tower can be 15 cm taller during the summer due to thermal expansion.",
                "Octopuses have three hearts and blue blood.",
                "A group of flamingos is called a 'flamboyance'.",
                "The shortest war in history was between Britain and Zanzibar in 1896. Zanzibar surrendered after 38 minutes.",
                "Honey never spoils. Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old and still perfectly good to eat.",
                "The strongest muscle in the human body is the masseter (jaw muscle).",
                "Cats can't taste sweetness.",
                "The Great Pyramid of Giza was the tallest man-made structure for over 3,800 years.",
                "A bolt of lightning is six times hotter than the surface of the sun.",
                "There are more possible iterations of a game of chess than there are atoms in the observable universe.",
                "The word 'nerd' was first coined by Dr. Seuss in 'If I Ran the Zoo' in 1950.",
                "The world's oldest piece of chewing gum is 9,000 years old.",
                "Bananas are berries, but strawberries are not."
            ];
            
            const randomFact = facts[Math.floor(Math.random() * facts.length)];
            await safeSendText(sock, sender, `📚 Random Fact\n\n${randomFact}`);
            
        } catch (err) {
            logger.error('Fact error:', err);
            await safeSendText(sock, sender, '❌ An error occurred while fetching a random fact.');
        }
    },

    async trivia(sock, message, args) {
        try {
            const sender = message.key.remoteJid;
            if (!(await areGamesEnabled(sock, sender))) return;
            
            if (!global.games.trivia) global.games.trivia = new Map();
            const gameId = sender;
            let game = global.games.trivia.get(gameId);
            
            // List of trivia questions
            const questions = [
                {
                    question: "What is the largest planet in our solar system?",
                    options: ["Earth", "Mars", "Jupiter", "Saturn"],
                    answer: 2 // Jupiter (index 2)
                },
                {
                    question: "What is the smallest country in the world?",
                    options: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"],
                    answer: 1 // Vatican City (index 1)
                },
                {
                    question: "What is the hardest natural substance on Earth?",
                    options: ["Gold", "Iron", "Diamond", "Titanium"],
                    answer: 2 // Diamond (index 2)
                },
                {
                    question: "What is the largest organ in the human body?",
                    options: ["Heart", "Liver", "Brain", "Skin"],
                    answer: 3 // Skin (index 3)
                },
                {
                    question: "Which of these is NOT a programming language?",
                    options: ["Java", "Python", "Firefox", "Ruby"],
                    answer: 2 // Firefox (index 2)
                }
            ];
            
            // Create new game if no active game or command is "new"
            if (!game || args[0]?.toLowerCase() === 'new') {
                const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
                game = {
                    question: randomQuestion.question,
                    options: randomQuestion.options,
                    answer: randomQuestion.answer,
                    lastActivity: Date.now()
                };
                global.games.trivia.set(gameId, game);
                
                let questionText = `🎮 Trivia Time!\n\n${game.question}\n\n`;
                for (let i = 0; i < game.options.length; i++) {
                    questionText += `${i + 1}. ${game.options[i]}\n`;
                }
                questionText += "\nReply with the number of your answer.";
                
                await safeSendText(sock, sender, questionText);
                return;
            }
            
            // Handle "exit" command
            if (args[0]?.toLowerCase() === 'exit') {
                global.games.trivia.delete(gameId);
                await safeSendText(sock, sender, `🎮 Trivia exited. The answer was: ${game.options[game.answer]}`);
                return;
            }
            
            // Parse answer
            const answer = parseInt(args[0]) - 1;
            if (isNaN(answer) || answer < 0 || answer >= game.options.length) {
                await safeSendText(sock, sender, `❌ Please enter a number between 1 and ${game.options.length}.`);
                return;
            }
            
            // Check answer
            if (answer === game.answer) {
                await safeSendText(sock, sender, `🎮 Trivia\n\n✅ Correct! "${game.options[game.answer]}" is the right answer!`);
            } else {
                await safeSendText(sock, sender, `🎮 Trivia\n\n❌ Wrong! The correct answer was: "${game.options[game.answer]}"`);
            }
            
            // End game
            global.games.trivia.delete(gameId);
            
        } catch (err) {
            logger.error('Trivia error:', err);
            await safeSendText(sock, sender, '❌ An error occurred with the Trivia game.');
        }
    },

    async _8ball(sock, sender, args) {
        try {
            if (!args || args.length === 0) {
                await safeSendText(sock, sender, "🎱 8-Ball\n\nAsk me a yes/no question!");
                return;
            }
            
            const responses = [
                'It is certain.', 'It is decidedly so.', 'Without a doubt.',
                'Yes, definitely.', 'You may rely on it.', 'As I see it, yes.',
                'Most likely.', 'Outlook good.', 'Signs point to yes.',
                'Reply hazy, try again.', 'Ask again later.', 'Better not tell you now.',
                'Cannot predict now.', 'Concentrate and ask again.',
                'Don\'t count on it.', 'My reply is no.', 'My sources say no.',
                'Outlook not so good.', 'Very doubtful.'
            ];
            
            const randomResponse = responses[Math.floor(Math.random() * responses.length)];
            await safeSendText(sock, sender, `🎱 ${randomResponse}`);
        } catch (err) {
            logger.error('8ball error:', err);
            await safeSendText(sock, sender, '❌ An error occurred.');
        }
    },

    async slot(sock, sender) {
        try {
            if (!(await areGamesEnabled(sock, sender))) return;

            const symbols = ['🍒', '🍊', '🍋', '🍇', '🍉', '💎', '7️⃣'];
            const results = Array(3).fill().map(() => symbols[Math.floor(Math.random() * symbols.length)]);
            
            await safeSendText(sock, sender, '🎰 *Slot Machine*\nSpinning...');
            
            setTimeout(async () => {
                try {
                    const display = `🎰 *Slot Machine*\n\n┌───┬───┬───┐\n│ ${results[0]} │ ${results[1]} │ ${results[2]} │\n└───┴───┴───┘\n`;
                    
                    if (results[0] === results[1] && results[1] === results[2]) {
                        if (results[0] === '💎') {
                            await safeSendText(sock, sender, `${display}\n🎉 JACKPOT! All diamonds! You win big!`);
                        } else if (results[0] === '7️⃣') {
                            await safeSendText(sock, sender, `${display}\n🔥 TRIPLE SEVEN! Amazing luck!`);
                        } else {
                            await safeSendText(sock, sender, `${display}\n🎉 You win! Triple match!`);
                        }
                    } else if (results[0] === results[1] || results[1] === results[2] || results[0] === results[2]) {
                        await safeSendText(sock, sender, `${display}\n🎁 You got a pair! Small win!`);
                    } else {
                        await safeSendText(sock, sender, `${display}\n😔 No match. Try again!`);
                    }
                } catch (err) {
                    logger.error('Slot display error:', err);
                }
            }, 1500);
        } catch (err) {
            logger.error('Slot error:', err);
            await safeSendText(sock, sender, '❌ The slot machine is out of order. Try again later.');
        }
    },

    async fortune(sock, sender) {
        try {
            const fortunes = [
                "A beautiful, smart, and loving person will be coming into your life.",
                "A dubious friend may be an enemy in camouflage.",
                "A faithful friend is a strong defense.",
                "A fresh start will put you on your way.",
                "A friend asks only for your time not your money.",
                "A golden egg of opportunity falls into your lap this month.",
                "A lifetime of happiness awaits you.",
                "A light heart carries you through all the hard times.",
                "A new perspective will come with the new year.",
                "A person of words and not deeds is like a garden full of weeds.",
                "A pleasant surprise is waiting for you.",
                "A soft voice may be awfully persuasive.",
                "A truly rich life contains love and art in abundance.",
                "Accept something that you cannot change, and you will feel better.",
                "Adventure can be real happiness.",
                "Believe it can be done.",
                "Carve your name on your heart and not on marble.",
                "Change is happening in your life, so go with the flow!",
                "Do not be intimidated by the eloquence of others.",
                "Don't just spend time. Invest it."
            ];
            
            const randomFortune = fortunes[Math.floor(Math.random() * fortunes.length)];
            await safeSendText(sock, sender, `🥠 *Your Fortune Cookie Says:*\n\n"${randomFortune}"`);
        } catch (err) {
            logger.error('Fortune error:', err);
            await safeSendText(sock, sender, '❌ The fortune teller is not available right now. Try again later.');
        }
    },

    async horoscope(sock, sender, args) {
        try {
            if (!args.length) {
                await safeSendText(sock, sender, '⭐ Please specify your zodiac sign. Example: .horoscope aries');
                return;
            }

            const sign = args[0].toLowerCase();
            const validSigns = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];
            
            if (!validSigns.includes(sign)) {
                await safeSendText(sock, sender, '⭐ Please enter a valid zodiac sign: aries, taurus, gemini, cancer, leo, virgo, libra, scorpio, sagittarius, capricorn, aquarius, or pisces');
                return;
            }

            // Predefined horoscopes for each sign
            const horoscopes = {
                aries: [
                    "Today is a day for action. Your energy is high and your confidence is strong.",
                    "You may face some unexpected challenges, but your natural courage will see you through.",
                    "A good day to start new projects. Your initiative will be rewarded."
                ],
                taurus: [
                    "Focus on stability and security today. Your practical nature serves you well.",
                    "A good day for financial decisions. Your natural caution will prevent mistakes.",
                    "Take time to enjoy simple pleasures. Your appreciation for beauty is heightened."
                ],
                gemini: [
                    "Communication is your strength today. Express your ideas clearly.",
                    "Your curiosity leads you to new discoveries. Keep asking questions.",
                    "Social connections bring opportunities. Network and share your thoughts."
                ],
                cancer: [
                    "Trust your intuition today. Your emotional intelligence guides you correctly.",
                    "Family matters require your attention. Your nurturing nature is needed.",
                    "Take time for self-care. Your sensitivity requires protection."
                ],
                leo: [
                    "Your natural leadership shines today. Take charge of situations confidently.",
                    "Creative pursuits are favored. Express yourself boldly.",
                    "Recognition for your efforts is coming. Your generosity will be returned."
                ],
                virgo: [
                    "Your attention to detail solves a complex problem today.",
                    "Health matters benefit from your careful approach. Small improvements add up.",
                    "Your practical help is valued by others. Your analytical skills provide solutions."
                ],
                libra: [
                    "Relationships are highlighted today. Your diplomatic skills create harmony.",
                    "Aesthetic judgments are favored. Trust your sense of balance and beauty.",
                    "Partnership opportunities arise. Your fair approach brings positive results."
                ],
                scorpio: [
                    "Your determination helps you overcome obstacles today.",
                    "Trust issues may arise. Your perceptive nature reveals hidden truths.",
                    "Transformation is possible now. Embrace necessary changes."
                ],
                sagittarius: [
                    "Adventure calls to you today. Follow your desire for new experiences.",
                    "Educational pursuits are favored. Your philosophical nature seeks meaning.",
                    "Optimism brings opportunities. Your enthusiasm inspires others."
                ],
                capricorn: [
                    "Professional matters progress today. Your disciplined approach earns respect.",
                    "Long-term goals come into focus. Your patience and persistence pay off.",
                    "Authority figures are supportive. Your responsible nature is recognized."
                ],
                aquarius: [
                    "Innovative ideas flow freely today. Your unique perspective offers solutions.",
                    "Social causes benefit from your involvement. Your humanitarian values guide action.",
                    "Friendship brings unexpected benefits. Your open-minded approach attracts diverse connections."
                ],
                pisces: [
                    "Creative inspiration is strong today. Trust your imagination.",
                    "Spiritual insights offer guidance. Your compassionate nature connects with others.",
                    "Artistic pursuits are favored. Your sensitivity creates beauty."
                ]
            };
            
            const randomIndex = Math.floor(Math.random() * horoscopes[sign].length);
            const date = moment().format('MMMM D, YYYY');
            
            // Format sign name with first letter capitalized
            const formattedSign = sign.charAt(0).toUpperCase() + sign.slice(1);
            
            await safeSendText(sock, sender, `⭐ *${formattedSign} Horoscope for ${date}*\n\n${horoscopes[sign][randomIndex]}`);
        } catch (err) {
            logger.error('Horoscope error:', err);
            await safeSendText(sock, sender, '❌ The stars are not aligned right now. Try again later.');
        }
    },

    async yomama(sock, sender) {
        try {
            const jokes = [
                "Yo mama so fat when she got on the scale it said 'To be continued'",
                "Yo mama so fat she doesn't need the internet, because she's already worldwide",
                "Yo mama so fat Thanos had to snap twice",
                "Yo mama so old her birth certificate is in Roman numerals",
                "Yo mama so old she knew Burger King while he was still a prince",
                "Yo mama so ugly she made an onion cry",
                "Yo mama so ugly when she tried to join an ugly contest, they said 'Sorry, no professionals'",
                "Yo mama so short she went bungee jumping and hit the ground",
                "Yo mama so short she can hang-glide on a Dorito",
                "Yo mama so smart she invented a solar-powered flashlight",
                "Yo mama so dumb she tried to climb Mountain Dew",
                "Yo mama so dumb she put airbags on her computer in case it crashed",
                "Yo mama so lazy she got a remote for her remote",
                "Yo mama so lazy she made her kids name themselves",
                "Yo mama so poor when I saw her kicking a can down the street, I asked her what she was doing and she said 'Moving'"
            ];
            
            const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
            await safeSendText(sock, sender, `😂 ${randomJoke}`);
        } catch (err) {
            logger.error('Yo mama joke error:', err);
            await safeSendText(sock, sender, '❌ An error occurred while fetching a yo mama joke.');
        }
    },
    
    async init() {
        try {
            logger.info('Fun module initialized');
            return true;
        } catch (err) {
            logger.error('Fun module initialization error:', err);
            return false;
        }
    }
};

// Export the commands object directly to ensure it's accessible
const commands = funCommands;

module.exports = {
    commands,
    category: 'fun',
    init: funCommands.init
};