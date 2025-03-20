/**
 * User Database
 * A centralized place to store and access user data
 */
const logger = require('./logger');
const fs = require('fs').promises;
const path = require('path');

// Simulated database for user profiles (should be replaced with actual database)
const userProfiles = new Map();

// Other user-related data
const userGames = new Map();
const marriageData = new Map();
const bankAccounts = new Map();
const userJobs = new Map();
const petData = new Map();
const userAfk = new Map();
const streakData = new Map();
const checkinData = new Map();
const lotteryParticipants = new Set();

/**
 * Initialize a user if they don't exist, with JID normalization
 * @param {string} userId User's unique identifier
 * @param {Object} initialData Initial data to set
 * @returns {Object} User profile
 */
function initializeUserProfile(userId, initialData = {}) {
    if (!userId) {
        console.error('Cannot initialize profile: userId is undefined or null');
        return null;
    }
    
    // Normalize the JID for consistent storage
    const normalizedId = _normalizeJid(userId);
    
    // Check with both original and normalized IDs
    const existingProfile = userProfiles.get(userId) || userProfiles.get(normalizedId);
    if (existingProfile) {
        console.log(`Profile already exists for ${userId}, returning existing profile`);
        return existingProfile;
    }
    
    // Create a new profile
    const defaultProfile = {
        name: initialData.name || 'User',
        age: initialData.age || 0,
        xp: 0,
        level: 1,
        coins: 0,
        bio: '',
        language: initialData.language || 'en', // Default language is English
        registeredAt: new Date().toISOString(),
        lastDaily: null,
        inventory: [],
        achievements: [],
        customTitle: '',
        warnings: 0
    };
    
    const profileData = {
        ...defaultProfile,
        ...initialData
    };
    
    console.log(`Initializing user profile for ${userId} (normalized: ${normalizedId}):`, profileData);
    
    // Store with normalized JID
    userProfiles.set(normalizedId, profileData);
    
    // Also store with original JID if different
    if (normalizedId !== userId) {
        userProfiles.set(userId, profileData);
        console.log(`Also stored profile under original JID format: ${userId}`);
    }
    
    return profileData;
}

/**
 * Normalize a WhatsApp JID to ensure consistent format with enhanced error handling
 * @param {string|object} jid JID to normalize
 * @returns {string} Normalized JID
 * @private
 */
function _normalizeJid(jid) {
    // First ensure jid is a string to prevent errors
    if (!jid) return '';
    
    try {
        // Convert to string if it's not already
        const jidStr = typeof jid === 'string' ? jid : String(jid);
        
        // Handle different JID formats - use safer string check with includes
        if (jidStr.includes('@g.us')) {
            // This is a group ID, return as is
            return jidStr;
        }
        
        // If it already has WhatsApp user domain
        if (jidStr.includes('@s.whatsapp.net')) {
            return jidStr;
        }
        
        // For user JIDs, normalize to standard format
        // Extract just the number part and re-add the WhatsApp domain
        const parts = jidStr.split('@');
        return parts[0] + '@s.whatsapp.net';
    } catch (err) {
        console.error(`Error normalizing JID (${typeof jid}): ${err.message}`);
        return typeof jid === 'string' ? jid : String(jid);
    }
}

/**
 * Get a user's profile with JID normalization for consistent lookups
 * @param {string} userId User's unique identifier
 * @returns {Object|null} User profile or null if not found
 */
function getUserProfile(userId) {
    if (!userId) return null;
    
    // Try direct lookup first for performance
    const directResult = userProfiles.get(userId);
    if (directResult) return directResult;
    
    // If not found, try with normalized JID
    const normalizedId = _normalizeJid(userId);
    
    // Try normalized lookup
    const normalizedResult = userProfiles.get(normalizedId);
    if (normalizedResult) {
        // For future lookups, store a reference with the original ID format too
        userProfiles.set(userId, normalizedResult);
        console.log(`User profile found with normalized JID: ${normalizedId} (original: ${userId})`);
        return normalizedResult;
    }
    
    // Try iterating through all profiles with manual normalization comparison
    // This is a fallback for edge cases but is less efficient
    for (const [key, profile] of userProfiles.entries()) {
        if (_normalizeJid(key) === normalizedId) {
            // Store references with both JID formats for future lookups
            userProfiles.set(userId, profile);
            userProfiles.set(normalizedId, profile);
            console.log(`User profile found through manual comparison: ${key} matches ${userId}`);
            return profile;
        }
    }
    
    // Not found with any method
    return null;
}

