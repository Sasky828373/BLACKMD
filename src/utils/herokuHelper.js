/**
 * Heroku Helper Utility
 * Provides utilities for Heroku deployment, including credential management
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
    // Only do this on Heroku
    if (!isHeroku()) {
        logger.debug('Not running on Heroku, skipping auth initialization from environment');
        return false;
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
        
        // Try to parse as JSON first (in case it's not compressed)
        try {
            const jsonString = buffer.toString('utf8');
            JSON.parse(jsonString); // Just to validate
            return jsonString;
        } catch (jsonError) {
            // Not valid JSON, try to decompress
            try {
                // Try to decompress as ZIP
                const zip = new AdmZip(buffer);
                const zipEntries = zip.getEntries();
                
                // Find creds.json in the ZIP
                for (const entry of zipEntries) {
                    if (entry.entryName === 'creds.json') {
                        return entry.getData().toString('utf8');
                    }
                }
                
                logger.warn('No creds.json found in compressed data');
                return null;
            } catch (zipError) {
                logger.error('Error decompressing ZIP data:', zipError);
                // Not a ZIP file either, return null
                return null;
            }
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

module.exports = {
    isHeroku,
    hasCredsData,
    initializeAuthFromEnv,
    getCredsForTransmission
};