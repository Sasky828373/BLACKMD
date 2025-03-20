/**
 * File Utilities
 * Provides helper functions for file operations
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Ensure a directory exists, creating it if it doesn't
 * @param {string} dir - Directory path
 * @returns {boolean} - Whether the directory exists after the operation
 */
function ensureDirectoryExists(dir) {
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            logger.info(`Created directory: ${dir}`);
        }
        return true;
    } catch (error) {
        logger.error(`Error creating directory ${dir}:`, error);
        return false;
    }
}

/**
 * Read a JSON file with error handling
 * @param {string} filePath - Path to JSON file
 * @returns {Object|null} - Parsed JSON or null if error
 */
function readJsonFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            logger.warn(`File does not exist: ${filePath}`);
            return null;
        }
        
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        logger.error(`Error reading JSON file ${filePath}:`, error);
        return null;
    }
}

/**
 * Write a JSON file with error handling
 * @param {string} filePath - Path to JSON file
 * @param {Object} data - Data to write
 * @returns {boolean} - Whether the write was successful
 */
function writeJsonFile(filePath, data) {
    try {
        // Ensure directory exists
        const dir = path.dirname(filePath);
        ensureDirectoryExists(dir);
        
        // Write file with pretty formatting
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        logger.error(`Error writing JSON file ${filePath}:`, error);
        return false;
    }
}

/**
 * Check if a file exists
 * @param {string} filePath - Path to check
 * @returns {boolean} - Whether the file exists
 */
function fileExists(filePath) {
    return fs.existsSync(filePath);
}

/**
 * List all files in a directory
 * @param {string} dir - Directory to list
 * @param {Object} options - Options
 * @param {boolean} options.recursive - Whether to list subdirectories too
 * @param {Array} options.extensions - Array of extensions to filter by (e.g. ['.js', '.json'])
 * @returns {Array} - Array of file paths
 */
async function listFiles(dir, options = {}) {
    const results = [];
    
    try {
        if (!fs.existsSync(dir)) {
            return results;
        }
        
        const list = fs.readdirSync(dir);
        
        for (const file of list) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isDirectory() && options.recursive) {
                // Recursively list files in subdirectory
                const subResults = await listFiles(filePath, options);
                results.push(...subResults);
            } else if (stat.isFile()) {
                // Check extensions if specified
                if (options.extensions && options.extensions.length > 0) {
                    const ext = path.extname(file);
                    if (options.extensions.includes(ext)) {
                        results.push(filePath);
                    }
                } else {
                    results.push(filePath);
                }
            }
        }
    } catch (error) {
        logger.error(`Error listing files in ${dir}:`, error);
    }
    
    return results;
}

/**
 * Delete a file with error handling
 * @param {string} filePath - Path to file
 * @returns {boolean} - Whether the delete was successful
 */
function deleteFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return true; // Already doesn't exist
        }
        
        fs.unlinkSync(filePath);
        return true;
    } catch (error) {
        logger.error(`Error deleting file ${filePath}:`, error);
        return false;
    }
}

/**
 * Copy a file with error handling
 * @param {string} sourcePath - Source file
 * @param {string} destPath - Destination file
 * @returns {boolean} - Whether the copy was successful
 */
function copyFile(sourcePath, destPath) {
    try {
        if (!fs.existsSync(sourcePath)) {
            logger.warn(`Source file does not exist: ${sourcePath}`);
            return false;
        }
        
        // Ensure destination directory exists
        const destDir = path.dirname(destPath);
        ensureDirectoryExists(destDir);
        
        fs.copyFileSync(sourcePath, destPath);
        return true;
    } catch (error) {
        logger.error(`Error copying file from ${sourcePath} to ${destPath}:`, error);
        return false;
    }
}

module.exports = {
    ensureDirectoryExists,
    readJsonFile,
    writeJsonFile,
    fileExists,
    listFiles,
    deleteFile,
    copyFile
};