/**
 * Update a user's profile with JID normalization
 * @param {string} userId User's unique identifier
 * @param {Object} data Data to update
 * @returns {Object} Updated user profile
 */
function updateUserProfile(userId, data) {
    if (!userId) {
        console.error('Cannot update profile: userId is undefined or null');
        return null;
    }
    
    // Get profile with our enhanced getUserProfile function that handles JID normalization
    const profile = getUserProfile(userId);
    
    if (!profile) {
        console.log(`Creating new profile for user ${userId} with data:`, data);
        
        // Store with both original and normalized JID for consistent future lookups
        const normalizedId = _normalizeJid(userId);
        const newProfile = initializeUserProfile(normalizedId, data);
        
        // If the IDs are different, also store with original format
        if (normalizedId !== userId) {
            userProfiles.set(userId, newProfile);
            console.log(`Also stored profile under original JID format: ${userId}`);
        }
        
        return newProfile;
    }
    
    console.log(`Updating profile for user ${userId}:`, data);
    Object.assign(profile, data);
    
    // Ensure important fields exist
    if (!profile.language) {
        profile.language = 'en';
        console.log(`Added missing language field to user ${userId}`);
    }
    
    // Make sure the profile is stored with normalized JID too
    const normalizedId = _normalizeJid(userId);
    if (normalizedId !== userId) {
        userProfiles.set(normalizedId, profile);
    }
    
    console.log(`Updated profile for ${userId}:`, profile);
    return profile;
}

/**
 * Save all user data to a JSON file with enhanced error handling and data validation
 * @param {string} filename Filename to save to
 * @returns {Promise<{success: boolean, message: string, path?: string}>} Result object with status and details
 */
