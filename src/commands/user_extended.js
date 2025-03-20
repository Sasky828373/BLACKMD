/**
 * Extended User Commands for WhatsApp Bot
 * 
 * Inspired by popular WhatsApp MD bots' features
 */

const logger = require('../utils/logger');
const { checkPermission } = require('../utils/permissions');
const moment = require('moment');
const fs = require('fs').promises;
const { isJidGroup } = require('../utils/jidHelper');

/**
 * Get the appropriate JID for responding to a command
 * @param {Object} sock - WhatsApp socket connection
 * @param {string|Object} sender - Sender JID or object
 * @param {Object} message - Message object (for context)
 * @returns {string} - The JID to send the response to
 */
function getResponseJid(sender, message) {
    // If message is in a group, respond in the group
    if (message && message.key && message.key.remoteJid && isJidGroup(message.key.remoteJid)) {
        return message.key.remoteJid;
    }
    
    // Otherwise respond to the sender directly
    return typeof sender === 'string' ? sender : 
           (sender.jid || (sender.participant ? sender.participant.replace(/:[^:]*$/, '') : null));
}
const path = require('path');
const axios = require('axios');
const userDatabase = require('../utils/userDatabase');

// Access centralized user data
const { 
    userProfiles, 
    userGames, 
    marriageData, 
    bankAccounts, 
    userJobs, 
    petData, 
    userAfk, 
    streakData, 
    checkinData, 
    lotteryParticipants 
} = userDatabase;

// Create necessary directories
const TEMP_DIR = path.join(process.cwd(), 'temp', 'user_extended');
const { safeSendText, safeSendMessage, safeSendImage, formatJidForLogging } = require('../utils/jidHelper');

/**
 * Create temp directories if they don't exist
 */
async function initDirectories() {
    try {
        await fs.mkdir(TEMP_DIR, { recursive: true });
        logger.info('User extended temp directories created');
    } catch (err) {
        logger.error('Failed to create user extended temp directories:', err);
    }
}

// Initialize directories
initDirectories();

/**
 * Get a user profile or show error message
 * @param {object} sock - WhatsApp socket
 * @param {string|object} userId - User ID or sender object
 * @param {boolean} sendError - Whether to send error message
 * @param {string} groupJid - Optional group JID for responding in groups
 * @param {object} message - Optional message object for context
 * @returns {object|null} User profile or null if not found
 */
async function getUserProfile(sock, userId, sendError = true, groupJid = null, message = null) {
    // Extract proper userJid from sender object if needed
    let userJid;
    if (typeof userId === 'string') {
        userJid = userId;
    } else if (typeof userId === 'object') {
        userJid = userId.jid || (userId.participant ? userId.participant.replace(/:[^:]*$/, '') : null);
        
        // If still null, try to extract from raw object
        if (!userJid && userId) {
            const keys = Object.keys(userId);
            for (const key of keys) {
                if (typeof userId[key] === 'string' && userId[key].includes('@s.whatsapp.net')) {
                    userJid = userId[key];
                    break;
                }
            }
        }
    }
    
    // If we have a message object, try to get group context
    if (!groupJid && message && message.key && message.key.remoteJid && message.key.remoteJid.includes('@g.us')) {
        groupJid = message.key.remoteJid;
    }
    
    // Use the centralized userDatabase.getUserProfile function with JID normalization
    const profile = userDatabase.getUserProfile(userJid);
    
    if (!profile && sendError) {
        // Send error message to the group if available, otherwise to the user directly
        const targetJid = groupJid || userJid;
        
        console.log(`[DEBUG] getUserProfile: User not found. userJid=${userJid}, groupJid=${groupJid}, targetJid=${targetJid}`);
        
        await safeSendText(sock, targetJid, '*❌ Error:* You need to register first! Use .register to create a profile.', 
            { priority: true }
        );
        return null;
    }
    
    return profile;
}

/**
 * Format coins with commas
 * @param {number} amount - Amount of coins
 * @returns {string} Formatted amount
 */
