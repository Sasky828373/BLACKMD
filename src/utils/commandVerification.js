/**
 * Command Verification Utility
 * This module helps verify that all command modules are properly loaded
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const logger = require('./logger');

/**
 * Get all available command files in the commands directory
 * @returns {Promise<Array<string>>} Array of command file paths
 */
async function getAvailableCommandFiles() {
    try {
        const commandsDir = path.join(process.cwd(), 'src', 'commands');
        const dirEntries = await readdir(commandsDir);
        const filePaths = [];
        
        for (const entry of dirEntries) {
            const entryPath = path.join(commandsDir, entry);
            const stats = await stat(entryPath);
            
            if (stats.isFile() && entry.endsWith('.js') && !entry.endsWith('.bak') && !entry.startsWith('_')) {
                filePaths.push(entryPath);
            } else if (stats.isDirectory()) {
                const subDirFiles = await readdir(entryPath);
                for (const subFile of subDirFiles) {
                    if (subFile.endsWith('.js') && !subFile.endsWith('.bak') && !subFile.startsWith('_')) {
                        filePaths.push(path.join(entryPath, subFile));
                    }
                }
            }
        }
        
        return filePaths;
    } catch (error) {
        logger.error(`Error getting command files: ${error.message}`);
        return [];
    }
}

/**
 * Verify command modules against loaded commands
 * @param {Map} loadedCommands - Map of loaded command names to handlers
 * @returns {Promise<Object>} Verification results
 */
async function verifyCommands(loadedCommands) {
    const availableFiles = await getAvailableCommandFiles();
    const expectedCommandCount = availableFiles.length;
    const actualCommandCount = loadedCommands ? loadedCommands.size : 0;
    const loadPercentage = expectedCommandCount > 0 
        ? Math.round((actualCommandCount / expectedCommandCount) * 100) 
        : 0;
    
    return {
        availableFiles,
        expectedCommandCount,
        actualCommandCount,
        loadPercentage,
        isFullyLoaded: loadPercentage >= 90, // Consider "fully loaded" if 90% or more commands loaded
        missingFiles: availableFiles.length - actualCommandCount
    };
}

/**
 * Load a specific command module for testing
 * @param {string} filePath - Path to command module
 * @returns {Promise<Object|null>} Loaded module or null if failed
 */
async function testLoadCommandModule(filePath) {
    try {
        // Clear require cache for this file to ensure fresh load
        delete require.cache[require.resolve(filePath)];
        
        // Try loading the module
        const module = require(filePath);
        
        // Check if it has the expected structure
        const hasCommands = module && typeof module.commands === 'object';
        const hasInit = module && typeof module.init === 'function';
        
        return {
            path: filePath,
            loaded: true,
            hasCommands,
            hasInit,
            commandCount: hasCommands ? Object.keys(module.commands).length : 0,
            structure: module ? Object.keys(module) : []
        };
    } catch (error) {
        return {
            path: filePath,
            loaded: false,
            error: error.message
        };
    }
}

/**
 * Test load all command modules
 * @returns {Promise<Array>} Results of loading each module
 */
async function testLoadAllModules() {
    const files = await getAvailableCommandFiles();
    const results = [];
    
    for (const file of files) {
        results.push(await testLoadCommandModule(file));
    }
    
    return {
        totalFiles: files.length,
        successfulLoads: results.filter(r => r.loaded).length,
        failedLoads: results.filter(r => !r.loaded).length,
        details: results
    };
}

module.exports = {
    getAvailableCommandFiles,
    verifyCommands,
    testLoadCommandModule,
    testLoadAllModules
};