async function saveAllUserData(filename = 'user_data.json') {
    const startTime = Date.now();
    let backupCreated = false;
    let tempFilePath = null;
    
    try {
        // Ensure data directory exists
        const dataDir = path.join(process.cwd(), 'data');
        try {
            await fs.mkdir(dataDir, { recursive: true });
        } catch (dirErr) {
            logger.error(`Failed to create data directory: ${dirErr.message}`);
            return { 
                success: false, 
                message: `Failed to create data directory: ${dirErr.message}`
            };
        }
        
        // Define file paths
        const filePath = path.join(dataDir, filename);
        const backupPath = `${filePath}.bak`;
        tempFilePath = `${filePath}.temp.${Date.now()}`;
        
        // Create backup of existing file if it exists
        try {
            await fs.access(filePath);
            await fs.copyFile(filePath, backupPath);
            backupCreated = true;
            logger.debug(`Created backup of user data at ${backupPath}`);
        } catch (backupErr) {
            // No existing file to backup or backup failed
            logger.debug(`No existing file to backup or backup failed: ${backupErr.message}`);
        }
        
        // Validate user data before saving
        // Count valid profiles
        let validProfileCount = 0;
        let invalidProfileCount = 0;
        
        // Prepare the data object with validation
        const validatedUserProfiles = new Map();
        
        // Validate each profile
        for (const [key, profile] of userProfiles.entries()) {
            if (!profile || typeof profile !== 'object') {
                logger.warn(`Skipping invalid profile for user ${key}`);
                invalidProfileCount++;
                continue;
            }
            
            // Ensure all required fields exist
            const validatedProfile = {
                name: profile.name || 'User',
                age: profile.age || 0,
                xp: typeof profile.xp === 'number' ? profile.xp : 0,
                level: typeof profile.level === 'number' ? profile.level : 1,
                coins: typeof profile.coins === 'number' ? profile.coins : 0,
                bio: profile.bio || '',
                language: profile.language || 'en',
                registeredAt: profile.registeredAt || new Date().toISOString(),
                lastDaily: profile.lastDaily || null,
                inventory: Array.isArray(profile.inventory) ? profile.inventory : [],
                achievements: Array.isArray(profile.achievements) ? profile.achievements : [],
                customTitle: profile.customTitle || '',
                warnings: typeof profile.warnings === 'number' ? profile.warnings : 0
            };
            
            validatedUserProfiles.set(key, validatedProfile);
            validProfileCount++;
        }
        
        // Prepare the final data object
        const userData = {
            profiles: Object.fromEntries(validatedUserProfiles),
            games: Object.fromEntries(userGames),
            marriages: Object.fromEntries(marriageData),
            bank: Object.fromEntries(bankAccounts),
            jobs: Object.fromEntries(userJobs),
            pets: Object.fromEntries(petData),
            afk: Object.fromEntries(userAfk),
            streaks: Object.fromEntries(streakData),
            checkins: Object.fromEntries(checkinData),
            lottery: [...lotteryParticipants],
            _meta: {
                version: 1,
                savedAt: new Date().toISOString(),
                profileCount: validProfileCount,
                invalidProfileCount: invalidProfileCount
            }
        };
        
        // Serialize data with error handling
        let jsonData;
        try {
            jsonData = JSON.stringify(userData, null, 2);
            if (!jsonData) {
                throw new Error('JSON serialization resulted in empty string');
            }
        } catch (jsonErr) {
            logger.error(`Failed to stringify user data: ${jsonErr.message}`);
            return {
                success: false,
                message: `Failed to serialize user data: ${jsonErr.message}`
            };
        }
        
        // Write to temporary file first
        try {
            await fs.writeFile(tempFilePath, jsonData, 'utf8');
        } catch (writeErr) {
            logger.error(`Failed to write temporary user data file: ${writeErr.message}`);
            return {
                success: false,
                message: `Failed to write user data file: ${writeErr.message}`
            };
        }
        
        // Validate the written file
        try {
            const readData = await fs.readFile(tempFilePath, 'utf8');
            JSON.parse(readData); // Just to validate it's proper JSON
        } catch (validateErr) {
            logger.error(`Validation of written file failed: ${validateErr.message}`);
            return {
                success: false,
                message: `Validation of saved data failed: ${validateErr.message}`
            };
        }
        
        // Rename temporary file to the actual file
        try {
            await fs.rename(tempFilePath, filePath);
        } catch (renameErr) {
            logger.error(`Failed to rename temporary file: ${renameErr.message}`);
            return {
                success: false,
                message: `Failed to finalize user data file: ${renameErr.message}`
            };
        }
        
        // Clean up temporary file if it still exists for some reason
        try {
            await fs.access(tempFilePath);
            await fs.unlink(tempFilePath);
        } catch {
            // Temp file doesn't exist or was successfully renamed
        }
        
        const duration = Date.now() - startTime;
        logger.info(`User data saved to ${filePath} in ${duration}ms (${validProfileCount} profiles, ${invalidProfileCount} invalid)`);
        
        return {
            success: true,
            message: `User data saved successfully (${validProfileCount} profiles)`,
            path: filePath
        };
    } catch (error) {
        logger.error('Unexpected error saving user data:', error);
        
        // Try to clean up temp file if it exists
        if (tempFilePath) {
            try {
                await fs.access(tempFilePath);
                await fs.unlink(tempFilePath);
                logger.debug(`Cleaned up temporary file: ${tempFilePath}`);
            } catch {
                // Temp file doesn't exist or can't be deleted
            }
        }
        
        return {
            success: false,
            message: `Unexpected error saving user data: ${error.message}`,
            error: error.stack
        };
    }
}

/**
 * Load all user data from a JSON file with enhanced error handling
 * @param {string} filename Filename to load from
 * @returns {Promise<{success: boolean, message: string, count?: number}>} Result object with status and details
 */
