/**
 * Platform Helper Utility
 * Provides utilities for cloud deployments, including credential management
 * Supports Heroku, Railway, and other platforms
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ensureDirectoryExists } = require('./fileUtils');
const logger = require('./logger');
const AdmZip = require('adm-zip');

// Constants
const AUTH_DIR = process.env.AUTH_DIR || 'auth_info_baileys';
const PLATFORM = process.env.PLATFORM || 'local';
const DEFAULT_CREDS_PATH = path.join(process.cwd(), AUTH_DIR, 'creds.json');

/**
 * Check if running on Heroku
 * @returns {boolean} Whether running on Heroku
 */
function isHeroku() {
    return PLATFORM === 'heroku' || !!process.env.DYNO;
}

/**
 * Check if running on Railway
 * @returns {boolean} Whether running on Railway
 */
function isRailway() {
    return PLATFORM === 'railway' || 
           !!process.env.RAILWAY_SERVICE_ID || 
           !!process.env.RAILWAY_STATIC_URL || 
           !!process.env.RAILWAY_PROJECT_ID;
}

/**
 * Check if running on any cloud platform
 * @returns {boolean} Whether running on a cloud platform
 */
function isCloudPlatform() {
    return isHeroku() || isRailway();
}

/**
 * Check if credentials data exists in environment
 * @returns {boolean} Whether credentials data exists
 */
function hasCredsData() {
    return !!process.env.CREDS_DATA;
}

/**
 * Initialize auth directory with credentials from environment if needed
 * @returns {Promise<boolean>} Success status
 */
async function initializeAuthFromEnv() {
    // Only do this on cloud platforms
    if (!isCloudPlatform()) {
        logger.debug('Not running on a cloud platform, skipping auth initialization from environment');
        return false;
    }

    // Log platform information
    if (isHeroku()) {
        logger.info('Running on Heroku platform');
    } else if (isRailway()) {
        logger.info('Running on Railway platform');
    } else {
        logger.info(`Running on cloud platform: ${PLATFORM}`);
    }

    try {
        // Check if credentials data is provided in environment
        if (!hasCredsData()) {
            logger.warn('No CREDS_DATA environment variable found');
            return false;
        }

        logger.info('Initializing auth from environment variables...');

        // Ensure auth directory exists
        ensureDirectoryExists(path.join(process.cwd(), AUTH_DIR));

        // Decode and decompress credentials data
        const credsData = process.env.CREDS_DATA;
        const jsonData = await decompressCredsData(credsData);

        if (!jsonData) {
            logger.error('Failed to decompress credentials data');
            return false;
        }

        // Write credentials file
        fs.writeFileSync(DEFAULT_CREDS_PATH, jsonData);
        
        logger.success('Auth initialized from environment variables');
        return true;
    } catch (error) {
        logger.error('Error initializing auth from environment:', error);
        return false;
    }
}

/**
 * Decompress credentials data
 * @param {string} data Compressed credentials data
 * @returns {Promise<string|null>} Decompressed data or null if error
 */