function formatNumber(amount) {
    return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format time in seconds to readable format
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string
 */
function formatTimeRemaining(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

/**
 * Add achievement to a user
 * @param {object} profile - User profile
 * @param {string} achievementId - Achievement ID
 * @returns {boolean} Whether achievement was added (false if already had)
 */
function addAchievement(profile, achievementId) {
    // Achievement list should be imported from userDatabase in a real implementation
    const achievementsList = [
        { id: 'register', name: 'New Arrival', description: 'Register a profile' },
        { id: 'level5', name: 'Leveling Up', description: 'Reach level 5' },
        { id: 'level10', name: 'Pro User', description: 'Reach level 10' },
        { id: 'daily7', name: 'Weekly Streak', description: 'Claim daily rewards 7 days in a row' },
        { id: 'daily30', name: 'Monthly Dedication', description: 'Claim daily rewards 30 days in a row' },
        { id: 'rich', name: 'Getting Rich', description: 'Accumulate 10,000 coins' },
        { id: 'millionaire', name: 'Millionaire', description: 'Accumulate 1,000,000 coins' },
        { id: 'married', name: 'Soul Bound', description: 'Get married' },
        { id: 'pet', name: 'Pet Lover', description: 'Adopt a pet' },
        { id: 'job', name: 'Employed', description: 'Get a job' },
        { id: 'bank', name: 'Banker', description: 'Open a bank account' },
        { id: 'deposit', name: 'Saver', description: 'Make a deposit' },
        { id: 'bio', name: 'Identity', description: 'Set a bio' },
        { id: 'lottery', name: 'Gambler', description: 'Participate in a lottery' },
        { id: 'lottery_win', name: 'Lucky Winner', description: 'Win the lottery' },
        // New achievements
        { id: 'crime', name: 'Criminal', description: 'Commit your first crime' },
        { id: 'investor', name: 'Investor', description: 'Make your first investment' },
        { id: 'crafting', name: 'Craftsman', description: 'Craft your first item' },
        { id: 'fishing', name: 'Fisherman', description: 'Catch your first fish' },
        { id: 'mining', name: 'Miner', description: 'Mine your first resource' }
    ];

    const achievement = achievementsList.find(a => a.id === achievementId);
    if (!achievement) return false;
    
    if (!profile.achievements) {
        profile.achievements = [];
    }
    
    if (profile.achievements.includes(achievement.name)) {
        return false;
    }
    
    profile.achievements.push(achievement.name);
    return true;
}

// Define job list
const jobsList = [
    { name: 'Developer', income: 500, requirements: { level: 3 } },
    { name: 'Teacher', income: 300, requirements: { level: 2 } },
    { name: 'Doctor', income: 700, requirements: { level: 5 } },
    { name: 'Artist', income: 250, requirements: { level: 1 } },
    { name: 'Engineer', income: 600, requirements: { level: 4 } },
    { name: 'Chef', income: 350, requirements: { level: 2 } },
    { name: 'Police Officer', income: 400, requirements: { level: 3 } },
    { name: 'Entrepreneur', income: 800, requirements: { level: 6 } },
    { name: 'Musician', income: 400, requirements: { level: 3 } },
    { name: 'Scientist', income: 550, requirements: { level: 4 } },
    // New jobs
    { name: 'Farmer', income: 280, requirements: { level: 1 } },
    { name: 'Fisherman', income: 320, requirements: { level: 2 } },
    { name: 'Miner', income: 450, requirements: { level: 3 } },
    { name: 'Lawyer', income: 650, requirements: { level: 5 } },
    { name: 'Pilot', income: 750, requirements: { level: 6 } }
];

// Available pet types
const petTypes = [
    { name: 'Dog', cost: 500, happiness: 10, health: 10, hunger: 5, loyalty: 8 },
    { name: 'Cat', cost: 400, happiness: 8, health: 8, hunger: 3, loyalty: 5 },
    { name: 'Bird', cost: 200, happiness: 6, health: 6, hunger: 2, loyalty: 4 },
    { name: 'Fish', cost: 100, happiness: 4, health: 5, hunger: 1, loyalty: 2 },
    { name: 'Hamster', cost: 150, happiness: 7, health: 5, hunger: 2, loyalty: 4 },
    { name: 'Rabbit', cost: 300, happiness: 8, health: 7, hunger: 4, loyalty: 6 },
    { name: 'Turtle', cost: 250, happiness: 5, health: 9, hunger: 1, loyalty: 7 },
    { name: 'Fox', cost: 800, happiness: 9, health: 7, hunger: 6, loyalty: 5 },
    { name: 'Dragon', cost: 5000, happiness: 15, health: 15, hunger: 10, loyalty: 10 },
    { name: 'Unicorn', cost: 10000, happiness: 20, health: 20, hunger: 8, loyalty: 15 },
    // New pets
    { name: 'Snake', cost: 600, happiness: 6, health: 7, hunger: 3, loyalty: 4 },
    { name: 'Lion', cost: 2000, happiness: 12, health: 12, hunger: 8, loyalty: 7 },
    { name: 'Tiger', cost: 2500, happiness: 13, health: 13, hunger: 9, loyalty: 8 },
    { name: 'Bear', cost: 3000, happiness: 14, health: 14, hunger: 10, loyalty: 9 },
    { name: 'Panda', cost: 1500, happiness: 10, health: 10, hunger: 7, loyalty: 10 }
];

/**
 * Calculate work time remaining (cooldown)
 * @param {object} job - User job data
 * @returns {number} Time remaining in seconds
 */
function calculateWorkCooldown(job) {
    if (!job.lastWork) return 0;
    
    const now = Date.now();
    const cooldown = 3600 * 1000; // 1 hour cooldown
    const remaining = (job.lastWork + cooldown) - now;
    
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

// Game item definitions
const gameItems = {
    // Resources
    'wood': { type: 'resource', value: 10, description: 'Basic crafting material' },
    'stone': { type: 'resource', value: 15, description: 'Basic building material' },
    'iron': { type: 'resource', value: 30, description: 'Valuable crafting material' },
    'gold': { type: 'resource', value: 100, description: 'Precious metal' },
    'diamond': { type: 'resource', value: 500, description: 'Rare gemstone' },
    'leather': { type: 'resource', value: 20, description: 'Material from hunting' },
    'cloth': { type: 'resource', value: 25, description: 'Soft material for crafting' },

    // Fish
    'common_fish': { type: 'fish', value: 25, description: 'Common fish, easily caught' },
    'uncommon_fish': { type: 'fish', value: 50, description: 'Slightly rarer fish' },
    'rare_fish': { type: 'fish', value: 125, description: 'Rare fish, good value' },
    'epic_fish': { type: 'fish', value: 250, description: 'Epic fish, high value' },
    'legendary_fish': { type: 'fish', value: 1000, description: 'Legendary fish, extremely rare' },

    // Crafted items
    'fishing_rod': { 
        type: 'tool', 
        value: 200, 
        description: 'Improves fishing success rate',
        recipe: { 'wood': 3, 'cloth': 2 },
        effect: { fishing_boost: 15 }
    },
    'pickaxe': { 
        type: 'tool', 
        value: 250, 
        description: 'Improves mining success rate',
        recipe: { 'wood': 2, 'iron': 3 },
        effect: { mining_boost: 15 }
    },
    'sword': { 
        type: 'weapon', 
        value: 350, 
        description: 'Useful for hunting',
        recipe: { 'iron': 5, 'leather': 2 },
        effect: { hunting_boost: 20 }
    },
    'shield': { 
        type: 'armor', 
        value: 300, 
        description: 'Protects during adventures',
        recipe: { 'iron': 4, 'wood': 2 },
        effect: { defense_boost: 15 }
    },
    'golden_amulet': { 
        type: 'accessory', 
        value: 1000, 
        description: 'Increases luck',
        recipe: { 'gold': 3, 'diamond': 1 },
        effect: { luck_boost: 10 }
    }
};

// Farming crops
const crops = [
    { name: 'wheat', growTime: 30, value: 40, seedCost: 10 },
    { name: 'carrot', growTime: 60, value: 70, seedCost: 20 },
    { name: 'potato', growTime: 90, value: 100, seedCost: 30 },
    { name: 'tomato', growTime: 120, value: 150, seedCost: 40 },
    { name: 'corn', growTime: 180, value: 250, seedCost: 60 },
    { name: 'strawberry', growTime: 240, value: 350, seedCost: 80 },
    { name: 'pumpkin', growTime: 360, value: 500, seedCost: 120 },
    { name: 'watermelon', growTime: 480, value: 700, seedCost: 180 }
];

// Hunting animals
const huntAnimals = [
    { name: 'rabbit', chance: 35, reward: { leather: 1, coins: 30 } },
    { name: 'deer', chance: 25, reward: { leather: 2, coins: 70 } },
    { name: 'boar', chance: 15, reward: { leather: 3, coins: 120 } },
    { name: 'wolf', chance: 10, reward: { leather: 2, coins: 150 } },
    { name: 'bear', chance: 8, reward: { leather: 4, coins: 250 } },
    { name: 'tiger', chance: 5, reward: { leather: 3, coins: 350 } },
    { name: 'dragon', chance: 2, reward: { leather: 5, coins: 1000 } }
];

// Quest definitions
const quests = [
    { 
        id: 'q1', 
        name: 'Beginner Gatherer', 
        description: 'Collect 5 wood and 3 stone',
        requirements: { 'wood': 5, 'stone': 3 },
        reward: { coins: 200, xp: 50 },
        difficulty: 'easy'
    },
    { 
        id: 'q2', 
        name: 'Fisher\'s Dream', 
        description: 'Catch 2 rare fish',
        requirements: { 'rare_fish': 2 },
        reward: { coins: 350, xp: 100 },
        difficulty: 'medium'
    },
    { 
        id: 'q3', 
        name: 'Treasure Hunter', 
        description: 'Find 2 gold and 1 diamond',
        requirements: { 'gold': 2, 'diamond': 1 },
        reward: { coins: 700, xp: 200 },
        difficulty: 'hard'
    },
    { 
        id: 'q4', 
        name: 'Master Craftsman', 
        description: 'Craft a sword and a shield',
        requirements: { 'sword': 1, 'shield': 1 },
        reward: { coins: 1000, xp: 300 },
        difficulty: 'hard'
    },
    { 
        id: 'q5', 
        name: 'Legendary Explorer', 
        description: 'Complete 5 adventures',
        requirements: { 'adventure_count': 5 },
        reward: { coins: 1500, xp: 500, 'golden_amulet': 1 },
        difficulty: 'legendary'
    }
];

// Location for adventure
const adventureLocations = [
    {
        name: 'Forest',
        difficulty: 'easy',
        rewards: {
            common: ['wood', 'common_fish', 'leather'],
            uncommon: ['iron', 'uncommon_fish'],
            rare: ['gold']
        },
        enemies: ['wolf', 'bear'],
        description: 'A dense forest with ancient trees and flowing streams'
    },
    {
        name: 'Cave',
        difficulty: 'medium',
        rewards: {
            common: ['stone', 'iron'],
            uncommon: ['gold'],
            rare: ['diamond']
        },
        enemies: ['bat', 'spider', 'goblin'],
        description: 'A dark cave with narrow passages and mysterious echoes'
    },
    {
        name: 'Mountain',
        difficulty: 'hard',
        rewards: {
            common: ['stone', 'iron'],
            uncommon: ['gold', 'rare_fish'],
            rare: ['diamond']
        },
        enemies: ['eagle', 'yeti', 'dragon'],
        description: 'A treacherous mountain with steep cliffs and hidden treasures'
    },
    {
        name: 'Ancient Ruins',
        difficulty: 'expert',
        rewards: {
            common: ['stone', 'iron'],
            uncommon: ['gold', 'epic_fish'],
            rare: ['diamond', 'legendary_fish']
        },
        enemies: ['skeleton', 'ghost', 'ancient guardian'],
        description: 'The remains of a lost civilization with magical artifacts and hidden traps'
    }
];

// Define the commands object
const commands = {
    // 1. Economy System - Crime and Work
    async crime(sock, message) {
        const sender = message.key.participant || message.key.remoteJid;
        const responseJid = getResponseJid(sender, message);
        
        const profile = await getUserProfile(sock, sender, true, responseJid, message);
        if (!profile) return;
        
        // Check cooldown (3 hours)
        const lastCrime = profile.lastCrime || 0;
        const cooldown = 3 * 60 * 60 * 1000; // 3 hours in ms
        
        if (Date.now() - lastCrime < cooldown) {
            const timeLeft = Math.ceil((lastCrime + cooldown - Date.now()) / (1000 * 60 * 60));
            await safeSendMessage(sock, responseJid, {
                text: `*⏳ Cooldown:* The police are still looking for you! Try again in ${timeLeft} hours.`
            });
            return;
        }
        
        // Crime success rate based on level (40% + 2% per level, max 80%)
        const successRate = Math.min(40 + (profile.level * 2), 80);
        const success = Math.random() * 100 <= successRate;
        
        // Crime rewards and penalties
        const baseReward = 300;
        const levelBonus = profile.level * 30;
        const maxReward = baseReward + levelBonus;
        
        // Random crime amount with variation
        const rewardVariation = Math.random() * 0.4 - 0.2; // -20% to +20%
        const reward = Math.floor(maxReward * (1 + rewardVariation));
        
        // Penalty is 20-50% of potential reward
        const penaltyPercent = Math.random() * 30 + 20;
        const penalty = Math.floor((maxReward * penaltyPercent) / 100);
        
        // Crime scenarios
        const crimeScenarios = [
            { name: "Bank robbery", risk: "high" },
            { name: "Pickpocketing", risk: "low" },
            { name: "Shoplifting", risk: "medium" },
            { name: "Car theft", risk: "high" },
            { name: "Hacking", risk: "medium" },
            { name: "Identity theft", risk: "medium" },
            { name: "Art theft", risk: "high" },
            { name: "Jewelry heist", risk: "high" },
            { name: "Drug dealing", risk: "medium" },
            { name: "Smuggling", risk: "high" }
        ];
        
        const scenario = crimeScenarios[Math.floor(Math.random() * crimeScenarios.length)];
        
        // Update profile based on outcome
        profile.lastCrime = Date.now();
        
        if (success) {
            profile.coins += reward;
            
            // Add achievement if first crime
            if (addAchievement(profile, 'crime')) {
                await safeSendText(sock, sender, '*🏆 Achievement Unlocked:* Criminal\nYou committed your first crime!'
                );
            }
            
            await safeSendMessage(sock, sender, {
                text: `*🦹‍♂️ Crime Successful:* Your ${scenario.name} went undetected!\n\nYou earned ${formatNumber(reward)} coins from your illegal activities.\n\nCurrent Balance: ${formatNumber(profile.coins)} coins`
            });
        } else {
            // Don't go below 0 coins
            profile.coins = Math.max(0, profile.coins - penalty);
            
            await safeSendMessage(sock, sender, {
                text: `*🚨 Crime Failed:* You were caught during your ${scenario.name}!\n\nYou paid ${formatNumber(penalty)} coins in fines and legal fees.\n\nCurrent Balance: ${formatNumber(profile.coins)} coins`
            });
        }
        
        // Save profile
        userProfiles.set(sender, profile);
    },
    
    async work(sock, message) {
        const sender = message.key.participant || message.key.remoteJid;
        const responseJid = getResponseJid(sender, message);
        
        const profile = await getUserProfile(sock, sender, true, responseJid, message);
        if (!profile) return;
        
        let job = userJobs.get(sender);
        
        if (!job) {
            await safeSendMessage(sock, sender, {
                text: '*❌ Error:* You don\'t have a job yet. Use .getjob [job name] to get a job!\n\n*Available Jobs:*\n' + 
                jobsList.map(j => `• ${j.name} - Income: ${j.income} coins/hr (Level ${j.requirements.level}+)`).join('\n')
            });
            return;
        }
        
        const cooldown = calculateWorkCooldown(job);
        if (cooldown > 0) {
            await safeSendMessage(sock, sender, {
                text: `*⏳ Cooldown:* You need to rest before working again. Try again in ${formatTimeRemaining(cooldown)}.`
            });
            return;
        }
        
        // Work reward with random variation
        const baseReward = jobsList.find(j => j.name === job.name).income;
        const variationPercent = (Math.random() * 40) - 20; // -20% to +20%
        const earnedCoins = Math.floor(baseReward * (1 + variationPercent / 100));
        
        // Update profile
        profile.coins += earnedCoins;
        job.lastWork = Date.now();
        
        // Random work messages
        const workMessages = [
            `You worked hard as a ${job.name} and earned ${earnedCoins} coins!`,
            `Another day, another paycheck! You earned ${earnedCoins} coins as a ${job.name}.`,
            `Your skills as a ${job.name} earned you ${earnedCoins} coins today!`,
            `You completed your shift as a ${job.name} and received ${earnedCoins} coins!`,
            `Your boss was impressed with your work as a ${job.name}! You earned ${earnedCoins} coins.`
        ];
        
        const randomMessage = workMessages[Math.floor(Math.random() * workMessages.length)];
        
        // Save data
        userProfiles.set(sender, profile);
        userJobs.set(sender, job);
        
        await safeSendMessage(sock, sender, {
            text: `*💼 Work Complete!*\n\n${randomMessage}\n\nYour balance: ${formatNumber(profile.coins)} coins\nCooldown: 1 hour`
        });
    },
    
    async getjob(sock, sender, args) {
        const profile = await getUserProfile(sock, sender);
        if (!profile) return;
        
        if (args.length < 1) {
            await safeSendMessage(sock, sender, {
                text: '*⚠️ Usage:* .getjob [job name]\n\n*Available Jobs:*\n' + 
                jobsList.map(j => `• ${j.name} - Income: ${j.income} coins/hr (Level ${j.requirements.level}+)`).join('\n')
            });
            return;
        }
        
        const jobName = args.join(' ');
        const job = jobsList.find(j => j.name.toLowerCase() === jobName.toLowerCase());
        
        if (!job) {
            await safeSendMessage(sock, sender, {
                text: '*❌ Error:* Job not found. Please choose from the available jobs:\n\n' + 
                jobsList.map(j => `• ${j.name} - Income: ${j.income} coins/hr (Level ${j.requirements.level}+)`).join('\n')
            });
            return;
        }
        
        if (profile.level < job.requirements.level) {
            await safeSendMessage(sock, sender, {
                text: `*❌ Error:* You need to be level ${job.requirements.level} to work as a ${job.name}. Your current level: ${profile.level}`
            });
            return;
        }
        
        // Get the job and save data
        userJobs.set(sender, {
            name: job.name,
            lastWork: 0
        });
        
        // Add achievement if it's their first job
        if (addAchievement(profile, 'job')) {
            await safeSendText(sock, sender, '*🏆 Achievement Unlocked:* Employed\nYou got your first job!'
            );
        }
        
        // Save profile
        userProfiles.set(sender, profile);
        
        await safeSendMessage(sock, sender, {
            text: `*💼 Job Acquired!*\n\nYou are now working as a ${job.name}!\nSalary: ${job.income} coins/hr\n\nUse .work to start earning coins.`
        });
    },
    
    async resign(sock, sender) {
        const profile = await getUserProfile(sock, sender);
        if (!profile) return;
        
        const job = userJobs.get(sender);
        if (!job) {
            await safeSendText(sock, sender, '*❌ Error:* You don\'t have a job to resign from.'
            );
            return;
        }
        
        const jobName = job.name;
        userJobs.delete(sender);
        
        await safeSendMessage(sock, sender, {
            text: `*💼 Resignation:* You've successfully resigned from your position as a ${jobName}.\n\nUse .getjob to find a new job.`
        });
    },
    
    // 2. Social System - AFK and Reputation
    async afk(sock, sender, args, isGroup, msgData) {
        // Create user profile if it doesn't exist
        let profile = userProfiles.get(sender);
        if (!profile) {
            profile = {
                name: 'User',
                xp: 0,
                level: 1,
                coins: 0,
                inventory: {},
                joinedAt: Date.now(),
                lastActive: Date.now()
            };
            userProfiles.set(sender, profile);
        }
        
        // Get proper response JID (group or sender)
        const responseJid = isGroup ? msgData.key.remoteJid : sender;
        
        // Set AFK status
        let reason = 'Away from keyboard';
        if (args.length > 0) {
            reason = args.join(' ');
        }
        
        userAfk.set(sender, {
            status: true,
            reason: reason,
            timestamp: Date.now()
        });
        
        await safeSendMessage(sock, responseJid, {
            text: `*💤 AFK Status Set:* ${profile.name} is now AFK.\nReason: ${reason}\n\nAnyone who mentions them will be informed of their AFK status.`
        });
    },
    
    async unafk(sock, sender, args, isGroup, msgData) {
        // Create user profile if it doesn't exist
        let profile = userProfiles.get(sender);
        if (!profile) {
            profile = {
                name: 'User',
                xp: 0,
                level: 1,
                coins: 0,
                inventory: {},
                joinedAt: Date.now(),
                lastActive: Date.now()
            };
            userProfiles.set(sender, profile);
        }
        
        // Get proper response JID (group or sender)
        const responseJid = isGroup ? msgData.key.remoteJid : sender;
        
        // Check if user is AFK
        if (!userAfk.get(sender)?.status) {
            await safeSendText(sock, responseJid, '*❌ Error:* You are not currently AFK.'
            );
            return;
        }
        
        // Calculate AFK duration
        const afkData = userAfk.get(sender);
        const duration = Date.now() - afkData.timestamp;
        const hours = Math.floor(duration / (1000 * 60 * 60));
        const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
        
        // Remove AFK status
        userAfk.delete(sender);
        
        await safeSendMessage(sock, responseJid, {
            text: `*🔄 AFK Status Removed:* ${profile.name} is back! They were AFK for ${hours}h ${minutes}m.`
        });
    },
    
    async rep(sock, sender, args) {
        const profile = await getUserProfile(sock, sender);
        if (!profile) return;
        
        if (args.length < 1) {
            await safeSendText(sock, sender, '*⚠️ Usage:* .rep @user'
            );
            return;
        }
        
        const targetId = args[0].replace('@', '') + '@s.whatsapp.net';
        
        if (targetId === sender) {
            await safeSendText(sock, sender, '*❌ Error:* You cannot give reputation to yourself!'
            );
            return;
        }
        
        // Check target profile
        const targetProfile = userProfiles.get(targetId);
        if (!targetProfile) {
            await safeSendText(sock, sender, '*❌ Error:* That user doesn\'t have a profile yet.'
            );
            return;
        }
        
        // Check cooldown (once per 12 hours)
        const lastRep = profile.lastRepGiven || 0;
        const cooldown = 12 * 60 * 60 * 1000; // 12 hours
        
        if (Date.now() - lastRep < cooldown) {
            const timeLeft = Math.ceil((lastRep + cooldown - Date.now()) / (1000 * 60 * 60));
            await safeSendMessage(sock, sender, {
                text: `*⏳ Cooldown:* You can give reputation again in ${timeLeft} hours.`
            });
            return;
        }
        
        // Initialize rep if needed
        if (!targetProfile.reputation) {
            targetProfile.reputation = 0;
        }
        
        // Add reputation
        targetProfile.reputation++;
        profile.lastRepGiven = Date.now();
        
        // Save profiles
        userProfiles.set(targetId, targetProfile);
        userProfiles.set(sender, profile);
        
        await safeSendMessage(sock, sender, {
            text: `*👍 Reputation:* You gave +1 reputation to ${targetProfile.name}!`
        });
        
        await safeSendMessage(sock, targetId, {
            text: `*👍 Reputation:* ${profile.name} gave you +1 reputation! Your reputation is now ${targetProfile.reputation}.`
        });
    },
    
    // 3. Mini-games - Fishing and Mining
    async fish(sock, message) {
        const sender = message.key.participant || message.key.remoteJid;
        const responseJid = getResponseJid(sender, message);
        
        const profile = await getUserProfile(sock, sender, true, responseJid, message);
        if (!profile) return;
        
        // Check if player has a fishing rod
        if (!profile.inventory?.fishingRod) {
            await safeSendText(sock, sender, '*❌ Error:* You need a fishing rod to fish! Buy one at the shop with .shop items'
            );
            return;
        }
        
        // Check cooldown (5 minutes)
        const lastFishing = profile.lastFishing || 0;
        const cooldown = 5 * 60 * 1000; // 5 minutes
        
        if (Date.now() - lastFishing < cooldown) {
            const timeLeft = Math.ceil((lastFishing + cooldown - Date.now()) / 1000);
            await safeSendMessage(sock, sender, {
                text: `*⏳ Cooldown:* You need to wait before fishing again. Try again in ${formatTimeRemaining(timeLeft)}.`
            });
            return;
        }
        
        // Initialize fishing inventory if needed
        if (!profile.inventory) {
            profile.inventory = {};
        }
        
        if (!profile.inventory.fish) {
            profile.inventory.fish = {};
        }
        
        // Define fish types and their rarity
        const fishTypes = [
            { name: 'Common Fish', value: 10, rarity: 50 },
            { name: 'Trout', value: 20, rarity: 25 },
            { name: 'Salmon', value: 40, rarity: 15 },
            { name: 'Tuna', value: 80, rarity: 8 },
            { name: 'Shark', value: 200, rarity: 1.5 },
            { name: 'Whale', value: 500, rarity: 0.5 }
        ];
        
        // Roll for success (80% chance)
        const success = Math.random() < 0.8;
        
        if (!success) {
            profile.lastFishing = Date.now();
            userProfiles.set(sender, profile);
            
            await safeSendText(sock, responseJid, '*🎣 Fishing:* You didn\'t catch anything this time. Try again later!'
            );
            return;
        }
        
        // Determine which fish was caught based on rarity
        let caughtFish = null;
        const roll = Math.random() * 100;
        let cumulativeProbability = 0;
        
        for (const fish of fishTypes) {
            cumulativeProbability += fish.rarity;
            if (roll <= cumulativeProbability) {
                caughtFish = fish;
                break;
            }
        }
        
        if (!caughtFish) {
            caughtFish = fishTypes[0]; // Default to common fish
        }
        
        // Add fish to inventory
        profile.inventory.fish[caughtFish.name] = (profile.inventory.fish[caughtFish.name] || 0) + 1;
        
        // Update profile
        profile.lastFishing = Date.now();
        
        // Add achievement if first fish
        if (addAchievement(profile, 'fishing')) {
            await safeSendText(sock, responseJid, '*🏆 Achievement Unlocked:* Fisherman\nYou caught your first fish!'
            );
        }
        
        // Save profile
        userProfiles.set(sender, profile);
        
        await safeSendMessage(sock, responseJid, {
            text: `*🎣 Fishing Success:* You caught a ${caughtFish.name} worth ${caughtFish.value} coins!\n\nYou can sell it with .sell fish [name|all]`
        });
    },
    
    async mine(sock, message) {
        const sender = message.key.participant || message.key.remoteJid;
        const responseJid = getResponseJid(sender, message);
        
        const profile = await getUserProfile(sock, sender, true, responseJid, message);
        if (!profile) return;
        
        // Check if player has a pickaxe
        if (!profile.inventory?.pickaxe) {
            await safeSendText(sock, responseJid, '*❌ Error:* You need a pickaxe to mine! Buy one at the shop with .shop items'
            );
            return;
        }
        
        // Check cooldown (8 minutes)
        const lastMining = profile.lastMining || 0;
        const cooldown = 8 * 60 * 1000; // 8 minutes
        
        if (Date.now() - lastMining < cooldown) {
            const timeLeft = Math.ceil((lastMining + cooldown - Date.now()) / 1000);
            await safeSendMessage(sock, responseJid, {
                text: `*⏳ Cooldown:* You need to rest before mining again. Try again in ${formatTimeRemaining(timeLeft)}.`
            });
            return;
        }
        
        // Initialize mining inventory if needed
        if (!profile.inventory) {
            profile.inventory = {};
        }
        
        if (!profile.inventory.minerals) {
            profile.inventory.minerals = {};
        }
        
        // Define mineral types and their rarity
        const mineralTypes = [
            { name: 'Stone', value: 2, rarity: 45 },
            { name: 'Coal', value: 10, rarity: 30 },
            { name: 'Iron', value: 30, rarity: 15 },
            { name: 'Silver', value: 60, rarity: 7 },
            { name: 'Gold', value: 120, rarity: 2.5 },
            { name: 'Diamond', value: 350, rarity: 0.5 }
        ];
        
        // Determine what was mined based on rarity
        let minedMineral = null;
        const roll = Math.random() * 100;
        let cumulativeProbability = 0;
        
        for (const mineral of mineralTypes) {
            cumulativeProbability += mineral.rarity;
            if (roll <= cumulativeProbability) {
                minedMineral = mineral;
                break;
            }
        }
        
        if (!minedMineral) {
            minedMineral = mineralTypes[0]; // Default to stone
        }
        
        // Determine quantity (1-3 for common, 1 for rare)
        const quantity = minedMineral.rarity > 10 ? Math.floor(Math.random() * 3) + 1 : 1;
        
        // Add minerals to inventory
        profile.inventory.minerals[minedMineral.name] = (profile.inventory.minerals[minedMineral.name] || 0) + quantity;
        
        // Update profile
        profile.lastMining = Date.now();
        
        // Add achievement if first mining
        if (addAchievement(profile, 'mining')) {
            await safeSendText(sock, responseJid, '*🏆 Achievement Unlocked:* Miner\nYou mined your first resource!'
            );
        }
        
        // Save profile
        userProfiles.set(sender, profile);
        
        await safeSendMessage(sock, responseJid, {
            text: `*⛏️ Mining Success:* You mined ${quantity} ${minedMineral.name}${quantity !== 1 ? 's' : ''} worth ${minedMineral.value * quantity} coins!\n\nYou can sell them with .sell mineral [name|all]`
        });
    },
    
    async sell(sock, message, args) {
        const sender = message.key.participant || message.key.remoteJid;
        const responseJid = getResponseJid(sender, message);
        
        const profile = await getUserProfile(sock, sender, true, responseJid, message);
        if (!profile) return;
        
        if (args.length < 2) {
            await safeSendText(sock, responseJid, '*⚠️ Usage:* !sell [type] [name|all]\n\nTypes: fish, mineral'
            );
            return;
        }
        
        // Initialize inventory if needed
        if (!profile.inventory) {
            profile.inventory = {
                fish: {},
                minerals: {}
            };
        }
        
        const type = args[0].toLowerCase();
        const itemName = args.slice(1).join(' ').toLowerCase();
        
        if (type !== 'fish' && type !== 'mineral') {
            await safeSendText(sock, responseJid, '*❌ Error:* Invalid type. Use "fish" or "mineral".'
            );
            return;
        }
        
        const inventory = type === 'fish' ? profile.inventory.fish : profile.inventory.minerals;
        
        if (!inventory || Object.keys(inventory).length === 0) {
            await safeSendMessage(sock, responseJid, {
                text: `*❌ Error:* You don't have any ${type === 'fish' ? 'fish' : 'minerals'} to sell.`
            });
            return;
        }
        
        // Define values of items
        const fishValues = {
            'Common Fish': 10,
            'Trout': 20,
            'Salmon': 40,
            'Tuna': 80,
            'Shark': 200,
            'Whale': 500
        };
        
        const mineralValues = {
            'Stone': 2,
            'Coal': 10,
            'Iron': 30,
            'Silver': 60,
            'Gold': 120,
            'Diamond': 350
        };
        
        const values = type === 'fish' ? fishValues : mineralValues;
        
        let totalEarned = 0;
        let itemsSold = 0;
        
        if (itemName === 'all') {
            // Sell all items
            for (const [item, quantity] of Object.entries(inventory)) {
                if (values[item]) {
                    totalEarned += values[item] * quantity;
                    itemsSold += quantity;
                    delete inventory[item];
                }
            }
        } else {
            // Find case-insensitive match
            const matchedItem = Object.keys(inventory).find(
                item => item.toLowerCase() === itemName
            );
            
            if (!matchedItem || !inventory[matchedItem]) {
                await safeSendMessage(sock, responseJid, {
                    text: `*❌ Error:* You don't have any ${itemName}. Check your inventory with .inventory.`
                });
                return;
            }
            
            totalEarned = values[matchedItem] * inventory[matchedItem];
            itemsSold = inventory[matchedItem];
            delete inventory[matchedItem];
        }
        
        // Update profile
        profile.coins += totalEarned;
        userProfiles.set(sender, profile);
        
        await safeSendMessage(sock, responseJid, {
            text: `*💰 Sale Complete:* You sold ${itemsSold} ${type === 'fish' ? 'fish' : 'minerals'} for ${formatNumber(totalEarned)} coins!\n\nYour balance: ${formatNumber(profile.coins)} coins`
        });
    },
    
    async extendedInventory(sock, message, args) {
        const sender = message.key.remoteJid;
        const profile = await getUserProfile(sock, sender);
        if (!profile) return;
        
        // Initialize inventory if needed
        if (!profile.inventory) {
            profile.inventory = {
                fish: {},
                minerals: {}
            };
        }
        
        // Get specific inventory type
        if (args.length > 0) {
            const type = args[0].toLowerCase();
            
            if (type === 'fish') {
                const fishInventory = profile.inventory.fish || {};
                if (Object.keys(fishInventory).length === 0) {
                    await safeSendText(sock, sender, '*🐟 Fish Inventory:* You don\'t have any fish yet. Use .fish to catch some!'
                    );
                    return;
                }
                
                let fishText = '*🐟 Fish Inventory:*\n\n';
                for (const [fish, quantity] of Object.entries(fishInventory)) {
                    fishText += `${fish}: ${quantity}\n`;
                }
                
                await safeSendText(sock, sender, fishText );
                return;
            }
            
            if (type === 'mineral' || type === 'minerals') {
                const mineralInventory = profile.inventory.minerals || {};
                if (Object.keys(mineralInventory).length === 0) {
                    await safeSendText(sock, sender, '*⛏️ Mineral Inventory:* You don\'t have any minerals yet. Use .mine to mine some!'
                    );
                    return;
                }
                
                let mineralText = '*⛏️ Mineral Inventory:*\n\n';
                for (const [mineral, quantity] of Object.entries(mineralInventory)) {
                    mineralText += `${mineral}: ${quantity}\n`;
                }
                
                await safeSendText(sock, sender, mineralText );
                return;
            }
        }
        
        // Get full inventory
        let inventoryText = '*📦 Inventory:*\n\n';
        
        // Tools section
        inventoryText += '*🔨 Tools:*\n';
        inventoryText += profile.inventory.fishingRod ? '🎣 Fishing Rod\n' : '';
        inventoryText += profile.inventory.pickaxe ? '⛏️ Pickaxe\n' : '';
        inventoryText += profile.inventory.axe ? '🪓 Axe\n' : '';
        
        if (!profile.inventory.fishingRod && !profile.inventory.pickaxe && !profile.inventory.axe) {
            inventoryText += 'No tools yet\n';
        }
        
        // Fish section
        const fishInventory = profile.inventory.fish || {};
        inventoryText += '\n*🐟 Fish:*\n';
        if (Object.keys(fishInventory).length === 0) {
            inventoryText += 'No fish yet\n';
        } else {
            for (const [fish, quantity] of Object.entries(fishInventory)) {
                inventoryText += `${fish}: ${quantity}\n`;
            }
        }
        
        // Minerals section
        const mineralInventory = profile.inventory.minerals || {};
        inventoryText += '\n*⛏️ Minerals:*\n';
        if (Object.keys(mineralInventory).length === 0) {
            inventoryText += 'No minerals yet\n';
        } else {
            for (const [mineral, quantity] of Object.entries(mineralInventory)) {
                inventoryText += `${mineral}: ${quantity}\n`;
            }
        }
        
        await safeSendText(sock, sender, inventoryText );
    },
    
    // 4. Crafting System
    async craft(sock, message, args) {
        const sender = message.key.participant || message.key.remoteJid;
        const responseJid = getResponseJid(sender, message);
        
        const profile = await getUserProfile(sock, sender, true, responseJid, message);
        if (!profile) return;
        
        // Define crafting recipes
        const recipes = {
            'fishing rod': {
                requires: { 'Wood': 5, 'String': 3 },
                result: 'fishingRod'
            },
            'pickaxe': {
                requires: { 'Wood': 3, 'Iron': 5 },
                result: 'pickaxe'
            },
            'axe': {
                requires: { 'Wood': 3, 'Iron': 3 },
                result: 'axe'
            },
            'shield': {
                requires: { 'Wood': 3, 'Iron': 8 },
                result: 'shield'
            },
            'helmet': {
                requires: { 'Iron': 10, 'Leather': 2 },
                result: 'helmet'
            },
            'armor': {
                requires: { 'Iron': 15, 'Leather': 5 },
                result: 'armor'
            }
        };
        
        // Show recipe list if no args
        if (args.length === 0) {
            let recipeText = '*🔨 Crafting Recipes:*\n\n';
            
            for (const [item, recipe] of Object.entries(recipes)) {
                recipeText += `*${item.charAt(0).toUpperCase() + item.slice(1)}*\n`;
                recipeText += 'Requires: ';
                
                const requirements = [];
                for (const [material, quantity] of Object.entries(recipe.requires)) {
                    requirements.push(`${material} x${quantity}`);
                }
                
                recipeText += requirements.join(', ') + '\n\n';
            }
            
            recipeText += 'Use .craft [item] to craft an item';
            
            await safeSendText(sock, responseJid, recipeText );
            return;
        }
        
        // Get requested item
        const requestedItem = args.join(' ').toLowerCase();
        const recipe = recipes[requestedItem];
        
        if (!recipe) {
            await safeSendText(sock, responseJid, '*❌ Error:* Invalid crafting recipe. Use .craft to see available recipes.'
            );
            return;
        }
        
        // Initialize inventory if needed
        if (!profile.inventory) {
            profile.inventory = {
                minerals: {},
                fish: {}
            };
        }
        
        // Check requirements
        let missingMaterials = [];
        
        for (const [material, requiredQuantity] of Object.entries(recipe.requires)) {
            const availableQuantity = (profile.inventory.minerals && profile.inventory.minerals[material]) || 0;
            
            if (availableQuantity < requiredQuantity) {
                missingMaterials.push(`${material} (need ${requiredQuantity}, have ${availableQuantity})`);
            }
        }
        
        if (missingMaterials.length > 0) {
            await safeSendMessage(sock, responseJid, {
                text: `*❌ Missing Materials:* You don't have all required materials to craft a ${requestedItem}.\n\nMissing: ${missingMaterials.join(', ')}`
            });
            return;
        }
        
        // Check if already has the item
        if (profile.inventory[recipe.result]) {
            await safeSendMessage(sock, responseJid, {
                text: `*❌ Error:* You already have a ${requestedItem}.`
            });
            return;
        }
        
        // Consume materials
        for (const [material, requiredQuantity] of Object.entries(recipe.requires)) {
            profile.inventory.minerals[material] -= requiredQuantity;
            
            // Remove entry if quantity becomes 0
            if (profile.inventory.minerals[material] <= 0) {
                delete profile.inventory.minerals[material];
            }
        }
        
        // Add crafted item
        profile.inventory[recipe.result] = true;
        
        // Add achievement if first craft
        if (addAchievement(profile, 'crafting')) {
            await safeSendText(sock, responseJid, '*🏆 Achievement Unlocked:* Craftsman\nYou crafted your first item!'
            );
        }
        
        // Save profile
        userProfiles.set(sender, profile);
        
        await safeSendMessage(sock, responseJid, {
            text: `*🔨 Crafting Success:* You have crafted a ${requestedItem}!`
        });
    },
    
    // 5. Investment System
    async invest(sock, message, args) {
        const sender = message.key.participant || message.key.remoteJid;
        const responseJid = getResponseJid(sender, message);
        
        const profile = await getUserProfile(sock, sender, true, responseJid, message);
        if (!profile) return;
        
        // Initialize investment data if needed
        if (!profile.investments) {
            profile.investments = [];
        }
        
        // Show current investments if no args
        if (args.length === 0) {
            if (profile.investments.length === 0) {
                await safeSendText(sock, responseJid, '*📊 Investments:* You don\'t have any active investments. Use .invest [amount] [duration] to invest.'
                );
                return;
            }
            
            let investmentText = '*📊 Your Investments:*\n\n';
            
            for (let i = 0; i < profile.investments.length; i++) {
                const investment = profile.investments[i];
                const remainingTime = investment.endTime - Date.now();
                
                if (remainingTime <= 0) {
                    // Investment matured, claim returns
                    const returnAmount = Math.floor(investment.amount * (1 + investment.interestRate));
                    profile.coins += returnAmount;
                    
                    investmentText += `*Investment #${i+1}:* MATURED\n`;
                    investmentText += `Initial: ${formatNumber(investment.amount)} coins\n`;
                    investmentText += `Return: ${formatNumber(returnAmount)} coins\n`;
                    investmentText += `Profit: ${formatNumber(returnAmount - investment.amount)} coins\n\n`;
                    
                    // Remove the matured investment
                    profile.investments.splice(i, 1);
                    i--; // Adjust index after removal
                } else {
                    // Active investment
                    const daysLeft = Math.ceil(remainingTime / (1000 * 60 * 60 * 24));
                    const expectedReturn = Math.floor(investment.amount * (1 + investment.interestRate));
                    
                    investmentText += `*Investment #${i+1}:*\n`;
                    investmentText += `Amount: ${formatNumber(investment.amount)} coins\n`;
                    investmentText += `Interest Rate: ${(investment.interestRate * 100).toFixed(1)}%\n`;
                    investmentText += `Expected Return: ${formatNumber(expectedReturn)} coins\n`;
                    investmentText += `Matures in: ${daysLeft} day${daysLeft !== 1 ? 's' : ''}\n\n`;
                }
            }
            
            // Save profile after processing matured investments
            userProfiles.set(sender, profile);
            
            await safeSendText(sock, responseJid, investmentText );
            return;
        }
        
        // Check args
        if (args.length < 2) {
            await safeSendText(sock, responseJid, '*⚠️ Usage:* .invest [amount] [duration in days (1-30)]'
            );
            return;
        }
        
        // Parse amount
        let amount;
        if (args[0].toLowerCase() === 'all') {
            amount = profile.coins;
        } else {
            amount = parseInt(args[0]);
        }
        
        if (!amount || amount <= 0 || isNaN(amount)) {
            await safeSendText(sock, responseJid, '*❌ Error:* Please provide a valid positive amount to invest.'
            );
            return;
        }
        
        if (amount > profile.coins) {
            await safeSendMessage(sock, responseJid, {
                text: `*❌ Error:* You don't have enough coins. Your balance: ${formatNumber(profile.coins)} coins.`
            });
            return;
        }
        
        // Parse duration
        const duration = parseInt(args[1]);
        
        if (!duration || duration < 1 || duration > 30 || isNaN(duration)) {
            await safeSendText(sock, responseJid, '*❌ Error:* Duration must be between 1 and 30 days.'
            );
            return;
        }
        
        // Calculate interest rate (higher for longer investments)
        // Base rate of 5% + 0.5% per day
        const interestRate = 0.05 + (duration * 0.005);
        
        // Create investment
        const investment = {
            amount: amount,
            startTime: Date.now(),
            endTime: Date.now() + (duration * 24 * 60 * 60 * 1000),
            interestRate: interestRate
        };
        
        // Add investment and deduct coins
        profile.investments.push(investment);
        profile.coins -= amount;
        
        // Add achievement if first investment
        if (addAchievement(profile, 'investor')) {
            await safeSendText(sock, responseJid, '*🏆 Achievement Unlocked:* Investor\nYou made your first investment!'
            );
        }
        
        // Save profile
        userProfiles.set(sender, profile);
        
        const expectedReturn = Math.floor(amount * (1 + interestRate));
        
        await safeSendMessage(sock, responseJid, {
            text: `*📊 Investment Made:*\n\nAmount: ${formatNumber(amount)} coins\nDuration: ${duration} day${duration !== 1 ? 's' : ''}\nInterest Rate: ${(interestRate * 100).toFixed(1)}%\nExpected Return: ${formatNumber(expectedReturn)} coins\n\nYour investment will mature in ${duration} day${duration !== 1 ? 's' : ''}.`
        });
    },
    
    // 6. Email System
    async mail(sock, message, args) {
        const sender = message.key.participant || message.key.remoteJid;
        const responseJid = getResponseJid(sender, message);
        
        const profile = await getUserProfile(sock, sender, true, responseJid, message);
        if (!profile) return;
        
        // Initialize mail system if needed
        global.mailSystem = global.mailSystem || {
            mailboxes: new Map(),
            lastMailId: 0
        };
        
        let mailbox = global.mailSystem.mailboxes.get(sender) || {
            inbox: [],
            outbox: []
        };
        
        // Show inbox
        if (args.length === 0 || args[0].toLowerCase() === 'inbox') {
            if (mailbox.inbox.length === 0) {
                await safeSendText(sock, responseJid, '*📬 Inbox:* Your inbox is empty.'
                );
                return;
            }
            
            let inboxText = '*📬 Your Inbox:*\n\n';
            
            for (let i = 0; i < mailbox.inbox.length; i++) {
                const mail = mailbox.inbox[i];
                const senderName = mail.senderName || 'Unknown';
                
                inboxText += `*Mail #${i+1}*\n`;
                inboxText += `From: ${senderName}\n`;
                inboxText += `Subject: ${mail.subject}\n`;
                inboxText += `Date: ${new Date(mail.timestamp).toLocaleString()}\n\n`;
            }
            
            inboxText += 'Use .mail read [number] to read a mail.';
            
            await safeSendText(sock, responseJid, inboxText );
            return;
        }
        
        // Read a specific mail
        if (args[0].toLowerCase() === 'read') {
            if (args.length < 2) {
                await safeSendText(sock, responseJid, '*⚠️ Usage:* .mail read [mail number]'
                );
                return;
            }
            
            const mailNumber = parseInt(args[1]);
            
            if (isNaN(mailNumber) || mailNumber < 1 || mailNumber > mailbox.inbox.length) {
                await safeSendText(sock, responseJid, '*❌ Error:* Invalid mail number.'
                );
                return;
            }
            
            const mail = mailbox.inbox[mailNumber - 1];
            
            let mailText = '*📩 Mail:*\n\n';
            mailText += `From: ${mail.senderName || 'Unknown'}\n`;
            mailText += `Subject: ${mail.subject}\n`;
            mailText += `Date: ${new Date(mail.timestamp).toLocaleString()}\n\n`;
            mailText += `${mail.content}\n\n`;
            
            if (mail.attachment) {
                mailText += `Attachment: ${mail.attachment.name}\n`;
                mailText += `Use .mail claim ${mailNumber} to claim the attachment.`;
            }
            
            await safeSendText(sock, responseJid, mailText );
            return;
        }
        
        // Claim attachment
        if (args[0].toLowerCase() === 'claim') {
            if (args.length < 2) {
                await safeSendText(sock, responseJid, '*⚠️ Usage:* .mail claim [mail number]'
                );
                return;
            }
            
            const mailNumber = parseInt(args[1]);
            
            if (isNaN(mailNumber) || mailNumber < 1 || mailNumber > mailbox.inbox.length) {
                await safeSendText(sock, responseJid, '*❌ Error:* Invalid mail number.'
                );
                return;
            }
            
            const mail = mailbox.inbox[mailNumber - 1];
            
            if (!mail.attachment) {
                await safeSendText(sock, responseJid, '*❌ Error:* This mail has no attachment to claim.'
                );
                return;
            }
            
            // Add attachment item/coins to player inventory
            if (mail.attachment.type === 'coins') {
                profile.coins += mail.attachment.amount;
                
                await safeSendMessage(sock, responseJid, {
                    text: `*💰 Attachment Claimed:* You received ${formatNumber(mail.attachment.amount)} coins!`
                });
            } else if (mail.attachment.type === 'item') {
                // Initialize inventory if needed
                if (!profile.inventory) {
                    profile.inventory = {};
                }
                
                // Add item
                profile.inventory[mail.attachment.item] = true;
                
                await safeSendMessage(sock, responseJid, {
                    text: `*📦 Attachment Claimed:* You received a ${mail.attachment.name}!`
                });
            }
            
            // Remove attachment to prevent claiming twice
            mail.attachment = null;
            
            // Save profile
            userProfiles.set(sender, profile);
            global.mailSystem.mailboxes.set(sender, mailbox);
            
            return;
        }
        
        // Send mail
        if (args[0].toLowerCase() === 'send') {
            if (args.length < 4) {
                await safeSendText(sock, responseJid, '*⚠️ Usage:* .mail send @user "subject" message'
                );
                return;
            }
            
            // Parse target
            const targetId = args[1].replace('@', '') + '@s.whatsapp.net';
            
            // Check target profile
            const targetProfile = userProfiles.get(targetId);
            if (!targetProfile) {
                await safeSendText(sock, responseJid, '*❌ Error:* That user doesn\'t have a profile yet.'
                );
                return;
            }
            
            // Find subject (enclosed in quotes)
            let subjectMatch = args.slice(2).join(' ').match(/"([^"]+)"/);
            
            if (!subjectMatch) {
                await safeSendText(sock, responseJid, '*❌ Error:* Subject must be enclosed in quotes, e.g., "Hello there"'
                );
                return;
            }
            
            const subject = subjectMatch[1];
            
            // Get content (everything after the subject)
            const content = args.slice(2).join(' ').replace(/"([^"]+)"/, '').trim();
            
            if (!content) {
                await safeSendText(sock, responseJid, '*❌ Error:* Mail content cannot be empty.'
                );
                return;
            }
            
            // Create mail
            const mailId = ++global.mailSystem.lastMailId;
            const mail = {
                id: mailId,
                senderId: sender,
                senderName: profile.name,
                subject: subject,
                content: content,
                timestamp: Date.now(),
                read: false
            };
            
            // Initialize target mailbox if needed
            let targetMailbox = global.mailSystem.mailboxes.get(targetId) || {
                inbox: [],
                outbox: []
            };
            
            // Add to target inbox and sender outbox
            targetMailbox.inbox.push(mail);
            mailbox.outbox.push(mail);
            
            // Save mailboxes
            global.mailSystem.mailboxes.set(sender, mailbox);
            global.mailSystem.mailboxes.set(targetId, targetMailbox);
            
            await safeSendMessage(sock, sender, {
                text: `*📨 Mail Sent:* Your mail to ${targetProfile.name} has been sent!`
            });
            
            // Notify recipient
            await safeSendMessage(sock, targetId, {
                text: `*📬 New Mail:* You have received a new mail from ${profile.name}!\n\nSubject: ${subject}\n\nUse .mail to check your inbox.`
            });
            
            return;
        }
        
        // Delete mail
        if (args[0].toLowerCase() === 'delete') {
            if (args.length < 2) {
                await safeSendText(sock, responseJid, '*⚠️ Usage:* .mail delete [mail number|all]'
                );
                return;
            }
            
            if (args[1].toLowerCase() === 'all') {
                // Delete all mails
                mailbox.inbox = [];
                
                // Save mailbox
                global.mailSystem.mailboxes.set(sender, mailbox);
                
                await safeSendText(sock, responseJid, '*🗑️ Inbox Cleared:* All mails have been deleted.'
                );
                return;
            }
            
            const mailNumber = parseInt(args[1]);
            
            if (isNaN(mailNumber) || mailNumber < 1 || mailNumber > mailbox.inbox.length) {
                await safeSendText(sock, responseJid, '*❌ Error:* Invalid mail number.'
                );
                return;
            }
            
            // Delete the mail
            mailbox.inbox.splice(mailNumber - 1, 1);
            
            // Save mailbox
            global.mailSystem.mailboxes.set(sender, mailbox);
            
            await safeSendText(sock, responseJid, '*🗑️ Mail Deleted:* The mail has been deleted.'
            );
            return;
        }
        
        // Unknown command
        await safeSendText(sock, responseJid, '*⚠️ Usage:* .mail [inbox|read|claim|send|delete]'
        );
    },
    
    // 7. Daily Reward System
    async reward(sock, sender, args = [], message = {}) {
        // Get the user's JID from the sender object - handle both string and object formats
        let userJid;
        if (typeof sender === 'string') {
            userJid = sender;
        } else if (typeof sender === 'object') {
            userJid = sender.jid || (sender.participant ? sender.participant.replace(/:[^:]*$/, '') : null);
        }
        
        // Extract message metadata for debugging
        console.log(`[DEBUG] Reward command: sender type=${typeof sender}, message type=${typeof message}`);
        if (typeof sender === 'object') console.log(`[DEBUG] Sender keys: ${Object.keys(sender).join(', ')}`);
        if (typeof message === 'object') console.log(`[DEBUG] Message keys: ${Object.keys(message).join(', ')}`);
        
        // Get the group JID if the command was used in a group
        let groupJid = null;
        if (message && message.key && message.key.remoteJid && message.key.remoteJid.includes('@g.us')) {
            groupJid = message.key.remoteJid;
        }
        
        // Get response JID - where to send the response
        const responseJid = groupJid || userJid;
        
        console.log(`[DAILY REWARD DEBUG] User: ${userJid}, Group: ${groupJid}, Response: ${responseJid}`);
        
        // Get user profile from the database
        const profile = userDatabase.getUserProfile(userJid);
        
        // Check if user is registered
        if (!profile) {
            await safeSendText(sock, responseJid, '*❌ Error:* You need to register first! Use .register to create a profile.', 
                { priority: true });
            return;
        }
        
        // Check if rewards are available
        const now = Date.now();
        const lastReward = profile.lastReward || 0;
        const cooldown = 24 * 60 * 60 * 1000; // 24 hours in ms
        
        if (now - lastReward < cooldown) {
            const timeLeft = Math.ceil((lastReward + cooldown - now) / (1000 * 60 * 60));
            await safeSendMessage(sock, responseJid, {
                text: `*⏳ Cooldown:* You've already claimed your daily reward! Try again in ${timeLeft} hours.`
            });
            return;
        }
        
        // Get or initialize streak data
        let streak = streakData.get(userJid) || {
            count: 0,
            lastClaim: 0
        };
        
        // Check if streak continues (within 48 hours of last claim)
        const streakContinues = (now - streak.lastClaim) < (48 * 60 * 60 * 1000);
        
        if (streakContinues) {
            streak.count++;
        } else {
            streak.count = 1; // Reset streak
        }
        
        streak.lastClaim = now;
        
        // Base reward
        let reward = 1000;
        
        // Bonus for streak
        const streakBonus = Math.min(streak.count * 100, 2000); // Max 2000 bonus
        reward += streakBonus;
        
        // Update profile
        profile.coins += reward;
        profile.lastReward = now;
        
        // Checkin tracking
        let checkin = checkinData.get(userJid) || {
            count: 0,
            lastMonth: null
        };
        
        const currentMonth = new Date().getMonth();
        if (checkin.lastMonth !== currentMonth) {
            checkin.count = 1;
            checkin.lastMonth = currentMonth;
        } else {
            checkin.count++;
        }
        
        // Additional rewards for milestone streaks
        let milestoneReward = 0;
        let milestoneMessage = '';
        
        if (streak.count === 7) {
            milestoneReward = 3000;
            milestoneMessage = 'Week Complete! +3,000 coins bonus';
        } else if (streak.count === 30) {
            milestoneReward = 15000;
            milestoneMessage = 'Month Complete! +15,000 coins bonus';
        } else if (streak.count % 100 === 0) {
            milestoneReward = 50000;
            milestoneMessage = `${streak.count} Day Streak! +50,000 coins bonus`;
        }
        
        if (milestoneReward > 0) {
            profile.coins += milestoneReward;
            reward += milestoneReward;
        }
        
        // Save data
        streakData.set(userJid, streak);
        checkinData.set(userJid, checkin);
        
        // Save profile using the userDatabase
        userProfiles.set(userJid, profile);
        
        // Debug log
        console.log(`[DEBUG] Reward saved for user ${userJid}`);
        
        // Send reward message
        let rewardText = `*🎁 Daily Reward Claimed!*\n\n`;
        rewardText += `Base Reward: ${formatNumber(1000)} coins\n`;
        rewardText += `Streak Bonus: ${formatNumber(streakBonus)} coins\n`;
        if (milestoneMessage) {
            rewardText += `${milestoneMessage}: ${formatNumber(milestoneReward)} coins\n`;
        }
        rewardText += `Total Reward: ${formatNumber(reward)} coins\n\n`;
        rewardText += `Current Streak: ${streak.count} day${streak.count !== 1 ? 's' : ''}\n`;
        rewardText += `Monthly Check-ins: ${checkin.count} day${checkin.count !== 1 ? 's' : ''}\n\n`;
        rewardText += `Your Balance: ${formatNumber(profile.coins)} coins`;
        
        // Send reward message to the response JID (group or user)
        await safeSendText(sock, responseJid, rewardText, { priority: true });
    },
    
    // 8. Passive Income with Idle Game Mechanics
    async business(sock, sender, args, message = {}) {
        // Get the user's JID
        let userJid;
        if (typeof sender === 'string') {
            userJid = sender;
        } else if (typeof sender === 'object') {
            userJid = sender.jid || (sender.participant ? sender.participant.replace(/:[^:]*$/, '') : null);
        }
        
        // Get the group JID if the command was used in a group
        let groupJid = null;
        if (message && message.key && message.key.remoteJid && message.key.remoteJid.includes('@g.us')) {
            groupJid = message.key.remoteJid;
        }
        
        // Get response JID - where to send the response
        const responseJid = groupJid || userJid;
        
        const profile = await getUserProfile(sock, userJid);
        if (!profile) return;
        
        // Initialize business data if needed
        if (!profile.business) {
            profile.business = {
                level: 0,
                lastCollected: Date.now(),
                totalProfit: 0,
                automated: false
            };
        }
        
        // Business stats
        const businessInfo = {
            baseProduction: 50, // Base production per hour
            upgradeMultiplier: 1.5, // Production multiplier per level
            upgradeBaseCost: 5000, // Base cost for first upgrade
            upgradeCostMultiplier: 2.2 // Cost multiplier per level
        };
        
        // Showing business info
        if (args.length === 0) {
            if (profile.business.level === 0) {
                await safeSendText(sock, responseJid, '*🏭 Business:* You don\'t have a business yet. Use .business start to set up a business for 5,000 coins.'
                );
                return;
            }
            
            // Calculate uncollected income
            const hoursPassed = Math.max(0, (Date.now() - profile.business.lastCollected) / (1000 * 60 * 60));
            const hourlyIncome = businessInfo.baseProduction * Math.pow(businessInfo.upgradeMultiplier, profile.business.level - 1);
            let pendingIncome = Math.floor(hourlyIncome * hoursPassed);
            
            // Cap at 24 hours if not automated
            if (!profile.business.automated && hoursPassed > 24) {
                pendingIncome = Math.floor(hourlyIncome * 24);
            }
            
            // Calculate upgrade cost
            const upgradeCost = Math.floor(businessInfo.upgradeBaseCost * Math.pow(businessInfo.upgradeCostMultiplier, profile.business.level));
            
            let businessText = '*🏭 Your Business:*\n\n';
            businessText += `Level: ${profile.business.level}\n`;
            businessText += `Hourly Income: ${formatNumber(Math.floor(hourlyIncome))} coins\n`;
            businessText += `Uncollected: ${formatNumber(pendingIncome)} coins\n`;
            businessText += `Total Profit: ${formatNumber(profile.business.totalProfit)} coins\n`;
            businessText += `Status: ${profile.business.automated ? 'Automated' : 'Manual'}\n\n`;
            businessText += `Upgrade Cost: ${formatNumber(upgradeCost)} coins\n\n`;
            businessText += 'Commands:\n';
            businessText += '.business collect - Collect earnings\n';
            businessText += '.business upgrade - Upgrade your business\n';
            businessText += '.business automate - Make collection automatic (50,000 coins)';
            
            await safeSendText(sock, responseJid, businessText );
            return;
        }
        
        // Starting a business
        if (args[0].toLowerCase() === 'start') {
            if (profile.business.level > 0) {
                await safeSendText(sock, responseJid, '*❌ Error:* You already have a business! Use .business to see your stats.'
                );
                return;
            }
            
            const startupCost = businessInfo.upgradeBaseCost;
            
            if (profile.coins < startupCost) {
                await safeSendMessage(sock, responseJid, {
                    text: `*❌ Error:* You need ${formatNumber(startupCost)} coins to start a business. You have ${formatNumber(profile.coins)} coins.`
                });
                return;
            }
            
            // Deduct startup cost
            profile.coins -= startupCost;
            
            // Create business
            profile.business = {
                level: 1,
                lastCollected: Date.now(),
                totalProfit: 0,
                automated: false
            };
            
            // Save profile
            userProfiles.set(sender, profile);
            
            await safeSendMessage(sock, responseJid, {
                text: `*🏭 Business Started:* You've invested ${formatNumber(startupCost)} coins to start your own business!\n\nUse .business to view your business and .business collect to collect earnings.`
            });
            return;
        }
        
        // Make sure they have a business for other commands
        if (profile.business.level === 0) {
            await safeSendText(sock, responseJid, '*❌ Error:* You don\'t have a business yet. Use .business start to set up a business.'
            );
            return;
        }
        
        // Collecting earnings
        if (args[0].toLowerCase() === 'collect') {
            // Calculate uncollected income
            const hoursPassed = Math.max(0, (Date.now() - profile.business.lastCollected) / (1000 * 60 * 60));
            const hourlyIncome = businessInfo.baseProduction * Math.pow(businessInfo.upgradeMultiplier, profile.business.level - 1);
            let pendingIncome = Math.floor(hourlyIncome * hoursPassed);
            
            // Cap at 24 hours if not automated
            if (!profile.business.automated && hoursPassed > 24) {
                pendingIncome = Math.floor(hourlyIncome * 24);
            }
            
            if (pendingIncome <= 0) {
                await safeSendText(sock, responseJid, '*❌ Error:* There are no earnings to collect yet. Wait a bit longer.'
                );
                return;
            }
            
            // Add income
            profile.coins += pendingIncome;
            profile.business.totalProfit += pendingIncome;
            profile.business.lastCollected = Date.now();
            
            // Save profile
            userProfiles.set(sender, profile);
            
            await safeSendMessage(sock, responseJid, {
                text: `*💰 Earnings Collected:* You collected ${formatNumber(pendingIncome)} coins from your business!\n\nTotal Profit: ${formatNumber(profile.business.totalProfit)} coins\nCurrent Balance: ${formatNumber(profile.coins)} coins`
            });
            return;
        }
        
        // Upgrading business
        if (args[0].toLowerCase() === 'upgrade') {
            const upgradeCost = Math.floor(businessInfo.upgradeBaseCost * Math.pow(businessInfo.upgradeCostMultiplier, profile.business.level));
            
            if (profile.coins < upgradeCost) {
                await safeSendMessage(sock, responseJid, {
                    text: `*❌ Error:* You need ${formatNumber(upgradeCost)} coins to upgrade your business. You have ${formatNumber(profile.coins)} coins.`
                });
                return;
            }
            
            // Deduct upgrade cost
            profile.coins -= upgradeCost;
            
            // Upgrade business
            profile.business.level++;
            
            // Calculate new hourly income
            const newHourlyIncome = businessInfo.baseProduction * Math.pow(businessInfo.upgradeMultiplier, profile.business.level - 1);
            
            // Save profile
            userProfiles.set(sender, profile);
            
            await safeSendMessage(sock, responseJid, {
                text: `*🏭 Business Upgraded:* You spent ${formatNumber(upgradeCost)} coins to upgrade your business to level ${profile.business.level}!\n\nNew Hourly Income: ${formatNumber(Math.floor(newHourlyIncome))} coins`
            });
            return;
        }
        
        // Automating business
        if (args[0].toLowerCase() === 'automate') {
            if (profile.business.automated) {
                await safeSendText(sock, responseJid, '*❌ Error:* Your business is already automated!'
                );
                return;
            }
            
            const automationCost = 50000;
            
            if (profile.coins < automationCost) {
                await safeSendMessage(sock, responseJid, {
                    text: `*❌ Error:* You need ${formatNumber(automationCost)} coins to automate your business. You have ${formatNumber(profile.coins)} coins.`
                });
                return;
            }
            
            // Deduct automation cost
            profile.coins -= automationCost;
            
            // Automate business
            profile.business.automated = true;
            
            // Save profile
            userProfiles.set(sender, profile);
            
            await safeSendMessage(sock, responseJid, {
                text: `*🤖 Business Automated:* You spent ${formatNumber(automationCost)} coins to fully automate your business!\n\nYour business will now continue to generate income beyond the 24-hour limit, and earnings will be automatically collected when you check your business status.`
            });
            return;
        }
        
        // Unknown command
        await safeSendText(sock, responseJid, '*⚠️ Usage:* .business [start|collect|upgrade|automate]'
        );
    },
    
    // 9. Bounty hunting system
    async bounty(sock, sender, args, isGroup, msgData) {
        const profile = await getUserProfile(sock, sender);
        if (!profile) return;
        
        // Get proper response JID (group or sender)
        const responseJid = isGroup ? msgData.key.remoteJid : sender;
        
        // Initialize global bounty system if needed
        global.bountySystem = global.bountySystem || {
            activeBounties: [],
            completedBounties: [],
            lastBountyId: 0
        };
        
        // Initialize profile bounty data
        if (!profile.bounties) {
            profile.bounties = {
                completed: 0,
                earnings: 0,
                cooldown: 0
            };
        }
        
        // Helper function to create random bounties
        function generateBounty() {
            const bountyTypes = [
                { name: 'Wolf Pack', difficulty: 'easy', reward: 500, exp: 50 },
                { name: 'Bandit Camp', difficulty: 'easy', reward: 800, exp: 80 },
                { name: 'Goblin Raid', difficulty: 'medium', reward: 1500, exp: 150 },
                { name: 'Orc Warband', difficulty: 'medium', reward: 2000, exp: 200 },
                { name: 'Dragon Sighting', difficulty: 'hard', reward: 5000, exp: 500 },
                { name: 'Demon Summoning', difficulty: 'hard', reward: 8000, exp: 800 },
                { name: 'Witch Coven', difficulty: 'medium', reward: 3000, exp: 300 },
                { name: 'Giant Spider', difficulty: 'medium', reward: 2500, exp: 250 },
                { name: 'Undead Uprising', difficulty: 'hard', reward: 6000, exp: 600 },
                { name: 'Cursed Treasure', difficulty: 'hard', reward: 7000, exp: 700 }
            ];
            
            // Select random bounty type
            const bountyType = bountyTypes[Math.floor(Math.random() * bountyTypes.length)];
            
            // Random variation in reward
            const rewardVariation = Math.random() * 0.4 - 0.2; // -20% to +20%
            const finalReward = Math.floor(bountyType.reward * (1 + rewardVariation));
            const finalExp = Math.floor(bountyType.exp * (1 + rewardVariation));
            
            // Create bounty
            return {
                id: ++global.bountySystem.lastBountyId,
                name: bountyType.name,
                difficulty: bountyType.difficulty,
                reward: finalReward,
                exp: finalExp,
                timestamp: Date.now(),
                expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hour expiration
            };
        }
        
        // Refresh bounties - remove expired ones and add new ones
        function refreshBounties() {
            const now = Date.now();
            
            // Remove expired bounties
            global.bountySystem.activeBounties = global.bountySystem.activeBounties.filter(
                bounty => bounty.expires > now
            );
            
            // Add new bounties if less than 5 active
            while (global.bountySystem.activeBounties.length < 5) {
                global.bountySystem.activeBounties.push(generateBounty());
            }
        }
        
        // View active bounties
        if (args.length === 0 || args[0].toLowerCase() === 'list') {
            refreshBounties();
            
            let bountyText = '*🎯 Active Bounties:*\n\n';
            
            if (global.bountySystem.activeBounties.length === 0) {
                bountyText += 'No active bounties available.';
            } else {
                for (const bounty of global.bountySystem.activeBounties) {
                    const timeLeft = Math.ceil((bounty.expires - Date.now()) / (1000 * 60 * 60));
                    
                    bountyText += `*${bounty.name}* (#${bounty.id})\n`;
                    bountyText += `Difficulty: ${bounty.difficulty}\n`;
                    bountyText += `Reward: ${formatNumber(bounty.reward)} coins, ${bounty.exp} XP\n`;
                    bountyText += `Expires in: ${timeLeft} hour${timeLeft !== 1 ? 's' : ''}\n\n`;
                }
            }
            
            bountyText += 'Use .bounty hunt [id] to accept a bounty.';
            
            await safeSendText(sock, responseJid, bountyText );
            return;
        }
        
        // Hunt/complete a bounty
        if (args[0].toLowerCase() === 'hunt') {
            if (args.length < 2) {
                await safeSendText(sock, responseJid, '*⚠️ Usage:* .bounty hunt [bounty id]'
                );
                return;
            }
            
            // Check cooldown
            const cooldownTime = profile.bounties.cooldown;
            if (cooldownTime > Date.now()) {
                const timeLeft = Math.ceil((cooldownTime - Date.now()) / (1000 * 60));
                await safeSendMessage(sock, responseJid, {
                    text: `*⏳ Cooldown:* You need to rest before taking another bounty. Try again in ${timeLeft} minutes.`
                });
                return;
            }
            
            // Find the bounty
            const bountyId = parseInt(args[1]);
            refreshBounties();
            
            const bounty = global.bountySystem.activeBounties.find(b => b.id === bountyId);
            
            if (!bounty) {
                await safeSendText(sock, responseJid, '*❌ Error:* Bounty not found or expired. Use .bounty list to see active bounties.'
                );
                return;
            }
            
            // Success rate based on difficulty and level
            let successRate;
            
            switch(bounty.difficulty) {
                case 'easy':
                    successRate = 80 + (profile.level * 1); // 80% + 1% per level
                    break;
                case 'medium':
                    successRate = 60 + (profile.level * 1.5); // 60% + 1.5% per level
                    break;
                case 'hard':
                    successRate = 40 + (profile.level * 2); // 40% + 2% per level
                    break;
                default:
                    successRate = 70;
            }
            
            // Cap success rate at 95%
            successRate = Math.min(successRate, 95);
            
            // Roll for success
            const success = Math.random() * 100 <= successRate;
            
            // Remove bounty from active list
            global.bountySystem.activeBounties = global.bountySystem.activeBounties.filter(
                b => b.id !== bountyId
            );
            
            // Set cooldown - longer for harder difficulties
            let cooldownMinutes;
            switch(bounty.difficulty) {
                case 'easy': cooldownMinutes = 30; break;
                case 'medium': cooldownMinutes = 60; break;
                case 'hard': cooldownMinutes = 120; break;
                default: cooldownMinutes = 45;
            }
            
            profile.bounties.cooldown = Date.now() + (cooldownMinutes * 60 * 1000);
            
            if (success) {
                // Add to completed bounties
                global.bountySystem.completedBounties.push({
                    ...bounty,
                    completedBy: sender,
                    completedAt: Date.now()
                });
                
                // Update profile
                profile.coins += bounty.reward;
                profile.xp += bounty.exp;
                profile.bounties.completed++;
                profile.bounties.earnings += bounty.reward;
                
                // Add new random bounty
                global.bountySystem.activeBounties.push(generateBounty());
                
                await safeSendMessage(sock, responseJid, {
                    text: `*🎯 Bounty Completed:* You successfully completed the ${bounty.name} bounty!\n\nReward: ${formatNumber(bounty.reward)} coins\nXP Gained: ${bounty.exp}\n\nYour Balance: ${formatNumber(profile.coins)} coins\nCooldown: ${cooldownMinutes} minutes`
                });
            } else {
                // Failed attempt
                await safeSendMessage(sock, responseJid, {
                    text: `*❌ Bounty Failed:* You were unable to complete the ${bounty.name} bounty.\n\nThe bounty was too challenging. Try an easier one next time.\n\nCooldown: ${cooldownMinutes} minutes`
                });
            }
            
            // Save profile
            userProfiles.set(sender, profile);
            return;
        }
        
        // View bounty stats
        if (args[0].toLowerCase() === 'stats') {
            const completed = profile.bounties.completed || 0;
            const earnings = profile.bounties.earnings || 0;
            
            let statsText = '*🎯 Your Bounty Hunter Stats:*\n\n';
            statsText += `Bounties Completed: ${completed}\n`;
            statsText += `Total Earnings: ${formatNumber(earnings)} coins\n`;
            
            if (completed >= 50) {
                statsText += `\nRank: Master Bounty Hunter`;
            } else if (completed >= 25) {
                statsText += `\nRank: Expert Bounty Hunter`;
            } else if (completed >= 10) {
                statsText += `\nRank: Seasoned Bounty Hunter`;
            } else if (completed >= 5) {
                statsText += `\nRank: Regular Bounty Hunter`;
            } else {
                statsText += `\nRank: Novice Bounty Hunter`;
            }
            
            await safeSendText(sock, responseJid, statsText );
            return;
        }
        
        // Unknown command
        await safeSendText(sock, responseJid, '*⚠️ Usage:* .bounty [list|hunt|stats]'
        );
    },
    
    // 10. Clans/guilds system
    async clan(sock, sender, args, isGroup, msgData) {
        const profile = await getUserProfile(sock, sender);
        if (!profile) return;
        
        // Get proper response JID (group or sender)
        const responseJid = isGroup ? msgData.key.remoteJid : sender;
        
        // Initialize global clan system if needed
        global.clanSystem = global.clanSystem || {
            clans: new Map()
        };
        
        // View current clan or clan list
        if (args.length === 0 || args[0].toLowerCase() === 'list') {
            // Check if user is in a clan
            let userClan = null;
            let userRole = null;
            
            for (const [clanName, clan] of global.clanSystem.clans.entries()) {
                if (clan.leader === sender) {
                    userClan = clan;
                    userRole = 'leader';
                    break;
                } else if (clan.officers.includes(sender)) {
                    userClan = clan;
                    userRole = 'officer';
                    break;
                } else if (clan.members.includes(sender)) {
                    userClan = clan;
                    userRole = 'member';
                    break;
                }
            }
            
            if (userClan && args.length === 0) {
                // Display user's clan info
                let clanText = `*👥 Clan: ${userClan.name}*\n\n`;
                clanText += `Level: ${userClan.level}\n`;
                clanText += `Members: ${userClan.members.length + userClan.officers.length + 1}/50\n`;
                clanText += `Your Role: ${userRole.charAt(0).toUpperCase() + userRole.slice(1)}\n\n`;
                
                // Show leader
                const leaderProfile = userProfiles.get(userClan.leader);
                clanText += `Leader: ${leaderProfile ? leaderProfile.name : 'Unknown'}\n\n`;
                
                // Show officers
                if (userClan.officers.length > 0) {
                    clanText += `*Officers:*\n`;
                    for (const officerId of userClan.officers) {
                        const officerProfile = userProfiles.get(officerId);
                        clanText += `- ${officerProfile ? officerProfile.name : 'Unknown'}\n`;
                    }
                    clanText += '\n';
                }
                
                // Show description
                if (userClan.description) {
                    clanText += `*Description:*\n${userClan.description}\n\n`;
                }
                
                clanText += 'Commands:\n.clan chat [message] - Send message to clan\n.clan leave - Leave your clan';
                
                if (userRole === 'leader' || userRole === 'officer') {
                    clanText += '\n.clan invite @user - Invite a user\n.clan kick @user - Remove a member';
                }
                
                if (userRole === 'leader') {
                    clanText += '\n.clan promote @user - Promote to officer\n.clan demote @user - Demote an officer\n.clan setdesc [text] - Set clan description';
                }
                
                await safeSendText(sock, responseJid, clanText );
                return;
            } else if (args[0]?.toLowerCase() === 'list') {
                // Show list of all clans
                if (global.clanSystem.clans.size === 0) {
                    await safeSendText(sock, responseJid, '*👥 Clans:* No clans have been created yet. Use .clan create [name] to create one!'
                    );
                    return;
                }
                
                let clanListText = '*👥 Active Clans:*\n\n';
                
                for (const [clanName, clan] of global.clanSystem.clans.entries()) {
                    const memberCount = clan.members.length + clan.officers.length + 1;
                    const leaderProfile = userProfiles.get(clan.leader);
                    
                    clanListText += `*${clanName}*\n`;
                    clanListText += `Level: ${clan.level}\n`;
                    clanListText += `Members: ${memberCount}/50\n`;
                    clanListText += `Leader: ${leaderProfile ? leaderProfile.name : 'Unknown'}\n\n`;
                }
                
                clanListText += 'Use .clan join [name] to join a clan or .clan create [name] to create your own.';
                
                await safeSendText(sock, responseJid, clanListText );
                return;
            } else {
                // User not in a clan
                await safeSendText(sock, responseJid, '*👥 Clan:* You are not in a clan.\n\nUse .clan list to see available clans, .clan join [name] to join one, or .clan create [name] to create your own.'
                );
                return;
            }
        }
        
        // Create a new clan
        if (args[0].toLowerCase() === 'create') {
            if (args.length < 2) {
                await safeSendText(sock, responseJid, '*⚠️ Usage:* .clan create [name]'
                );
                return;
            }
            
            // Check if user is already in a clan
            for (const [clanName, clan] of global.clanSystem.clans.entries()) {
                if (clan.leader === sender || clan.officers.includes(sender) || clan.members.includes(sender)) {
                    await safeSendText(sock, sender, '*❌ Error:* You are already in a clan. Leave your current clan first with .clan leave.'
                    );
                    return;
                }
            }
            
            // Check if clan name already exists
            const clanName = args.slice(1).join(' ');
            
            if (clanName.length > 20) {
                await safeSendText(sock, sender, '*❌ Error:* Clan name must be 20 characters or less.'
                );
                return;
            }
            
            if (global.clanSystem.clans.has(clanName.toLowerCase())) {
                await safeSendText(sock, sender, '*❌ Error:* A clan with this name already exists. Choose a different name.'
                );
                return;
            }
            
            // Check if player has enough coins
            const creationCost = 10000;
            
            if (profile.coins < creationCost) {
                await safeSendMessage(sock, sender, {
                    text: `*❌ Error:* You need ${formatNumber(creationCost)} coins to create a clan. You have ${formatNumber(profile.coins)} coins.`
                });
                return;
            }
            
            // Deduct creation cost
            profile.coins -= creationCost;
            
            // Create clan
            const newClan = {
                name: clanName,
                leader: sender,
                officers: [],
                members: [],
                level: 1,
                treasury: 0,
                description: '',
                createdAt: Date.now()
            };
            
            global.clanSystem.clans.set(clanName.toLowerCase(), newClan);
            
            // Save profile
            userProfiles.set(sender, profile);
            
            await safeSendMessage(sock, sender, {
                text: `*👥 Clan Created:* You've successfully created the clan "${clanName}"!\n\nYou are the clan leader. Use .clan setdesc [text] to set a description and .clan invite @user to invite members.`
            });
            return;
        }
        
        // Join a clan
        if (args[0].toLowerCase() === 'join') {
            if (args.length < 2) {
                await safeSendText(sock, responseJid, '*⚠️ Usage:* .clan join [name]'
                );
                return;
            }
            
            // Check if user is already in a clan
            for (const [clanName, clan] of global.clanSystem.clans.entries()) {
                if (clan.leader === sender || clan.officers.includes(sender) || clan.members.includes(sender)) {
                    await safeSendText(sock, sender, '*❌ Error:* You are already in a clan. Leave your current clan first with .clan leave.'
                    );
                    return;
                }
            }
            
            // Find clan
            const clanName = args.slice(1).join(' ').toLowerCase();
            const clan = global.clanSystem.clans.get(clanName);
            
            if (!clan) {
                await safeSendText(sock, sender, '*❌ Error:* Clan not found. Use .clan list to see available clans.'
                );
                return;
            }
            
            // Check if clan is full
            const memberCount = clan.members.length + clan.officers.length + 1;
            if (memberCount >= 50) {
                await safeSendText(sock, sender, '*❌ Error:* This clan is already at maximum capacity (50 members).'
                );
                return;
            }
            
            // Join the clan
            clan.members.push(sender);
            
            // Notify leader
            await safeSendMessage(sock, clan.leader, {
                text: `*👥 Clan Update:* ${profile.name} has joined your clan!`
            });
            
            await safeSendMessage(sock, sender, {
                text: `*👥 Clan Joined:* You have successfully joined the clan "${clan.name}"!`
            });
            return;
        }
        
        // Leave current clan
        if (args[0].toLowerCase() === 'leave') {
            let userClan = null;
            let userRole = null;
            let clanName = null;
            
            for (const [name, clan] of global.clanSystem.clans.entries()) {
                if (clan.leader === sender) {
                    userClan = clan;
                    userRole = 'leader';
                    clanName = name;
                    break;
                } else if (clan.officers.includes(sender)) {
                    userClan = clan;
                    userRole = 'officer';
                    clanName = name;
                    break;
                } else if (clan.members.includes(sender)) {
                    userClan = clan;
                    userRole = 'member';
                    clanName = name;
                    break;
                }
            }
            
            if (!userClan) {
                await safeSendText(sock, sender, '*❌ Error:* You are not in a clan.'
                );
                return;
            }
            
            if (userRole === 'leader') {
                // Leader is leaving - disband the clan or transfer leadership
                if (userClan.officers.length > 0) {
                    // Transfer to first officer
                    const newLeaderId = userClan.officers[0];
                    userClan.leader = newLeaderId;
                    userClan.officers.splice(0, 1);
                    
                    // Notify new leader
                    const newLeaderProfile = userProfiles.get(newLeaderId);
                    await safeSendMessage(sock, newLeaderId, {
                        text: `*👑 Leadership Transferred:* ${profile.name} has left the clan and transferred leadership to you!`
                    });
                    
                    await safeSendMessage(sock, sender, {
                        text: `*👥 Clan Left:* You have left the clan "${userClan.name}" and transferred leadership to ${newLeaderProfile ? newLeaderProfile.name : 'another member'}.`
                    });
                } else if (userClan.members.length > 0) {
                    // Transfer to first member
                    const newLeaderId = userClan.members[0];
                    userClan.leader = newLeaderId;
                    userClan.members.splice(0, 1);
                    
                    // Notify new leader
                    const newLeaderProfile = userProfiles.get(newLeaderId);
                    await safeSendMessage(sock, newLeaderId, {
                        text: `*👑 Leadership Transferred:* ${profile.name} has left the clan and transferred leadership to you!`
                    });
                    
                    await safeSendMessage(sock, sender, {
                        text: `*👥 Clan Left:* You have left the clan "${userClan.name}" and transferred leadership to ${newLeaderProfile ? newLeaderProfile.name : 'another member'}.`
                    });
                } else {
                    // No other members, disband the clan
                    global.clanSystem.clans.delete(clanName);
                    
                    await safeSendMessage(sock, sender, {
                        text: `*👥 Clan Disbanded:* As you were the only member, the clan "${userClan.name}" has been disbanded.`
                    });
                }
            } else if (userRole === 'officer') {
                // Remove from officers
                userClan.officers = userClan.officers.filter(id => id !== sender);
                
                // Notify leader
                await safeSendMessage(sock, userClan.leader, {
                    text: `*👥 Clan Update:* ${profile.name}, an officer, has left your clan.`
                });
                
                await safeSendMessage(sock, sender, {
                    text: `*👥 Clan Left:* You have left the clan "${userClan.name}".`
                });
            } else {
                // Remove from members
                userClan.members = userClan.members.filter(id => id !== sender);
                
                // Notify leader
                await safeSendMessage(sock, userClan.leader, {
                    text: `*👥 Clan Update:* ${profile.name} has left your clan.`
                });
                
                await safeSendMessage(sock, sender, {
                    text: `*👥 Clan Left:* You have left the clan "${userClan.name}".`
                });
            }
            
            return;
        }
        
        // Check if user is in a clan for other commands
        let userClan = null;
        let userRole = null;
        let clanName = null;
        
        for (const [name, clan] of global.clanSystem.clans.entries()) {
            if (clan.leader === sender) {
                userClan = clan;
                userRole = 'leader';
                clanName = name;
                break;
            } else if (clan.officers.includes(sender)) {
                userClan = clan;
                userRole = 'officer';
                clanName = name;
                break;
            } else if (clan.members.includes(sender)) {
                userClan = clan;
                userRole = 'member';
                clanName = name;
                break;
            }
        }
        
        if (!userClan) {
            await safeSendText(sock, sender, '*❌ Error:* You are not in a clan. Use .clan list to see available clans or .clan create to create one.'
            );
            return;
        }
        
        // Clan chat
        if (args[0].toLowerCase() === 'chat') {
            if (args.length < 2) {
                await safeSendText(sock, sender, '*⚠️ Usage:* .clan chat [message]'
                );
                return;
            }
            
            const message = args.slice(1).join(' ');
            
            // Send message to all clan members
            const chatMessage = `*👥 [${userClan.name} Clan Chat]*\n${profile.name}: ${message}`;
            
            // Send to leader
            if (userClan.leader !== sender) {
                await safeSendText(sock, userClan.leader, chatMessage );
            }
            
            // Send to officers
            for (const officerId of userClan.officers) {
                if (officerId !== sender) {
                    await safeSendText(sock, officerId, chatMessage );
                }
            }
            
            // Send to members
            for (const memberId of userClan.members) {
                if (memberId !== sender) {
                    await safeSendText(sock, memberId, chatMessage );
                }
            }
            
            // Confirmation to sender
            await safeSendText(sock, sender, `*👥 Message Sent:* Your message has been sent to all clan members.`
            );
            return;
        }
        
        // Leader/officer commands
        if (userRole !== 'leader' && userRole !== 'officer') {
            await safeSendText(sock, sender, '*❌ Error:* You must be a clan leader or officer to use this command.'
            );
            return;
        }
        
        // Invite a user
        if (args[0].toLowerCase() === 'invite') {
            if (args.length < 2) {
                await safeSendText(sock, sender, '*⚠️ Usage:* .clan invite @user'
                );
                return;
            }
            
            const targetId = args[1].replace('@', '') + '@s.whatsapp.net';
            
            // Check if target has a profile
            const targetProfile = userProfiles.get(targetId);
            if (!targetProfile) {
                await safeSendText(sock, sender, '*❌ Error:* That user doesn\'t have a profile yet.'
                );
                return;
            }
            
            // Check if clan is full
            const memberCount = userClan.members.length + userClan.officers.length + 1;
            if (memberCount >= 50) {
                await safeSendText(sock, sender, '*❌ Error:* Your clan is already at maximum capacity (50 members).'
                );
                return;
            }
            
            // Check if user is already in the clan
            if (userClan.leader === targetId || userClan.officers.includes(targetId) || userClan.members.includes(targetId)) {
                await safeSendText(sock, sender, '*❌ Error:* That user is already in your clan.'
                );
                return;
            }
            
            // Check if user is in another clan
            let targetInClan = false;
            for (const [name, clan] of global.clanSystem.clans.entries()) {
                if (clan.leader === targetId || clan.officers.includes(targetId) || clan.members.includes(targetId)) {
                    targetInClan = true;
                    break;
                }
            }
            
            if (targetInClan) {
                await safeSendText(sock, sender, '*❌ Error:* That user is already in another clan.'
                );
                return;
            }
            
            // Send invitation
            await safeSendMessage(sock, targetId, {
                text: `*👥 Clan Invitation:*\n\n${profile.name} has invited you to join the clan "${userClan.name}"!\n\nUse .clan join ${clanName} to accept the invitation.`
            });
            
            await safeSendMessage(sock, sender, {
                text: `*👥 Invitation Sent:* You've invited ${targetProfile.name} to join your clan.`
            });
            return;
        }
        
        // Kick a member
        if (args[0].toLowerCase() === 'kick') {
            if (args.length < 2) {
                await safeSendText(sock, sender, '*⚠️ Usage:* .clan kick @user'
                );
                return;
            }
            
            const targetId = args[1].replace('@', '') + '@s.whatsapp.net';
            
            // Check permissions
            if (userRole === 'officer' && userClan.leader === targetId) {
                await safeSendText(sock, sender, '*❌ Error:* You cannot kick the clan leader.'
                );
                return;
            }
            
            if (userRole === 'officer' && userClan.officers.includes(targetId)) {
                await safeSendText(sock, sender, '*❌ Error:* Officers cannot kick other officers.'
                );
                return;
            }
            
            // Check if target is in the clan
            let targetRole = null;
            if (userClan.leader === targetId) {
                targetRole = 'leader';
            } else if (userClan.officers.includes(targetId)) {
                targetRole = 'officer';
            } else if (userClan.members.includes(targetId)) {
                targetRole = 'member';
            }
            
            if (!targetRole) {
                await safeSendText(sock, sender, '*❌ Error:* That user is not in your clan.'
                );
                return;
            }
            
            // Kick the user
            if (targetRole === 'officer') {
                userClan.officers = userClan.officers.filter(id => id !== targetId);
            } else {
                userClan.members = userClan.members.filter(id => id !== targetId);
            }
            
            // Get target name
            const targetProfile = userProfiles.get(targetId);
            const targetName = targetProfile ? targetProfile.name : 'the user';
            
            // Notify target
            await safeSendMessage(sock, targetId, {
                text: `*👥 Clan Notification:* You have been removed from the clan "${userClan.name}" by ${profile.name}.`
            });
            
            await safeSendMessage(sock, sender, {
                text: `*👥 Member Removed:* You have removed ${targetName} from your clan.`
            });
            return;
        }
        
        // Leader-only commands
        if (userRole !== 'leader') {
            await safeSendText(sock, sender, '*❌ Error:* You must be the clan leader to use this command.'
            );
            return;
        }
        
        // Promote a member to officer
        if (args[0].toLowerCase() === 'promote') {
            if (args.length < 2) {
                await safeSendText(sock, sender, '*⚠️ Usage:* .clan promote @user'
                );
                return;
            }
            
            const targetId = args[1].replace('@', '') + '@s.whatsapp.net';
            
            // Check if target is a member
            if (!userClan.members.includes(targetId)) {
                await safeSendText(sock, sender, '*❌ Error:* That user is not a member of your clan or is already an officer.'
                );
                return;
            }
            
            // Promote to officer
            userClan.members = userClan.members.filter(id => id !== targetId);
            userClan.officers.push(targetId);
            
            // Get target name
            const targetProfile = userProfiles.get(targetId);
            const targetName = targetProfile ? targetProfile.name : 'the user';
            
            // Notify target
            await safeSendMessage(sock, targetId, {
                text: `*👥 Clan Promotion:* You have been promoted to officer in the clan "${userClan.name}"!`
            });
            
            await safeSendMessage(sock, sender, {
                text: `*👥 Member Promoted:* You have promoted ${targetName} to officer.`
            });
            return;
        }
        
        // Demote an officer to member
        if (args[0].toLowerCase() === 'demote') {
            if (args.length < 2) {
                await safeSendText(sock, sender, '*⚠️ Usage:* .clan demote @user'
                );
                return;
            }
            
            const targetId = args[1].replace('@', '') + '@s.whatsapp.net';
            
            // Check if target is an officer
            if (!userClan.officers.includes(targetId)) {
                await safeSendText(sock, sender, '*❌ Error:* That user is not an officer in your clan.'
                );
                return;
            }
            
            // Demote to member
            userClan.officers = userClan.officers.filter(id => id !== targetId);
            userClan.members.push(targetId);
            
            // Get target name
            const targetProfile = userProfiles.get(targetId);
            const targetName = targetProfile ? targetProfile.name : 'the user';
            
            // Notify target
            await safeSendMessage(sock, targetId, {
                text: `*👥 Clan Demotion:* You have been demoted from officer to member in the clan "${userClan.name}".`
            });
            
            await safeSendMessage(sock, sender, {
                text: `*👥 Officer Demoted:* You have demoted ${targetName} to member.`
            });
            return;
        }
        
        // Set clan description
        if (args[0].toLowerCase() === 'setdesc') {
            if (args.length < 2) {
                await safeSendText(sock, sender, '*⚠️ Usage:* .clan setdesc [description]'
                );
                return;
            }
            
            const description = args.slice(1).join(' ');
            
            if (description.length > 200) {
                await safeSendText(sock, sender, '*❌ Error:* Clan description must be 200 characters or less.'
                );
                return;
            }
            
            // Set description
            userClan.description = description;
            
            await safeSendText(sock, sender, `*👥 Description Updated:* You have updated your clan's description.`
            );
            return;
        }
        
        // Unknown command
        await safeSendText(sock, sender, '*⚠️ Usage:* .clan [list|create|join|leave|chat|invite|kick|promote|demote|setdesc]'
        );
    },
    
    category: 'user',
    // 7. Additional RPG features
    async hunt(sock, sender, args) {
        const profile = await getUserProfile(sock, sender);
        if (!profile) return;
        
        // Check cooldown (1 hour)
        const lastHunt = profile.lastHunt || 0;
        const cooldown = 60 * 60 * 1000; // 1 hour in ms
        
        if (Date.now() - lastHunt < cooldown) {
            const timeLeft = Math.ceil((lastHunt + cooldown - Date.now()) / 1000);
            await safeSendMessage(sock, sender, {
                text: `*⏳ Cooldown:* You need to rest after your last hunt! Try again in ${formatTimeRemaining(timeLeft)}.`
            });
            return;
        }
        
        // Check if user has required equipment
        if (!profile.inventory) profile.inventory = {};
        const hasSword = (profile.inventory.sword || 0) > 0;
        
        // Success rates
        let baseSuccessRate = 40; // 40% base success rate
        if (hasSword) baseSuccessRate += 20; // +20% with sword
        
        // Level bonus (1% per level, max 20%)
        const levelBonus = Math.min(profile.level, 20);
        const successRate = baseSuccessRate + levelBonus;
        
        // Determine outcome
        const success = Math.random() * 100 <= successRate;
        
        // Select animal based on weighted chances
        const totalChance = huntAnimals.reduce((sum, animal) => sum + animal.chance, 0);
        let randomValue = Math.random() * totalChance;
        let selectedAnimal = null;
        
        for (const animal of huntAnimals) {
            randomValue -= animal.chance;
            if (randomValue <= 0) {
                selectedAnimal = animal;
                break;
            }
        }
        
        // Fallback to first animal if something went wrong
        if (!selectedAnimal) selectedAnimal = huntAnimals[0];
        
        // Update profile
        profile.lastHunt = Date.now();
        
        if (success) {
            // Add rewards to inventory
            if (!profile.inventory.leather) profile.inventory.leather = 0;
            profile.inventory.leather += selectedAnimal.reward.leather;
            
            // Add coins
            profile.coins += selectedAnimal.reward.coins;
            
            // Create success message
            await safeSendMessage(sock, sender, {
                text: `*🏹 Hunt Successful!*\n\nYou successfully hunted a ${selectedAnimal.name}!\n\n*Rewards:*\n• ${selectedAnimal.reward.leather}x leather\n• ${selectedAnimal.reward.coins} coins\n\n*Current balance:* ${formatNumber(profile.coins)} coins`
            });
        } else {
            await safeSendMessage(sock, sender, {
                text: `*🏹 Hunt Failed!*\n\nYou tried to hunt a ${selectedAnimal.name}, but it escaped!\n\n*Current balance:* ${formatNumber(profile.coins)} coins`
            });
        }
        
        // Save profile
        userProfiles.set(sender, profile);
    },
    
    async farm(sock, sender, args) {
        const profile = await getUserProfile(sock, sender);
        if (!profile) return;
        
        // Initialize farm data if not exists
        if (!profile.farm) {
            profile.farm = {
                plots: 2, // Start with 2 plots
                crops: []
            };
        }
        
        // Default subcommand
        let subcommand = args.length > 0 ? args[0].toLowerCase() : 'status';
        
        // Handle different subcommands
        switch (subcommand) {
            case 'status':
                // Show farm status
                const now = Date.now();
                let farmStatus = `*🌾 Farm Status:*\n\nPlots: ${profile.farm.plots}/${profile.farm.plots} available\n\n`;
                
                if (profile.farm.crops.length === 0) {
                    farmStatus += 'No crops planted. Use .farm plant [crop] to plant seeds.';
                } else {
                    farmStatus += '*Current Crops:*\n';
                    for (let i = 0; i < profile.farm.crops.length; i++) {
                        const crop = profile.farm.crops[i];
                        const cropInfo = crops.find(c => c.name === crop.type);
                        
                        if (!cropInfo) continue;
                        
                        const plantedTime = crop.plantedAt;
                        const harvestTime = plantedTime + (cropInfo.growTime * 60 * 1000);
                        const timeRemaining = harvestTime - now;
                        
                        if (timeRemaining <= 0) {
                            farmStatus += `Plot ${i+1}: ${cropInfo.name} - ✅ Ready to harvest!\n`;
                        } else {
                            farmStatus += `Plot ${i+1}: ${cropInfo.name} - ⏳ Ready in ${formatTimeRemaining(timeRemaining/1000)}\n`;
                        }
                    }
                }
                
                await safeSendText(sock, sender, farmStatus );
                break;
                
            case 'plant':
                if (args.length < 2) {
                    let cropsList = '*Available Crops:*\n';
                    crops.forEach(crop => {
                        cropsList += `• ${crop.name} - Growth: ${crop.growTime}m, Value: ${crop.value} coins, Seed Cost: ${crop.seedCost} coins\n`;
                    });
                    
                    await safeSendMessage(sock, sender, {
                        text: `*⚠️ Usage:* .farm plant [crop name]\n\n${cropsList}`
                    });
                    return;
                }
                
                const cropName = args[1].toLowerCase();
                const cropInfo = crops.find(c => c.name.toLowerCase() === cropName);
                
                if (!cropInfo) {
                    await safeSendText(sock, sender, '*❌ Error:* Invalid crop name. Use .farm plant to see available crops.'
                    );
                    return;
                }
                
                // Check if there's an available plot
                if (profile.farm.crops.length >= profile.farm.plots) {
                    await safeSendText(sock, sender, '*❌ Error:* All plots are occupied. Harvest crops or buy more plots.'
                    );
                    return;
                }
                
                // Check if user has enough coins
                if (profile.coins < cropInfo.seedCost) {
                    await safeSendMessage(sock, sender, {
                        text: `*❌ Error:* You don't have enough coins to buy ${cropInfo.name} seeds. You need ${cropInfo.seedCost} coins.`
                    });
                    return;
                }
                
                // Plant the crop
                profile.coins -= cropInfo.seedCost;
                profile.farm.crops.push({
                    type: cropInfo.name,
                    plantedAt: Date.now()
                });
                
                await safeSendMessage(sock, sender, {
                    text: `*🌱 Crop Planted!*\n\nYou planted ${cropInfo.name} seeds.\nGrowing time: ${cropInfo.growTime} minutes\nHarvest value: ${cropInfo.value} coins\n\nCurrent balance: ${formatNumber(profile.coins)} coins`
                });
                break;
                
            case 'harvest':
                if (profile.farm.crops.length === 0) {
                    await safeSendText(sock, sender, '*❌ Error:* You don\'t have any crops to harvest.'
                    );
                    return;
                }
                
                const now2 = Date.now();
                let harvestMessage = '*🌾 Harvesting Crops:*\n\n';
                let totalValue = 0;
                let harvestedCrops = [];
                let remainingCrops = [];
                
                // Check each crop
                for (let i = 0; i < profile.farm.crops.length; i++) {
                    const crop = profile.farm.crops[i];
                    const cropInfo = crops.find(c => c.name === crop.type);
                    
                    if (!cropInfo) continue;
                    
                    const plantedTime = crop.plantedAt;
                    const harvestTime = plantedTime + (cropInfo.growTime * 60 * 1000);
                    
                    if (now2 >= harvestTime) {
                        // Crop is ready to harvest
                        harvestMessage += `Plot ${i+1}: ${cropInfo.name} - Harvested for ${cropInfo.value} coins!\n`;
                        totalValue += cropInfo.value;
                        harvestedCrops.push(i);
                    } else {
                        // Crop not ready yet
                        const timeRemaining = harvestTime - now2;
                        harvestMessage += `Plot ${i+1}: ${cropInfo.name} - Not ready yet! (${formatTimeRemaining(timeRemaining/1000)} remaining)\n`;
                        remainingCrops.push(crop);
                    }
                }
                
                if (harvestedCrops.length === 0) {
                    await safeSendText(sock, sender, '*❌ Error:* None of your crops are ready to harvest yet.'
                    );
                    return;
                }
                
                // Update profile with harvested crops and coins
                profile.coins += totalValue;
                profile.farm.crops = remainingCrops;
                
                harvestMessage += `\n*Total harvest value:* ${formatNumber(totalValue)} coins\n*Current balance:* ${formatNumber(profile.coins)} coins`;
                
                await safeSendText(sock, sender, harvestMessage
                );
                break;
                
            case 'upgrade':
                // Check price for new plot (increases with each plot)
                const basePlotPrice = 1000;
                const upgradeCost = basePlotPrice * profile.farm.plots;
                
                if (args.length < 2 || args[1].toLowerCase() !== 'confirm') {
                    await safeSendMessage(sock, sender, {
                        text: `*🌾 Farm Upgrade:*\n\nCurrent plots: ${profile.farm.plots}\nUpgrade cost: ${formatNumber(upgradeCost)} coins\n\nTo confirm, use: .farm upgrade confirm`
                    });
                    return;
                }
                
                // Check if user has enough coins
                if (profile.coins < upgradeCost) {
                    await safeSendMessage(sock, sender, {
                        text: `*❌ Error:* You don't have enough coins for this upgrade. You need ${formatNumber(upgradeCost)} coins.`
                    });
                    return;
                }
                
                // Upgrade farm
                profile.coins -= upgradeCost;
                profile.farm.plots += 1;
                
                await safeSendMessage(sock, sender, {
                    text: `*🌾 Farm Upgraded!*\n\nYou purchased a new plot of land!\nTotal plots: ${profile.farm.plots}\n\nCurrent balance: ${formatNumber(profile.coins)} coins`
                });
                break;
                
            default:
                await safeSendText(sock, sender, '*⚠️ Usage:* .farm [status|plant|harvest|upgrade]\n\n• status - View your farm\n• plant [crop] - Plant seeds\n• harvest - Harvest ready crops\n• upgrade - Buy more plots'
                );
        }
        
        // Save profile
        userProfiles.set(sender, profile);
    },
    
    async adventure(sock, sender, args) {
        const profile = await getUserProfile(sock, sender);
        if (!profile) return;
        
        // Check cooldown (3 hours)
        const lastAdventure = profile.lastAdventure || 0;
        const cooldown = 3 * 60 * 60 * 1000; // 3 hours in ms
        
        if (Date.now() - lastAdventure < cooldown) {
            const timeLeft = Math.ceil((lastAdventure + cooldown - Date.now()) / 1000);
            await safeSendMessage(sock, sender, {
                text: `*⏳ Cooldown:* You're still tired from your last adventure! Try again in ${formatTimeRemaining(timeLeft)}.`
            });
            return;
        }
        
        // Location selection
        let location;
        if (args.length === 0) {
            // Show location list if no args
            let locationList = '*🗺️ Available Adventure Locations:*\n\n';
            adventureLocations.forEach(loc => {
                locationList += `• ${loc.name} - ${loc.difficulty} difficulty\n  ${loc.description}\n\n`;
            });
            locationList += 'Use .adventure [location] to start an adventure!';
            
            await safeSendText(sock, sender, locationList );
            return;
        } else {
            const locationName = args.join(' ');
            location = adventureLocations.find(l => l.name.toLowerCase() === locationName.toLowerCase());
            
            if (!location) {
                await safeSendText(sock, sender, '*❌ Error:* Invalid location. Use .adventure to see available locations.'
                );
                return;
            }
        }
        
        // Initialize inventory if needed
        if (!profile.inventory) profile.inventory = {};
        
        // Check for required equipment based on difficulty
        let difficultyLevel = 0;
        switch (location.difficulty) {
            case 'easy': difficultyLevel = 1; break;
            case 'medium': difficultyLevel = 2; break;
            case 'hard': difficultyLevel = 3; break;
            case 'expert': difficultyLevel = 4; break;
        }
        
        // Equipment check (optional)
        const hasSword = (profile.inventory.sword || 0) > 0;
        const hasShield = (profile.inventory.shield || 0) > 0;
        
        // Base success rate adjusted by difficulty
        let baseSuccessRate = 80 - (difficultyLevel * 15); // 80%, 65%, 50%, 35%
        
        // Equipment bonuses
        if (hasSword) baseSuccessRate += 10;
        if (hasShield) baseSuccessRate += 10;
        
        // Level bonus (1% per level, max 20%)
        const levelBonus = Math.min(profile.level, 20);
        const successRate = Math.min(baseSuccessRate + levelBonus, 95); // Cap at 95%
        
        // Determine outcome
        const success = Math.random() * 100 <= successRate;
        
        // Update adventure count
        profile.adventureCount = (profile.adventureCount || 0) + 1;
        
        // Update profile
        profile.lastAdventure = Date.now();
        
        if (success) {
            // Rewards based on location
            let rewardsMessage = '';
            let totalValue = 0;
            
            // Common rewards (1-3 items)
            const commonCount = Math.floor(Math.random() * 3) + 1;
            for (let i = 0; i < commonCount; i++) {
                const reward = location.rewards.common[Math.floor(Math.random() * location.rewards.common.length)];
                const item = gameItems[reward];
                if (item) {
                    profile.inventory[reward] = (profile.inventory[reward] || 0) + 1;
                    rewardsMessage += `• 1x ${reward} (${item.description})\n`;
                    totalValue += item.value;
                }
            }
            
            // Uncommon rewards (0-2 items, 60% chance each)
            if (location.rewards.uncommon) {
                for (let i = 0; i < 2; i++) {
                    if (Math.random() < 0.6) {
                        const reward = location.rewards.uncommon[Math.floor(Math.random() * location.rewards.uncommon.length)];
                        const item = gameItems[reward];
                        if (item) {
                            profile.inventory[reward] = (profile.inventory[reward] || 0) + 1;
                            rewardsMessage += `• 1x ${reward} (${item.description})\n`;
                            totalValue += item.value;
                        }
                    }
                }
            }
            
            // Rare rewards (20% chance)
            if (location.rewards.rare && Math.random() < 0.2) {
                const reward = location.rewards.rare[Math.floor(Math.random() * location.rewards.rare.length)];
                const item = gameItems[reward];
                if (item) {
                    profile.inventory[reward] = (profile.inventory[reward] || 0) + 1;
                    rewardsMessage += `• 1x ${reward} (${item.description}) - RARE FIND!\n`;
                    totalValue += item.value;
                }
            }
            
            // Bonus coins
            const bonusCoins = Math.floor(50 * difficultyLevel * (1 + Math.random() * 0.5));
            profile.coins += bonusCoins;
            totalValue += bonusCoins;
            
            // XP reward
            const xpReward = 25 * difficultyLevel;
            profile.xp = (profile.xp || 0) + xpReward;
            
            // Create success scenario
            const successScenarios = [
                `You ventured deep into the ${location.name} and successfully navigated all dangers!`,
                `Your expedition to the ${location.name} was incredibly successful!`,
                `You explored uncharted areas of the ${location.name} and found hidden treasures!`,
                `After a challenging journey through the ${location.name}, you emerged victorious!`
            ];
            
            const scenario = successScenarios[Math.floor(Math.random() * successScenarios.length)];
            
            // Check for quest completion
            if (profile.adventureCount >= 5) {
                // Check for quest completion
                const legendaryQuest = quests.find(q => q.id === 'q5');
                if (legendaryQuest && (!profile.completedQuests || !profile.completedQuests.includes('q5'))) {
                    // Initialize completedQuests if needed
                    if (!profile.completedQuests) profile.completedQuests = [];
                    
                    // Add quest completion
                    profile.completedQuests.push('q5');
                    
                    // Add rewards
                    profile.coins += legendaryQuest.reward.coins;
                    profile.xp += legendaryQuest.reward.xp;
                    
                    // Add legendary item
                    if (legendaryQuest.reward.golden_amulet) {
                        profile.inventory.golden_amulet = (profile.inventory.golden_amulet || 0) + legendaryQuest.reward.golden_amulet;
                    }
                    
                    // Send quest completion message
                    await safeSendMessage(sock, sender, {
                        text: `*🏆 Quest Completed: ${legendaryQuest.name}!*\n\nYou have completed 5 adventures and earned:\n• ${legendaryQuest.reward.coins} coins\n• ${legendaryQuest.reward.xp} XP\n• 1x Golden Amulet (Legendary Item)`
                    });
                }
            }
            
            await safeSendMessage(sock, sender, {
                text: `*🗺️ Adventure Success!*\n\n${scenario}\n\n*Rewards:*\n${rewardsMessage}• ${bonusCoins} coins\n• ${xpReward} XP\n\n*Total value:* ${formatNumber(totalValue)} coins\n*Current balance:* ${formatNumber(profile.coins)} coins`
            });
        } else {
            // Failed adventure
            const failureScenarios = [
                `You encountered too many dangers in the ${location.name} and had to retreat!`,
                `Your expedition to the ${location.name} didn't go as planned. You barely escaped!`,
                `The ${location.name} proved too challenging this time. You'll need better preparation next time!`,
                `You were ambushed by ${location.enemies[Math.floor(Math.random() * location.enemies.length)]}s in the ${location.name} and had to flee!`
            ];
            
            const scenario = failureScenarios[Math.floor(Math.random() * failureScenarios.length)];
            
            await safeSendMessage(sock, sender, {
                text: `*🗺️ Adventure Failed!*\n\n${scenario}\n\nTry again later or choose an easier location.`
            });
        }
        
        // Save profile
        userProfiles.set(sender, profile);
    },
    
    async quest(sock, sender, args) {
        const profile = await getUserProfile(sock, sender);
        if (!profile) return;
        
        // Initialize if needed
        if (!profile.completedQuests) profile.completedQuests = [];
        if (!profile.inventory) profile.inventory = {};
        
        // List available quests
        if (args.length === 0) {
            let questList = '*📜 Available Quests:*\n\n';
            
            quests.forEach(quest => {
                const completed = profile.completedQuests.includes(quest.id);
                const statusSymbol = completed ? '✅' : '⏳';
                
                questList += `${statusSymbol} **${quest.name}** (${quest.difficulty})\n`;
                questList += `   ${quest.description}\n`;
                questList += `   Rewards: ${quest.reward.coins} coins, ${quest.reward.xp} XP`;
                
                // Add special rewards if any
                const specialRewards = Object.entries(quest.reward).filter(([key]) => !['coins', 'xp'].includes(key));
                if (specialRewards.length > 0) {
                    specialRewards.forEach(([item, amount]) => {
                        questList += `, ${amount}x ${item}`;
                    });
                }
                
                questList += '\n\n';
            });
            
            questList += 'Use .quest claim [quest_id] to claim rewards when requirements are met.';
            
            await safeSendText(sock, sender, questList );
            return;
        }
        
        // Claim quest rewards
        if (args[0].toLowerCase() === 'claim') {
            if (args.length < 2) {
                await safeSendText(sock, sender, '*⚠️ Usage:* .quest claim [quest_id]\n\nUse .quest to see available quests.'
                );
                return;
            }
            
            const questId = args[1].toLowerCase();
            const quest = quests.find(q => q.id.toLowerCase() === questId);
            
            if (!quest) {
                await safeSendText(sock, sender, '*❌ Error:* Invalid quest ID. Use .quest to see available quests.'
                );
                return;
            }
            
            // Check if already completed
            if (profile.completedQuests.includes(quest.id)) {
                await safeSendText(sock, sender, '*❌ Error:* You have already completed this quest.'
                );
                return;
            }
            
            // Check requirements
            let meetsRequirements = true;
            let missingRequirements = [];
            
            for (const [item, amount] of Object.entries(quest.requirements)) {
                if (item === 'adventure_count') {
                    if ((profile.adventureCount || 0) < amount) {
                        meetsRequirements = false;
                        missingRequirements.push(`${amount} adventures (you have ${profile.adventureCount || 0})`);
                    }
                } else {
                    const userHas = profile.inventory[item] || 0;
                    if (userHas < amount) {
                        meetsRequirements = false;
                        missingRequirements.push(`${amount}x ${item} (you have ${userHas})`);
                    }
                }
            }
            
            if (!meetsRequirements) {
                await safeSendMessage(sock, sender, {
                    text: `*❌ Quest Requirements Not Met:*\n\nYou are missing the following:\n• ${missingRequirements.join('\n• ')}`
                });
                return;
            }
            
            // Remove required items
            for (const [item, amount] of Object.entries(quest.requirements)) {
                if (item !== 'adventure_count') {
                    profile.inventory[item] -= amount;
                }
            }
            
            // Add rewards
            profile.coins += quest.reward.coins;
            profile.xp += quest.reward.xp;
            
            // Add special rewards if any
            const specialRewards = Object.entries(quest.reward).filter(([key]) => !['coins', 'xp'].includes(key));
            specialRewards.forEach(([item, amount]) => {
                profile.inventory[item] = (profile.inventory[item] || 0) + amount;
            });
            
            // Mark as completed
            profile.completedQuests.push(quest.id);
            
            // Prepare reward message
            let rewardText = `• ${quest.reward.coins} coins\n• ${quest.reward.xp} XP`;
            specialRewards.forEach(([item, amount]) => {
                const itemInfo = gameItems[item];
                const description = itemInfo ? itemInfo.description : '';
                rewardText += `\n• ${amount}x ${item}${description ? ` (${description})` : ''}`;
            });
            
            await safeSendMessage(sock, sender, {
                text: `*🏆 Quest Completed: ${quest.name}!*\n\nYou have successfully completed the quest and earned:\n${rewardText}\n\nCurrent balance: ${formatNumber(profile.coins)} coins`
            });
            
            // Save profile
            userProfiles.set(sender, profile);
        }
    },
    
    async shop(sock, sender, args) {
        const profile = await getUserProfile(sock, sender);
        if (!profile) return;
        
        // Shop items
        const shopItems = [
            { id: 'fishing_rod', price: 200, description: 'Improves fishing success rate' },
            { id: 'pickaxe', price: 250, description: 'Improves mining success rate' },
            { id: 'sword', price: 350, description: 'Useful for hunting and adventures' },
            { id: 'shield', price: 300, description: 'Protects during adventures' },
            { id: 'pet_food', price: 50, description: 'Feeds your pet and increases happiness' },
            { id: 'gift_box', price: 500, description: 'Contains random valuable items' },
            { id: 'lottery_ticket', price: 100, description: 'Try your luck with the lottery' },
            { id: 'name_card', price: 1000, description: 'Allows you to change your display name' },
            { id: 'xp_booster', price: 2000, description: 'Doubles XP gain for 24 hours' }
        ];
        
        // Default to list
        if (args.length === 0) {
            let shopList = '*🛒 Item Shop:*\n\nYour balance: ' + formatNumber(profile.coins) + ' coins\n\n';
            
            shopItems.forEach(item => {
                shopList += `• ${item.id} - ${formatNumber(item.price)} coins\n  ${item.description}\n`;
            });
            
            shopList += '\nUse .shop buy [item] to purchase an item.';
            
            await safeSendText(sock, sender, shopList );
            return;
        }
        
        // Buy command
        if (args[0].toLowerCase() === 'buy') {
            if (args.length < 2) {
                await safeSendText(sock, sender, '*⚠️ Usage:* .shop buy [item]\n\nUse .shop to see available items.'
                );
                return;
            }
            
            const itemId = args[1].toLowerCase();
            const item = shopItems.find(i => i.id.toLowerCase() === itemId);
            
            if (!item) {
                await safeSendText(sock, sender, '*❌ Error:* Invalid item. Use .shop to see available items.'
                );
                return;
            }
            
            // Check if user has enough coins
            if (profile.coins < item.price) {
                await safeSendMessage(sock, sender, {
                    text: `*❌ Error:* You don't have enough coins to buy ${item.id}. You need ${formatNumber(item.price)} coins.`
                });
                return;
            }
            
            // Initialize inventory if needed
            if (!profile.inventory) profile.inventory = {};
            
            // Special item handling
            if (item.id === 'lottery_ticket') {
                // Add to lottery participants
                if (!lotteryParticipants.has(sender)) {
                    lotteryParticipants.set(sender, 0);
                }
                
                // Increment tickets
                lotteryParticipants.set(sender, lotteryParticipants.get(sender) + 1);
                
                // Deduct coins
                profile.coins -= item.price;
                
                await safeSendMessage(sock, sender, {
                    text: `*🎟️ Lottery Ticket Purchased!*\n\nYou have purchased a lottery ticket for ${formatNumber(item.price)} coins.\n\nThe next lottery drawing will occur soon. Good luck!\n\nCurrent balance: ${formatNumber(profile.coins)} coins`
                });
            } else if (item.id === 'gift_box') {
                // Random rewards from gift box
                const possibleRewards = [
                    { name: 'gold', amount: 1, chance: 30 },
                    { name: 'iron', amount: 3, chance: 50 },
                    { name: 'stone', amount: 5, chance: 80 },
                    { name: 'wood', amount: 10, chance: 90 },
                    { name: 'diamond', amount: 1, chance: 5 },
                    { name: 'coins', amount: 500, chance: 40 }
                ];
                
                // Get 2-4 random rewards
                const rewardCount = Math.floor(Math.random() * 3) + 2;
                let rewardsText = '';
                
                for (let i = 0; i < rewardCount; i++) {
                    // Weighted random selection
                    const totalChance = possibleRewards.reduce((sum, r) => sum + r.chance, 0);
                    let randomValue = Math.random() * totalChance;
                    let selectedReward = null;
                    
                    for (const reward of possibleRewards) {
                        randomValue -= reward.chance;
                        if (randomValue <= 0) {
                            selectedReward = reward;
                            break;
                        }
                    }
                    
                    // Fallback
                    if (!selectedReward) selectedReward = possibleRewards[0];
                    
                    // Add reward
                    if (selectedReward.name === 'coins') {
                        profile.coins += selectedReward.amount;
                        rewardsText += `• ${selectedReward.amount} coins\n`;
                    } else {
                        profile.inventory[selectedReward.name] = (profile.inventory[selectedReward.name] || 0) + selectedReward.amount;
                        rewardsText += `• ${selectedReward.amount}x ${selectedReward.name}\n`;
                    }
                }
                
                // Deduct price
                profile.coins -= item.price;
                
                await safeSendMessage(sock, sender, {
                    text: `*🎁 Gift Box Opened!*\n\nYou opened a gift box and found:\n${rewardsText}\nCurrent balance: ${formatNumber(profile.coins)} coins`
                });
            } else if (item.id === 'xp_booster') {
                // Apply XP booster
                if (!profile.boosters) profile.boosters = {};
                
                profile.boosters.xp = {
                    active: true,
                    expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
                };
                
                // Deduct coins
                profile.coins -= item.price;
                
                await safeSendMessage(sock, sender, {
                    text: `*🔥 XP Booster Activated!*\n\nYour XP booster will be active for 24 hours, doubling all XP gains!\n\nCurrent balance: ${formatNumber(profile.coins)} coins`
                });
            } else {
                // Standard item purchase
                profile.inventory[item.id] = (profile.inventory[item.id] || 0) + 1;
                profile.coins -= item.price;
                
                await safeSendMessage(sock, sender, {
                    text: `*🛒 Item Purchased!*\n\nYou bought 1x ${item.id} for ${formatNumber(item.price)} coins.\n\nCurrent balance: ${formatNumber(profile.coins)} coins`
                });
            }
            
            // Save profile
            userProfiles.set(sender, profile);
        }
    },
    
    async stats(sock, sender, args) {
        const profile = await getUserProfile(sock, sender);
        if (!profile) return;
        
        let target = sender;
        
        // Check if mentioning another user
        if (args.length > 0 && args[0].startsWith('@')) {
            // Extract user ID from mention
            // This is just a placeholder, actual implementation would depend on sock's mention parsing
            const mentionedUser = args[0].substring(1) + '@s.whatsapp.net';
            
            // Check if user exists
            const targetProfile = userProfiles.get(mentionedUser);
            if (!targetProfile) {
                await safeSendText(sock, sender, '*❌ Error:* User not found or not registered.'
                );
                return;
            }
            
            target = mentionedUser;
        }
        
        const targetProfile = userProfiles.get(target);
        const job = userJobs.get(target);
        
        // Calculate stats
        const gamesPlayed = (profile.gamesPlayed || 0);
        const gamesWon = (profile.gamesWon || 0);
        const winRate = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;
        
        const commandsUsed = (profile.commandsUsed || 0);
        const messagesCount = (profile.messageCount || 0);
        
        // Create stats message
        let statsMessage = `*📊 User Stats: ${targetProfile.name || 'User'}*\n\n`;
        
        // Basic stats
        statsMessage += `*Level:* ${targetProfile.level || 1}\n`;
        statsMessage += `*XP:* ${targetProfile.xp || 0}\n`;
        statsMessage += `*Balance:* ${formatNumber(targetProfile.coins || 0)} coins\n`;
        statsMessage += `*Job:* ${job ? job.name : 'Unemployed'}\n`;
        statsMessage += `*Messages:* ${messagesCount}\n`;
        statsMessage += `*Commands Used:* ${commandsUsed}\n\n`;
        
        // Game stats
        statsMessage += `*Games Played:* ${gamesPlayed}\n`;
        statsMessage += `*Games Won:* ${gamesWon}\n`;
        statsMessage += `*Win Rate:* ${winRate}%\n\n`;
        
        // Achievement stats
        const achievementCount = targetProfile.achievements ? targetProfile.achievements.length : 0;
        statsMessage += `*Achievements:* ${achievementCount}\n`;
        
        // RPG stats
        statsMessage += `*Adventures:* ${targetProfile.adventureCount || 0}\n`;
        statsMessage += `*Crimes:* ${targetProfile.crimeCount || 0}\n`;
        statsMessage += `*Quests Completed:* ${targetProfile.completedQuests ? targetProfile.completedQuests.length : 0}\n`;
        
        await safeSendText(sock, sender, statsMessage );
    },
    
    async hourly(sock, sender) {
        const profile = await getUserProfile(sock, sender);
        if (!profile) return;
        
        // Check cooldown
        const lastHourly = profile.lastHourly || 0;
        const cooldown = 60 * 60 * 1000; // 1 hour in ms
        
        if (Date.now() - lastHourly < cooldown) {
            const timeLeft = Math.ceil((lastHourly + cooldown - Date.now()) / 1000);
            await safeSendMessage(sock, sender, {
                text: `*⏳ Cooldown:* You can claim your hourly reward in ${formatTimeRemaining(timeLeft)}.`
            });
            return;
        }
        
        // Calculate reward (base + level bonus + streak bonus)
        const baseReward = 100;
        const levelBonus = profile.level * 5; // 5 coins per level
        
        // Hourly streak system
        if (!profile.hourlyStreak) profile.hourlyStreak = { count: 0, lastClaim: 0 };
        
        const hourlyStreakExpiry = 2 * 60 * 60 * 1000; // 2 hours to maintain streak
        const streakMaintained = (Date.now() - profile.hourlyStreak.lastClaim) <= hourlyStreakExpiry;
        
        if (streakMaintained) {
            profile.hourlyStreak.count++;
        } else {
            profile.hourlyStreak.count = 1; // Reset to 1 (this claim)
        }
        
        profile.hourlyStreak.lastClaim = Date.now();
        
        // Bonus for streak (caps at +100 for 10+ streak)
        const streakBonus = Math.min(profile.hourlyStreak.count * 10, 100);
        
        // Apply rewards
        const totalReward = baseReward + levelBonus + streakBonus;
        profile.coins += totalReward;
        profile.lastHourly = Date.now();
        
        // Save profile
        userProfiles.set(sender, profile);
        
        await safeSendMessage(sock, sender, {
            text: `*⏰ Hourly Reward Claimed!*\n\nYou received ${formatNumber(totalReward)} coins!\n\n• Base: ${baseReward} coins\n• Level Bonus: ${levelBonus} coins\n• Streak Bonus (${profile.hourlyStreak.count}): ${streakBonus} coins\n\nCurrent balance: ${formatNumber(profile.coins)} coins\nCome back in 1 hour for your next reward!`
        });
    },
    
    async weekly(sock, sender) {
        const profile = await getUserProfile(sock, sender);
        if (!profile) return;
        
        // Check cooldown
        const lastWeekly = profile.lastWeekly || 0;
        const cooldown = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
        
        if (Date.now() - lastWeekly < cooldown) {
            const timeLeft = Math.ceil((lastWeekly + cooldown - Date.now()) / 1000);
            await safeSendMessage(sock, sender, {
                text: `*⏳ Cooldown:* You can claim your weekly reward in ${formatTimeRemaining(timeLeft)}.`
            });
            return;
        }
        
        // Calculate reward (more substantial than daily)
        const baseReward = 1000;
        const levelBonus = profile.level * 50; // 50 coins per level
        
        // Apply rewards
        const totalReward = baseReward + levelBonus;
        profile.coins += totalReward;
        profile.lastWeekly = Date.now();
        
        // Initialize inventory if needed
        if (!profile.inventory) profile.inventory = {};
        
        // Add bonus item
        const bonusItems = [
            { name: 'gold', chance: 40 },
            { name: 'diamond', chance: 10 },
            { name: 'gift_box', chance: 30 },
            { name: 'xp_booster', chance: 20 }
        ];
        
        // Weighted random selection
        const totalChance = bonusItems.reduce((sum, item) => sum + item.chance, 0);
        let random = Math.random() * totalChance;
        let selectedItem = null;
        
        for (const item of bonusItems) {
            random -= item.chance;
            if (random <= 0) {
                selectedItem = item.name;
                break;
            }
        }
        
        // Fallback
        if (!selectedItem) selectedItem = 'gold';
        
        // Add item to inventory
        profile.inventory[selectedItem] = (profile.inventory[selectedItem] || 0) + 1;
        
        // Save profile
        userProfiles.set(sender, profile);
        
        await safeSendMessage(sock, sender, {
            text: `*📅 Weekly Reward Claimed!*\n\nYou received ${formatNumber(totalReward)} coins and 1x ${selectedItem}!\n\n• Base: ${baseReward} coins\n• Level Bonus: ${levelBonus} coins\n\nCurrent balance: ${formatNumber(profile.coins)} coins\nCome back in 7 days for your next weekly reward!`
        });
    },
    
    async lottery(sock, sender, args) {
        const profile = await getUserProfile(sock, sender);
        if (!profile) return;
        
        // Command to buy tickets
        if (args.length > 0 && args[0].toLowerCase() === 'buy') {
            const ticketPrice = 100;
            const count = args.length > 1 && !isNaN(parseInt(args[1])) ? parseInt(args[1]) : 1;
            
            if (count < 1) {
                await safeSendText(sock, sender, '*❌ Error:* Please specify a valid number of tickets to buy.'
                );
                return;
            }
            
            const totalCost = ticketPrice * count;
            
            // Check if user has enough coins
            if (profile.coins < totalCost) {
                await safeSendMessage(sock, sender, {
                    text: `*❌ Error:* You don't have enough coins to buy ${count} lottery tickets. You need ${formatNumber(totalCost)} coins.`
                });
                return;
            }
            
            // Add tickets to user
            if (!lotteryParticipants.has(sender)) {
                lotteryParticipants.set(sender, 0);
            }
            
            lotteryParticipants.set(sender, lotteryParticipants.get(sender) + count);
            
            // Deduct coins
            profile.coins -= totalCost;
            userProfiles.set(sender, profile);
            
            await safeSendMessage(sock, sender, {
                text: `*🎟️ Lottery Tickets Purchased!*\n\nYou bought ${count} lottery ticket${count > 1 ? 's' : ''} for ${formatNumber(totalCost)} coins.\n\nYou now have ${lotteryParticipants.get(sender)} ticket${lotteryParticipants.get(sender) > 1 ? 's' : ''}.\n\nCurrent balance: ${formatNumber(profile.coins)} coins\n\nThe lottery drawing happens every 24 hours. Good luck!`
            });
            return;
        }
        
        // Show lottery info
        // Calculate global totals
        let totalTickets = 0;
        let poolAmount = 0;
        
        lotteryParticipants.forEach((tickets, userId) => {
            totalTickets += tickets;
            poolAmount += tickets * 80; // 80% of ticket price goes to pool
        });
        
        // User's tickets
        const userTickets = lotteryParticipants.get(sender) || 0;
        const winChance = totalTickets > 0 ? (userTickets / totalTickets) * 100 : 0;
        
        await safeSendMessage(sock, sender, {
            text: `*🎲 Lottery Information:*\n\nTicket Price: 100 coins\nCurrent Prize Pool: ${formatNumber(poolAmount)} coins\nTotal Tickets: ${totalTickets}\n\nYour Tickets: ${userTickets}\nWin Chance: ${winChance.toFixed(2)}%\n\nUse .lottery buy [count] to purchase tickets.\nThe lottery drawing happens every 24 hours.\nLast winner: ${global.lastLotteryWinner || 'None yet'}`
        });
    },
    
    async recipe(sock, sender, args) {
        const profile = await getUserProfile(sock, sender);
        if (!profile) return;
        
        if (args.length === 0) {
            // Show list of available recipes
            let recipeList = '*📜 Available Recipes:*\n\n';
            
            // Get craftable items
            const craftableItems = Object.entries(gameItems)
                .filter(([_, item]) => item.recipe)
                .map(([itemId, item]) => ({ id: itemId, ...item }));
            
            craftableItems.forEach(item => {
                recipeList += `• ${item.id} - ${item.description}\n`;
                recipeList += '  *Materials:* ';
                
                const materials = Object.entries(item.recipe)
                    .map(([matId, amount]) => `${amount}x ${matId}`)
                    .join(', ');
                
                recipeList += materials + '\n\n';
            });
            
            recipeList += 'Use .recipe [item] to see detailed information about a specific recipe.';
            
            await safeSendText(sock, sender, recipeList );
            return;
        }
        
        // Get specific recipe
        const itemId = args.join('_').toLowerCase();
        const itemInfo = Object.entries(gameItems)
            .find(([id, _]) => id.toLowerCase() === itemId);
        
        if (!itemInfo || !itemInfo[1].recipe) {
            await safeSendText(sock, sender, '*❌ Error:* Recipe not found. Use .recipe to see available recipes.'
            );
            return;
        }
        
        const [id, item] = itemInfo;
        
        // Get required materials
        const materialsText = Object.entries(item.recipe)
            .map(([matId, amount]) => {
                const materialInfo = gameItems[matId];
                const userHas = (profile.inventory && profile.inventory[matId]) || 0;
                const statusSymbol = userHas >= amount ? '✅' : '❌';
                
                return `${statusSymbol} ${amount}x ${matId} (${userHas}/${amount})`;
            })
            .join('\n• ');
        
        // Get effects info if any
        let effectsText = '';
        if (item.effect) {
            effectsText = '\n\n*Effects:*\n• ' + Object.entries(item.effect)
                .map(([stat, value]) => `${stat.replace('_', ' ')}: +${value}%`)
                .join('\n• ');
        }
        
        await safeSendMessage(sock, sender, {
            text: `*📜 Recipe: ${id}*\n\n*Description:* ${item.description}\n*Value:* ${item.value} coins\n\n*Required Materials:*\n• ${materialsText}${effectsText}\n\nUse .craft ${id} to craft this item.`
        });
    },
    
    async dicebet(sock, sender, args) {
        const profile = await getUserProfile(sock, sender);
        if (!profile) return;
        
        if (args.length < 2) {
            await safeSendText(sock, sender, '*⚠️ Usage:* .dicebet [amount] [number 1-6]\n\nPlace a bet on a dice roll. If you guess correctly, you win 5x your bet!'
            );
            return;
        }
        
        // Parse arguments
        const betAmount = parseInt(args[0]);
        const betNumber = parseInt(args[1]);
        
        // Validate bet amount
        if (isNaN(betAmount) || betAmount < 10) {
            await safeSendText(sock, sender, '*❌ Error:* Minimum bet amount is 10 coins.'
            );
            return;
        }
        
        if (betAmount > profile.coins) {
            await safeSendMessage(sock, sender, {
                text: `*❌ Error:* You don't have enough coins for this bet. You have ${formatNumber(profile.coins)} coins.`
            });
            return;
        }
        
        // Validate bet number
        if (isNaN(betNumber) || betNumber < 1 || betNumber > 6) {
            await safeSendText(sock, sender, '*❌ Error:* Please bet on a number between 1 and 6.'
            );
            return;
        }
        
        // Roll the dice
        const diceRoll = Math.floor(Math.random() * 6) + 1;
        
        // Determine outcome
        const won = diceRoll === betNumber;
        
        if (won) {
            // Win (5x bet)
            const winAmount = betAmount * 5;
            profile.coins += (winAmount - betAmount); // Subtract the original bet since we're adding the win
            
            await safeSendMessage(sock, sender, {
                text: `*🎲 Dice Bet - YOU WON!*\n\nYou bet ${formatNumber(betAmount)} coins on ${betNumber}.\nDice rolled: ${diceRoll}\n\nYou won ${formatNumber(winAmount)} coins!\nCurrent balance: ${formatNumber(profile.coins)} coins`
            });
        } else {
            // Lose
            profile.coins -= betAmount;
            
            await safeSendMessage(sock, sender, {
                text: `*🎲 Dice Bet - You Lost*\n\nYou bet ${formatNumber(betAmount)} coins on ${betNumber}.\nDice rolled: ${diceRoll}\n\nYou lost ${formatNumber(betAmount)} coins.\nCurrent balance: ${formatNumber(profile.coins)} coins`
            });
        }
        
        // Update game stats
        profile.gamesPlayed = (profile.gamesPlayed || 0) + 1;
        if (won) profile.gamesWon = (profile.gamesWon || 0) + 1;
        
        // Save profile
        userProfiles.set(sender, profile);
    },
    
    async pets(sock, sender, args) {
        const profile = await getUserProfile(sock, sender);
        if (!profile) return;
        
        // Default to showing pet info
        if (args.length === 0) {
            // Check if user has a pet
            const pet = petData.get(sender);
            
            if (!pet) {
                // Show available pets
                let petsList = '*🐾 Available Pets:*\n\n';
                
                petTypes.forEach(pet => {
                    petsList += `• ${pet.name} - ${formatNumber(pet.cost)} coins\n`;
                    petsList += `  Happiness: ${pet.happiness}, Health: ${pet.health}, Hunger: ${pet.hunger}, Loyalty: ${pet.loyalty}\n`;
                });
                
                petsList += '\nUse .pets adopt [pet name] to adopt a pet!';
                
                await safeSendText(sock, sender, petsList );
                return;
            }
            
            // User has a pet - show pet status
            const petType = petTypes.find(p => p.name.toLowerCase() === pet.type.toLowerCase());
            
            if (!petType) {
                await safeSendText(sock, sender, '*❌ Error:* Your pet data is corrupted. Please contact an administrator.'
                );
                return;
            }
            
            // Calculate status
            const now = Date.now();
            
            // Calculate time since last interaction
            const hoursSinceInteraction = (now - pet.lastInteraction) / (60 * 60 * 1000);
            
            // Pets lose happiness and gain hunger over time
            let happiness = Math.max(0, pet.happiness - (hoursSinceInteraction * 0.5));
            let health = Math.max(0, pet.health - (hoursSinceInteraction * 0.3));
            let hunger = Math.min(10, pet.hunger + (hoursSinceInteraction * 0.7));
            
            // Update pet stats
            pet.happiness = happiness;
            pet.health = health;
            pet.hunger = hunger;
            pet.lastInteraction = now;
            
            // Save pet data
            petData.set(sender, pet);
            
            // Create status bars
            const createBar = (value, max = 10) => {
                const filledCount = Math.round((value / max) * 10);
                return '█'.repeat(filledCount) + '░'.repeat(10 - filledCount);
            };
            
            const happinessBar = createBar(happiness);
            const healthBar = createBar(health);
            const hungerBar = createBar(hunger);
            const loyaltyBar = createBar(pet.loyalty, 100);
            
            await safeSendMessage(sock, sender, {
                text: `*🐾 Your Pet: ${pet.name} (${pet.type})*\n\n*Happiness:* ${happinessBar} ${happiness.toFixed(1)}/10\n*Health:* ${healthBar} ${health.toFixed(1)}/10\n*Hunger:* ${hungerBar} ${hunger.toFixed(1)}/10\n*Loyalty:* ${loyaltyBar} ${pet.loyalty.toFixed(1)}/100\n\nCommands:\n• .pets feed - Feed your pet (-hunger, +happiness)\n• .pets play - Play with your pet (+happiness)\n• .pets heal - Heal your pet (+health)\n• .pets rename [name] - Rename your pet`
            });
            
            return;
        }
        
        // Handle different pet commands
        const command = args[0].toLowerCase();
        
        switch (command) {
            case 'adopt':
                // Adopt a pet
                if (args.length < 2) {
                    await safeSendText(sock, sender, '*⚠️ Usage:* .pets adopt [pet name]\n\nUse .pets to see available pets.'
                    );
                    return;
                }
                
                // Check if user already has a pet
                if (petData.get(sender)) {
                    await safeSendText(sock, sender, '*❌ Error:* You already have a pet! You can\'t adopt another one.'
                    );
                    return;
                }
                
                // Get pet type
                const petName = args.slice(1).join(' ');
                const petType = petTypes.find(p => p.name.toLowerCase() === petName.toLowerCase());
                
                if (!petType) {
                    await safeSendText(sock, sender, '*❌ Error:* Invalid pet type. Use .pets to see available pets.'
                    );
                    return;
                }
                
                // Check if user has enough coins
                if (profile.coins < petType.cost) {
                    await safeSendMessage(sock, sender, {
                        text: `*❌ Error:* You don't have enough coins to adopt a ${petType.name}. You need ${formatNumber(petType.cost)} coins.`
                    });
                    return;
                }
                
                // Adopt pet
                profile.coins -= petType.cost;
                
                // Create pet data
                const newPet = {
                    type: petType.name,
                    name: petType.name, // Default name is the pet type
                    happiness: petType.happiness,
                    health: petType.health,
                    hunger: petType.hunger,
                    loyalty: petType.loyalty,
                    adoptedAt: Date.now(),
                    lastInteraction: Date.now()
                };
                
                // Save pet data
                petData.set(sender, newPet);
                
                // Add achievement
                if (addAchievement(profile, 'pet')) {
                    await safeSendText(sock, sender, '*🏆 Achievement Unlocked:* Pet Lover\nYou adopted your first pet!'
                    );
                }
                
                // Save profile
                userProfiles.set(sender, profile);
                
                await safeSendMessage(sock, sender, {
                    text: `*🐾 Pet Adopted!*\n\nYou have adopted a ${petType.name}!\n\nUse .pets to check on your pet's status and interact with it.\n\nCurrent balance: ${formatNumber(profile.coins)} coins`
                });
                break;
                
            case 'feed':
                // Feed pet
                const pet = petData.get(sender);
                if (!pet) {
                    await safeSendText(sock, sender, '*❌ Error:* You don\'t have a pet to feed. Use .pets adopt [pet name] to adopt one.'
                    );
                    return;
                }
                
                // Check if user has pet food or enough coins
                const hasPetFood = profile.inventory && profile.inventory.pet_food > 0;
                const feedCost = 25; // coins to feed without pet food
                
                if (!hasPetFood && profile.coins < feedCost) {
                    await safeSendMessage(sock, sender, {
                        text: `*❌ Error:* You don't have pet food or enough coins to feed your pet. Feeding costs ${feedCost} coins.`
                    });
                    return;
                }
                
                // Feed pet
                if (hasPetFood) {
                    profile.inventory.pet_food -= 1;
                    pet.hunger = Math.max(0, pet.hunger - 4);
                    pet.happiness = Math.min(10, pet.happiness + 2);
                    pet.health = Math.min(10, pet.health + 1);
                } else {
                    profile.coins -= feedCost;
                    pet.hunger = Math.max(0, pet.hunger - 3);
                    pet.happiness = Math.min(10, pet.happiness + 1);
                }
                
                pet.lastInteraction = Date.now();
                
                // Increase loyalty
                pet.loyalty = Math.min(100, pet.loyalty + 0.5);
                
                // Save data
                petData.set(sender, pet);
                userProfiles.set(sender, profile);
                
                await safeSendMessage(sock, sender, {
                    text: `*🐾 Pet Fed!*\n\nYou fed your ${pet.name}!\n\nHunger: ${pet.hunger.toFixed(1)}/10\nHappiness: ${pet.happiness.toFixed(1)}/10\nHealth: ${pet.health.toFixed(1)}/10\n\n${hasPetFood ? 'You used 1 pet food from your inventory.' : `You spent ${feedCost} coins on food.`}\n\nCurrent balance: ${formatNumber(profile.coins)} coins`
                });
                break;
                
            case 'play':
                // Play with pet
                const playPet = petData.get(sender);
                if (!playPet) {
                    await safeSendText(sock, sender, '*❌ Error:* You don\'t have a pet to play with. Use .pets adopt [pet name] to adopt one.'
                    );
                    return;
                }
                
                // Playing slightly increases hunger
                playPet.happiness = Math.min(10, playPet.happiness + 2);
                playPet.hunger = Math.min(10, playPet.hunger + 0.5);
                playPet.lastInteraction = Date.now();
                
                // Increase loyalty
                playPet.loyalty = Math.min(100, playPet.loyalty + 1);
                
                // Save data
                petData.set(sender, playPet);
                
                await safeSendMessage(sock, sender, {
                    text: `*🐾 Playtime!*\n\nYou played with your ${playPet.name}! They seem much happier now.\n\nHappiness: ${playPet.happiness.toFixed(1)}/10\nHunger: ${playPet.hunger.toFixed(1)}/10\nLoyalty: ${playPet.loyalty.toFixed(1)}/100`
                });
                break;
                
            case 'heal':
                // Heal pet
                const healPet = petData.get(sender);
                if (!healPet) {
                    await safeSendText(sock, sender, '*❌ Error:* You don\'t have a pet to heal. Use .pets adopt [pet name] to adopt one.'
                    );
                    return;
                }
                
                // Healing costs coins
                const healCost = 50;
                
                if (profile.coins < healCost) {
                    await safeSendMessage(sock, sender, {
                        text: `*❌ Error:* You don't have enough coins to heal your pet. Healing costs ${healCost} coins.`
                    });
                    return;
                }
                
                // Heal pet
                profile.coins -= healCost;
                healPet.health = 10; // Full health
                healPet.lastInteraction = Date.now();
                
                // Increase loyalty
                healPet.loyalty = Math.min(100, healPet.loyalty + 2);
                
                // Save data
                petData.set(sender, healPet);
                userProfiles.set(sender, profile);
                
                await safeSendMessage(sock, sender, {
                    text: `*🐾 Pet Healed!*\n\nYou healed your ${healPet.name} back to full health!\n\nHealth: ${healPet.health.toFixed(1)}/10\nLoyalty: ${healPet.loyalty.toFixed(1)}/100\n\nCurrent balance: ${formatNumber(profile.coins)} coins`
                });
                break;
                
            case 'rename':
                // Rename pet
                const renamePet = petData.get(sender);
                if (!renamePet) {
                    await safeSendText(sock, sender, '*❌ Error:* You don\'t have a pet to rename. Use .pets adopt [pet name] to adopt one.'
                    );
                    return;
                }
                
                if (args.length < 2) {
                    await safeSendText(sock, sender, '*⚠️ Usage:* .pets rename [new name]'
                    );
                    return;
                }
                
                // Get new name
                const newName = args.slice(1).join(' ');
                
                // Check length
                if (newName.length < 2 || newName.length > 20) {
                    await safeSendText(sock, sender, '*❌ Error:* Pet name must be between 2 and 20 characters long.'
                    );
                    return;
                }
                
                // Store old name for message
                const oldName = renamePet.name;
                
                // Rename pet
                renamePet.name = newName;
                renamePet.lastInteraction = Date.now();
                
                // Save data
                petData.set(sender, renamePet);
                
                await safeSendMessage(sock, sender, {
                    text: `*🐾 Pet Renamed!*\n\nYou renamed your pet from "${oldName}" to "${newName}"!`
                });
                break;
                
            default:
                await safeSendText(sock, sender, '*⚠️ Usage:* .pets [adopt|feed|play|heal|rename]'
                );
        }
    },
    
    async marriage(sock, sender, args) {
        const profile = await getUserProfile(sock, sender);
        if (!profile) return;
        
        // Default to showing marriage info
        if (args.length === 0) {
            const marriage = marriageData.get(sender);
            
            if (!marriage) {
                await safeSendText(sock, sender, '*❤️ Marriage System:*\n\nYou are not currently married.\n\nUse .marriage propose @user to propose to someone!'
                );
                return;
            }
            
            // Calculate marriage duration
            const now = Date.now();
            const marriageDuration = now - marriage.date;
            const days = Math.floor(marriageDuration / (24 * 60 * 60 * 1000));
            
            // Get partner profile
            const partnerProfile = userProfiles.get(marriage.partner);
            const partnerName = partnerProfile ? partnerProfile.name : 'Unknown';
            
            await safeSendMessage(sock, sender, {
                text: `*❤️ Marriage Status:*\n\nYou are married to ${partnerName}.\nMarriage date: ${new Date(marriage.date).toDateString()}\nDuration: ${days} days\n\nUse .marriage gift to give a gift to your spouse.`
            });
            return;
        }
        
        // Handle different marriage commands
        const command = args[0].toLowerCase();
        
        switch (command) {
            case 'propose':
                // Marriage proposal
                if (args.length < 2 || !args[1].startsWith('@')) {
                    await safeSendText(sock, sender, '*⚠️ Usage:* .marriage propose @user'
                    );
                    return;
                }
                
                // Check if already married
                if (marriageData.get(sender)) {
                    await safeSendText(sock, sender, '*❌ Error:* You are already married! You must divorce first.'
                    );
                    return;
                }
                
                // Extract target user ID
                const targetUser = args[1].substring(1) + '@s.whatsapp.net';
                
                // Check if target is valid user
                const targetProfile = userProfiles.get(targetUser);
                if (!targetProfile) {
                    await safeSendText(sock, sender, '*❌ Error:* User not found or not registered.'
                    );
                    return;
                }
                
                // Check if target is already married
                if (marriageData.get(targetUser)) {
                    await safeSendText(sock, sender, '*❌ Error:* That user is already married to someone else!'
                    );
                    return;
                }
                
                // Store proposal in global proposals
                global.marriageProposals = global.marriageProposals || new Map();
                global.marriageProposals.set(targetUser, {
                    proposer: sender,
                    time: Date.now()
                });
                
                await safeSendMessage(sock, sender, {
                    text: `*❤️ Marriage Proposal Sent!*\n\nYou proposed to ${targetProfile.name}!\nThey need to accept by using .marriage accept.`
                });
                
                // Send message to target user
                await safeSendMessage(sock, targetUser, {
                    text: `*❤️ Marriage Proposal!*\n\n${profile.name} has proposed to you!\n\nUse .marriage accept to accept the proposal, or .marriage reject to decline.`
                });
                break;
                
            case 'accept':
                // Accept marriage proposal
                global.marriageProposals = global.marriageProposals || new Map();
                const proposal = global.marriageProposals.get(sender);
                
                if (!proposal) {
                    await safeSendText(sock, sender, '*❌ Error:* You don\'t have any pending marriage proposals.'
                    );
                    return;
                }
                
                // Check if proposal is expired (24 hours)
                if (Date.now() - proposal.time > 24 * 60 * 60 * 1000) {
                    global.marriageProposals.delete(sender);
                    await safeSendText(sock, sender, '*❌ Error:* The marriage proposal has expired.'
                    );
                    return;
                }
                
                // Check if either user is now married
                if (marriageData.get(sender) || marriageData.get(proposal.proposer)) {
                    global.marriageProposals.delete(sender);
                    await safeSendText(sock, sender, '*❌ Error:* Either you or the proposer is already married.'
                    );
                    return;
                }
                
                // Create marriage
                const marriage = {
                    partner: proposal.proposer,
                    date: Date.now()
                };
                
                const proposerMarriage = {
                    partner: sender,
                    date: Date.now()
                };
                
                // Save marriages
                marriageData.set(sender, marriage);
                marriageData.set(proposal.proposer, proposerMarriage);
                
                // Remove proposal
                global.marriageProposals.delete(sender);
                
                // Get names
                const proposerProfile = userProfiles.get(proposal.proposer);
                const proposerName = proposerProfile ? proposerProfile.name : 'Your partner';
                
                // Add achievement for both
                if (addAchievement(profile, 'married')) {
                    await safeSendText(sock, sender, '*🏆 Achievement Unlocked:* Soul Bound\nYou got married!'
                    );
                }
                
                if (proposerProfile && addAchievement(proposerProfile, 'married')) {
                    await safeSendText(sock, proposal.proposer, '*🏆 Achievement Unlocked:* Soul Bound\nYou got married!'
                    );
                }
                
                // Save profiles
                userProfiles.set(sender, profile);
                if (proposerProfile) userProfiles.set(proposal.proposer, proposerProfile);
                
                // Send messages to both parties
                await safeSendMessage(sock, sender, {
                    text: `*❤️ Marriage Accepted!*\n\nCongratulations! You are now married to ${proposerName}!\n\nUse .marriage to check your marriage status.`
                });
                
                await safeSendMessage(sock, proposal.proposer, {
                    text: `*❤️ Marriage Accepted!*\n\nCongratulations! ${profile.name} has accepted your proposal! You are now married!\n\nUse .marriage to check your marriage status.`
                });
                break;
                
            case 'reject':
                // Reject marriage proposal
                global.marriageProposals = global.marriageProposals || new Map();
                const rejectProposal = global.marriageProposals.get(sender);
                
                if (!rejectProposal) {
                    await safeSendText(sock, sender, '*❌ Error:* You don\'t have any pending marriage proposals.'
                    );
                    return;
                }
                
                // Get proposer
                const rejectProposer = rejectProposal.proposer;
                
                // Remove proposal
                global.marriageProposals.delete(sender);
                
                await safeSendText(sock, sender, '*❤️ Proposal Rejected*\n\nYou have rejected the marriage proposal.'
                );
                
                await safeSendMessage(sock, rejectProposer, {
                    text: `*❤️ Proposal Rejected*\n\n${profile.name} has rejected your marriage proposal.`
                });
                break;
                
            case 'divorce':
                // Divorce
                const divorceMarriage = marriageData.get(sender);
                
                if (!divorceMarriage) {
                    await safeSendText(sock, sender, '*❌ Error:* You are not currently married.'
                    );
                    return;
                }
                
                // Confirm divorce
                if (args.length < 2 || args[1].toLowerCase() !== 'confirm') {
                    await safeSendText(sock, sender, '*⚠️ Divorce Confirmation:*\n\nAre you sure you want to divorce? This cannot be undone.\n\nType .marriage divorce confirm to proceed.'
                    );
                    return;
                }
                
                // Get partner
                const partner = divorceMarriage.partner;
                const partnerMarriage = marriageData.get(partner);
                
                // Remove marriages
                marriageData.delete(sender);
                if (partnerMarriage) marriageData.delete(partner);
                
                // Calculate duration
                const divorceDuration = Date.now() - divorceMarriage.date;
                const divorceDays = Math.floor(divorceDuration / (24 * 60 * 60 * 1000));
                
                await safeSendMessage(sock, sender, {
                    text: `*💔 Divorce Completed*\n\nYou are now divorced. Your marriage lasted ${divorceDays} days.`
                });
                
                await safeSendMessage(sock, partner, {
                    text: `*💔 Divorce Notice*\n\n${profile.name} has divorced you. Your marriage lasted ${divorceDays} days.`
                });
                break;
                
            case 'gift':
                // Gift to spouse
                const giftMarriage = marriageData.get(sender);
                
                if (!giftMarriage) {
                    await safeSendText(sock, sender, '*❌ Error:* You are not currently married.'
                    );
                    return;
                }
                
                if (args.length < 2) {
                    await safeSendText(sock, sender, '*⚠️ Usage:* .marriage gift [coins/item] [amount/item_name]'
                    );
                    return;
                }
                
                const giftType = args[1].toLowerCase();
                const partner2 = giftMarriage.partner;
                const partnerProfile2 = userProfiles.get(partner2);
                
                if (!partnerProfile2) {
                    await safeSendText(sock, sender, '*❌ Error:* Your spouse\'s profile could not be found.'
                    );
                    return;
                }
                
                if (giftType === 'coins') {
                    // Gift coins
                    if (args.length < 3 || isNaN(parseInt(args[2]))) {
                        await safeSendText(sock, sender, '*⚠️ Usage:* .marriage gift coins [amount]'
                        );
                        return;
                    }
                    
                    const amount = parseInt(args[2]);
                    
                    if (amount < 10) {
                        await safeSendText(sock, sender, '*❌ Error:* Minimum gift amount is 10 coins.'
                        );
                        return;
                    }
                    
                    if (amount > profile.coins) {
                        await safeSendMessage(sock, sender, {
                            text: `*❌ Error:* You don't have enough coins. You have ${formatNumber(profile.coins)} coins.`
                        });
                        return;
                    }
                    
                    // Transfer coins
                    profile.coins -= amount;
                    partnerProfile2.coins += amount;
                    
                    // Save profiles
                    userProfiles.set(sender, profile);
                    userProfiles.set(partner2, partnerProfile2);
                    
                    await safeSendMessage(sock, sender, {
                        text: `*❤️ Gift Sent!*\n\nYou sent ${formatNumber(amount)} coins to your spouse!\n\nCurrent balance: ${formatNumber(profile.coins)} coins`
                    });
                    
                    await safeSendMessage(sock, partner2, {
                        text: `*❤️ Gift Received!*\n\nYour spouse ${profile.name} sent you ${formatNumber(amount)} coins!\n\nCurrent balance: ${formatNumber(partnerProfile2.coins)} coins`
                    });
                } else if (giftType === 'item') {
                    // Gift item
                    if (args.length < 4 || isNaN(parseInt(args[2]))) {
                        await safeSendText(sock, sender, '*⚠️ Usage:* .marriage gift item [amount] [item_name]'
                        );
                        return;
                    }
                    
                    const amount = parseInt(args[2]);
                    const itemName = args.slice(3).join('_').toLowerCase();
                    
                    // Check if item exists in inventory
                    if (!profile.inventory || !profile.inventory[itemName] || profile.inventory[itemName] < amount) {
                        await safeSendText(sock, sender, `*❌ Error:* You don't have enough of that item. Check your inventory with .inventory.`
                        );
                        return;
                    }
                    
                    // Initialize partner inventory if needed
                    if (!partnerProfile2.inventory) partnerProfile2.inventory = {};
                    
                    // Transfer item
                    profile.inventory[itemName] -= amount;
                    partnerProfile2.inventory[itemName] = (partnerProfile2.inventory[itemName] || 0) + amount;
                    
                    // Save profiles
                    userProfiles.set(sender, profile);
                    userProfiles.set(partner2, partnerProfile2);
                    
                    await safeSendMessage(sock, sender, {
                        text: `*❤️ Gift Sent!*\n\nYou sent ${amount}x ${itemName} to your spouse!`
                    });
                    
                    await safeSendMessage(sock, partner2, {
                        text: `*❤️ Gift Received!*\n\nYour spouse ${profile.name} sent you ${amount}x ${itemName}!`
                    });
                } else {
                    await safeSendText(sock, sender, '*⚠️ Usage:* .marriage gift [coins/item] [amount/item_name]'
                    );
                }
                break;
                
            default:
                await safeSendText(sock, sender, '*⚠️ Usage:* .marriage [propose|accept|reject|divorce|gift]'
                );
        }
    },
    
    async init() {
        try {
            logger.info('Initializing user extended command handler...');
            await initDirectories();
            return true;
        } catch (err) {
            logger.error('Failed to initialize user extended command handler:', err);
            return false;
        }
    }
};

// Export using the expected module structure
module.exports = {
    commands: commands,
    category: 'user_extended',
    async init() {
        try {
            logger.info('Initializing user extended module...');
            
            // Create directories if they don't exist
            await initDirectories();
            
            logger.info('User extended module initialized successfully');
            return true;
        } catch (err) {
            logger.error('Error initializing user extended module:', err);
            throw err;
        }
    }
};