async function loadAllUserData(filename = 'user_data.json') {
    // Create backup of current state before loading
    const backupData = {
        profiles: new Map(userProfiles),
        games: new Map(userGames),
        marriages: new Map(marriageData),
        bank: new Map(bankAccounts),
        jobs: new Map(userJobs),
        pets: new Map(petData),
        afk: new Map(userAfk),
        streaks: new Map(streakData),
        checkins: new Map(checkinData),
        lottery: new Set(lotteryParticipants)
    };
    
    try {
        const filePath = path.join(process.cwd(), 'data', filename);
        const dataDir = path.dirname(filePath);
        
        // Check if directory exists, create if not
        try {
            await fs.mkdir(dataDir, { recursive: true });
        } catch (dirErr) {
            logger.error(`Failed to create data directory: ${dirErr.message}`);
            return { success: false, message: 'Failed to create data directory' };
        }
        
        // Check if file exists
        let fileExists = false;
        try {
            await fs.access(filePath);
            fileExists = true;
        } catch (err) {
            logger.warn(`User data file ${filePath} not found. Starting with empty data.`);
            return { success: false, message: 'User data file not found' };
        }
        
        // Read file with extra validation
        let fileContent;
        try {
            fileContent = await fs.readFile(filePath, 'utf8');
            if (!fileContent || fileContent.trim() === '') {
                throw new Error('Empty file');
            }
        } catch (readErr) {
            logger.error(`Failed to read user data file: ${readErr.message}`);
            return { success: false, message: `Failed to read user data file: ${readErr.message}` };
        }
        
        // Parse JSON with validation
        let data;
        try {
            data = JSON.parse(fileContent);
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid data format');
            }
        } catch (parseErr) {
            logger.error(`Failed to parse user data: ${parseErr.message}`);
            
            // Create backup of corrupted file for recovery
            try {
                const backupPath = `${filePath}.corrupted.${Date.now()}`;
                await fs.writeFile(backupPath, fileContent);
                logger.info(`Created backup of corrupted user data at ${backupPath}`);
            } catch (backupErr) {
                logger.error(`Failed to backup corrupted data: ${backupErr.message}`);
            }
            
            return { success: false, message: `Failed to parse user data: ${parseErr.message}` };
        }
        
        // Backup current data before clearing
        try {
            const backupPath = `${filePath}.bak`;
            await fs.writeFile(backupPath, JSON.stringify({
                profiles: Object.fromEntries(userProfiles),
                games: Object.fromEntries(userGames),
                marriages: Object.fromEntries(marriageData),
                bank: Object.fromEntries(bankAccounts),
                jobs: Object.fromEntries(userJobs),
                pets: Object.fromEntries(petData),
                afk: Object.fromEntries(userAfk),
                streaks: Object.fromEntries(streakData),
                checkins: Object.fromEntries(checkinData),
                lottery: [...lotteryParticipants]
            }, null, 2));
            logger.info(`Created backup of current user data at ${backupPath}`);
        } catch (backupErr) {
            logger.warn(`Could not create backup of current data: ${backupErr.message}`);
        }
        
        // Clear existing data
        userProfiles.clear();
        userGames.clear();
        marriageData.clear();
        bankAccounts.clear();
        userJobs.clear();
        petData.clear();
        userAfk.clear();
        streakData.clear();
        checkinData.clear();
        lotteryParticipants.clear();
        
        let loadedCount = 0;
        
        // Load profiles with validation
        if (data.profiles && typeof data.profiles === 'object') {
            Object.entries(data.profiles).forEach(([key, value]) => {
                if (value && typeof value === 'object') {
                    // Normalize JID when loading profiles for consistent lookups
                    const normalizedKey = _normalizeJid(key);
                    
                    // Store with both original and normalized keys
                    userProfiles.set(normalizedKey, value);
                    
                    // Also store with original key if different
                    if (normalizedKey !== key) {
                        userProfiles.set(key, value);
                    }
                    
                    loadedCount++;
                    logger.debug(`Loaded profile for ${key} (normalized: ${normalizedKey})`);
                } else {
                    logger.warn(`Skipping invalid profile for user ${key}`);
                }
            });
        } else {
            logger.warn('No valid profile data found');
        }
        
        // Load games with validation
        if (data.games && typeof data.games === 'object') {
            Object.entries(data.games).forEach(([key, value]) => {
                if (value && typeof value === 'object') {
                    userGames.set(key, value);
                }
            });
        }
        
        // Load marriages with validation
        if (data.marriages && typeof data.marriages === 'object') {
            Object.entries(data.marriages).forEach(([key, value]) => {
                if (value && typeof value === 'object') {
                    marriageData.set(key, value);
                }
            });
        }
        
        // Load bank accounts with validation
        if (data.bank && typeof data.bank === 'object') {
            Object.entries(data.bank).forEach(([key, value]) => {
                if (value !== undefined) {
                    bankAccounts.set(key, value);
                }
            });
        }
        
        // Load jobs
        if (data.jobs) {
            Object.entries(data.jobs).forEach(([key, value]) => {
                userJobs.set(key, value);
            });
        }
        
        // Load pets
        if (data.pets) {
            Object.entries(data.pets).forEach(([key, value]) => {
                petData.set(key, value);
            });
        }
        
        // Load AFK
        if (data.afk) {
            Object.entries(data.afk).forEach(([key, value]) => {
                userAfk.set(key, value);
            });
        }
        
        // Load streaks
        if (data.streaks) {
            Object.entries(data.streaks).forEach(([key, value]) => {
                streakData.set(key, value);
            });
        }
        
        // Load checkins
        if (data.checkins) {
            Object.entries(data.checkins).forEach(([key, value]) => {
                checkinData.set(key, value);
            });
        }
        
        // Load lottery
        if (data.lottery && Array.isArray(data.lottery)) {
            data.lottery.forEach(participant => {
                lotteryParticipants.add(participant);
            });
        }
        
        logger.info(`User data loaded successfully from ${filePath}: ${loadedCount} profiles`);
        return { 
            success: true, 
            message: 'User data loaded successfully', 
            count: loadedCount 
        };
    } catch (error) {
        logger.error('Error loading user data:', error);
        
        // Restore from backup if we have one and loading failed
        if (Object.keys(backupData.profiles).length > 0) {
            try {
                logger.info('Restoring user data from memory backup...');
                
                // Restore all data collections from backup
                userProfiles.clear();
                userGames.clear();
                marriageData.clear();
                bankAccounts.clear();
                userJobs.clear();
                petData.clear();
                userAfk.clear();
                streakData.clear();
                checkinData.clear();
                lotteryParticipants.clear();
                
                // Copy data from backup
                for (const [key, value] of backupData.profiles) {
                    userProfiles.set(key, value);
                }
                
                for (const [key, value] of backupData.games) {
                    userGames.set(key, value);
                }
                
                for (const [key, value] of backupData.marriages) {
                    marriageData.set(key, value);
                }
                
                for (const [key, value] of backupData.bank) {
                    bankAccounts.set(key, value);
                }
                
                for (const [key, value] of backupData.jobs) {
                    userJobs.set(key, value);
                }
                
                for (const [key, value] of backupData.pets) {
                    petData.set(key, value);
                }
                
                for (const [key, value] of backupData.afk) {
                    userAfk.set(key, value);
                }
                
                for (const [key, value] of backupData.streaks) {
                    streakData.set(key, value);
                }
                
                for (const [key, value] of backupData.checkins) {
                    checkinData.set(key, value);
                }
                
                for (const participant of backupData.lottery) {
                    lotteryParticipants.add(participant);
                }
                
                logger.info('Restored user data from memory backup');
                return { 
                    success: false, 
                    message: 'Error loading user data, restored from memory backup',
                    error: error.message
                };
            } catch (restoreErr) {
                logger.error('Failed to restore from memory backup:', restoreErr);
            }
        }
        
        return { 
            success: false, 
            message: 'Error loading user data: ' + error.message 
        };
    }
}