async function decompressCredsData(data) {
    try {
        // Base64 decode the data first
        const buffer = Buffer.from(data, 'base64');
        
        // Try different decompression methods
        try {
            // Method 1: Try to parse as JSON first (in case it's not compressed)
            try {
                const jsonString = buffer.toString('utf8');
                JSON.parse(jsonString); // Just to validate
                return jsonString;
            } catch (jsonError) {
                // Not valid JSON, try other methods
            }
            
            // Method 2: Try to decompress as ZIP
            try {
                const zip = new AdmZip(buffer);
                const zipEntries = zip.getEntries();
                
                // Find creds.json in the ZIP
                for (const entry of zipEntries) {
                    if (entry.entryName === 'creds.json') {
                        return entry.getData().toString('utf8');
                    }
                }
            } catch (zipError) {
                // Not a ZIP file, try next method
            }
            
            // Method 3: Try to decompress with zlib (gzip)
            try {
                const zlib = require('zlib');
                const util = require('util');
                const gunzip = util.promisify(zlib.gunzip);
                
                const decompressed = await gunzip(buffer);
                const jsonString = decompressed.toString('utf8');
                
                // Try to parse as JSON to validate
                const jsonData = JSON.parse(jsonString);
                
                // Check if it's a credentials file object format or the multi-file format
                if (jsonData.creds || jsonData['creds.json']) {
                    // It's either the direct creds object or our multi-file format
                    if (jsonData.creds) {
                        return JSON.stringify(jsonData.creds);
                    } else if (jsonData['creds.json']) {
                        return jsonData['creds.json'];
                    }
                }
                
                // Just return the whole decompressed data as a fallback
                return jsonString;
            } catch (zlibError) {
                // Not gzipped or invalid data
                logger.debug('Not a valid gzipped data:', zlibError.message);
            }
            
            // If all decompression methods failed, log and return null
            logger.warn('All decompression methods failed for credentials data');
            return null;
            
        } catch (decompressionError) {
            logger.error('Error in decompression methods:', decompressionError);
            return null;
        }
    } catch (error) {
        logger.error('Error processing credentials data:', error);
        return null;
    }
}

/**
 * Compress credentials data for transmission
 * @returns {Promise<string|null>} Compressed data as base64 string or null if error
 */
async function compressCredsData() {
    try {
        // Check if credentials file exists
        if (!fs.existsSync(DEFAULT_CREDS_PATH)) {
            logger.error('Credentials file not found');
            return null;
        }
        
        // Create a ZIP file
        const zip = new AdmZip();
        
        // Add creds.json to the ZIP
        zip.addLocalFile(DEFAULT_CREDS_PATH);
        
        // Get ZIP as buffer
        const zipBuffer = zip.toBuffer();
        
        // Return as base64 string
        return zipBuffer.toString('base64');
    } catch (error) {
        logger.error('Error compressing credentials data:', error);
        return null;
    }
}

/**
 * Get the current credentials as a compact string for transmission
 * @returns {Promise<string|null>} Credentials data or null if error
 */
async function getCredsForTransmission() {
    return await compressCredsData();
}

/**
 * Get Railway environment information
 * @returns {Object} Railway environment details
 */
function getRailwayEnvironmentInfo() {
    if (!isRailway()) {
        return { isRailway: false };
    }
    
    return {
        isRailway: true,
        serviceId: process.env.RAILWAY_SERVICE_ID || 'Not available',
        projectId: process.env.RAILWAY_PROJECT_ID || 'Not available',
        staticUrl: process.env.RAILWAY_STATIC_URL || 'Not available',
        environmentName: process.env.RAILWAY_ENVIRONMENT_NAME || 'Not available'
    };
}

/**
 * Generate Railway deployment helper info for logs
 * @returns {string} Formatted info string
 */
function getRailwayDeploymentHelperInfo() {
    if (!isRailway()) {
        return 'Not running on Railway platform';
    }
    
    const railwayInfo = getRailwayEnvironmentInfo();
    return `
Railway Deployment Information:
- Service ID: ${railwayInfo.serviceId}
- Project ID: ${railwayInfo.projectId}
- Static URL: ${railwayInfo.staticUrl}
- Environment: ${railwayInfo.environmentName}
- Node Version: ${process.version}
- Memory: ${Math.round(process.memoryUsage().rss / (1024 * 1024))} MB used

To save WhatsApp connection credentials permanently:
1. Create a CREDS_DATA environment variable in your Railway project
2. Run "node heroku-credentials-helper.js" locally after connecting to WhatsApp
3. Copy the output string to the CREDS_DATA environment variable
`;
}

module.exports = {
    isHeroku,
    isRailway,
    isCloudPlatform,
    hasCredsData,
    initializeAuthFromEnv,
    getCredsForTransmission,
    getRailwayEnvironmentInfo,
    getRailwayDeploymentHelperInfo
};