// Setup auto-save interval (every 5 minutes)
let autoSaveInterval = null;

/**
 * Start auto-saving user data
 * @param {number} interval Interval in milliseconds
 */
function startAutoSave(interval = 5 * 60 * 1000) {
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
    }
    
    autoSaveInterval = setInterval(async () => {
        logger.info('Auto-saving user data...');
        try {
            const saveResult = await saveAllUserData();
            if (saveResult.success) {
                logger.debug(`Auto-save completed successfully: ${saveResult.message}`);
            } else {
                logger.warn(`Auto-save issue: ${saveResult.message}`);
            }
        } catch (error) {
            logger.error('Error during auto-save:', error);
        }
    }, interval);
    
    logger.info(`Auto-save started with ${interval}ms interval`);
}

/**
 * Stop auto-saving user data
 */
function stopAutoSave() {
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
        logger.info('Auto-save stopped');
    }
}

// Start auto-save when this module is imported
startAutoSave();

// Initialize with attempt to load existing data
(async () => {
    try {
        // Use the enhanced loadAllUserData with proper error handling
        const loadResult = await loadAllUserData();
        
        if (loadResult.success) {
            logger.info(`Successfully loaded initial user data: ${loadResult.count} profiles`);
        } else {
            logger.warn(`Initial user data load issue: ${loadResult.message}`);
            // Still a graceful startup even if data not loaded - we'll use empty maps
        }
    } catch (error) {
        logger.error('Unexpected error during initial user data load:', error);
        // Continue with empty data structures
    }
})();

// Ensure data is saved when the process exits with enhanced error handling
process.on('SIGINT', async () => {
    logger.info('Process terminated (SIGINT), saving user data...');
    try {
        const saveResult = await saveAllUserData();
        if (saveResult.success) {
            logger.info(`Successfully saved user data on shutdown: ${saveResult.message}`);
        } else {
            logger.error(`Failed to save user data on shutdown: ${saveResult.message}`);
        }
    } catch (error) {
        logger.error('Critical error saving user data on shutdown:', error);
    } finally {
        // Always exit even if save fails
        process.exit(0);
    }
});

process.on('SIGTERM', async () => {
    logger.info('Process terminated (SIGTERM), saving user data...');
    try {
        const saveResult = await saveAllUserData();
        if (saveResult.success) {
            logger.info(`Successfully saved user data on shutdown: ${saveResult.message}`);
        } else {
            logger.error(`Failed to save user data on shutdown: ${saveResult.message}`);
        }
    } catch (error) {
        logger.error('Critical error saving user data on shutdown:', error);
    } finally {
        // Always exit even if save fails
        process.exit(0);
    }
});

// Helper function for ban system to normalize JIDs consistently
/**
 * Normalize a user ID for ban system consistency with robust error handling
 * @param {string|object} userId - User ID to normalize
 * @returns {string} - Normalized user ID for ban system
 */
function normalizeUserIdForBanSystem(userId) {
    if (!userId) return '';
    
    try {
        // Convert to string if it's not already
        const userIdStr = typeof userId === 'string' ? userId : String(userId);
        
        // Strip out any non-numeric characters for phone numbers
        if (userIdStr.includes('@s.whatsapp.net')) {
            return userIdStr.split('@')[0].replace(/[^0-9]/g, '');
        }
        
        // If it's already just a number, return it directly
        if (/^\d+$/.test(userIdStr)) {
            return userIdStr;
        }
        
        // If it's a group JID, extract the group ID
        if (userIdStr.includes('@g.us')) {
            return userIdStr; // Return the full group JID
        }
        
        // If we're here, the format wasn't recognized
        // Use the normalized JID and extract just the user ID part
        const normalizedJid = _normalizeJid(userIdStr);
        
        // Make sure we have a valid string after normalization
        if (normalizedJid && normalizedJid.includes('@')) {
            return normalizedJid.split('@')[0];
        }
        
        // Final fallback - just strip non-numeric characters and return
        return userIdStr.replace(/[^0-9]/g, '');
    } catch (err) {
        console.error(`Error normalizing user ID (${typeof userId}): ${err.message}`);
        
        // Last resort fallback - avoid errors with whatever we can return
        if (typeof userId === 'string') {
            return userId.replace(/[^0-9]/g, '');
        } else if (typeof userId === 'number') {
            return String(userId);
        } else {
            return '';
        }
    }
}

module.exports = {
    userProfiles,
    userGames,
    marriageData,
    bankAccounts,
    userJobs,
    petData,
    userAfk,
    streakData,
    checkinData,
    lotteryParticipants,
    initializeUserProfile,
    getUserProfile,
    updateUserProfile,
    saveAllUserData,
    loadAllUserData,
    startAutoSave,
    stopAutoSave,
    normalizeUserIdForBanSystem,
    _normalizeJid  // Export this for reuse in other modules
};