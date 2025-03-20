/**
 * Command Performance Optimizer
 * This module enhances command performance by preloading and caching assets
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { optimizeGif, optimizeImage } = require('./utils/imageOptimizer');
const logger = require('./utils/logger');

// Size-limited LRU cache for media assets
class LRUCache {
  constructor(maxSize = 50, name = 'default') {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.name = name;
    this.hits = 0;
    this.misses = 0;
    logger.info(`Initialized ${name} cache with capacity: ${maxSize}`);
  }

  get(key) {
    if (!this.cache.has(key)) {
      this.misses++;
      return null;
    }
    
    // Move to most recently used position
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    this.hits++;
    return value;
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry (first key in map)
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, value);
  }

  getStatistics() {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total * 100).toFixed(2) : 0;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: `${hitRate}%`
    };
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

// Initialize caches for different asset types
const GIF_CACHE = new LRUCache(25, 'reaction_gif');
const IMAGE_CACHE = new LRUCache(50, 'image');
const STICKER_CACHE = new LRUCache(20, 'sticker');

/**
 * Preload a GIF file into memory for faster access
 * @param {string} filePath - Path to the GIF file
 * @param {Object} options - Optimization options
 * @returns {Promise<Buffer>} - Optimized GIF buffer
 */
async function preloadGif(filePath, options = {}) {
  try {
    const fileHash = crypto.createHash('md5').update(filePath).digest('hex');
    
    // Check if already in cache
    const cached = GIF_CACHE.get(fileHash);
    if (cached) {
      return cached;
    }
    
    // Read and optimize
    const buffer = await fs.promises.readFile(filePath);
    const optimized = await optimizeGif(buffer, {
      maxWidth: options.maxWidth || 400,
      maxHeight: options.maxHeight || 400,
      fps: options.fps || 15,
      useCache: true
    });
    
    // Cache the result
    GIF_CACHE.set(fileHash, optimized);
    logger.debug(`Preloaded and optimized GIF: ${path.basename(filePath)}`);
    
    return optimized;
  } catch (error) {
    logger.error(`Error preloading GIF ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Preload multiple GIFs from a directory
 * @param {string} directory - Directory containing GIFs
 * @param {Array<string>} priorityFiles - Files to prioritize loading
 * @returns {Promise<number>} - Number of successfully preloaded GIFs
 */
async function preloadGifsFromDirectory(directory, priorityFiles = []) {
  try {
    if (!fs.existsSync(directory)) {
      logger.warn(`GIF directory does not exist: ${directory}`);
      return 0;
    }
    
    let files = await fs.promises.readdir(directory);
    files = files.filter(file => file.endsWith('.gif'));
    
    // Put priority files first
    if (priorityFiles.length > 0) {
      files.sort((a, b) => {
        const aIsPriority = priorityFiles.includes(a.replace('.gif', ''));
        const bIsPriority = priorityFiles.includes(b.replace('.gif', ''));
        if (aIsPriority && !bIsPriority) return -1;
        if (!aIsPriority && bIsPriority) return 1;
        return 0;
      });
    }
    
    logger.info(`Preloading ${files.length} GIFs from ${directory}...`);
    
    // Limit to first 10 GIFs initially for faster startup
    const initialFiles = files.slice(0, 10);
    let loadedCount = 0;
    
    // Load initial files in parallel
    await Promise.all(initialFiles.map(async (file) => {
      const filePath = path.join(directory, file);
      const result = await preloadGif(filePath);
      if (result) loadedCount++;
    }));
    
    // Schedule remaining files to load in background
    if (files.length > 10) {
      setTimeout(async () => {
        const remainingFiles = files.slice(10);
        for (const file of remainingFiles) {
          const filePath = path.join(directory, file);
          await preloadGif(filePath);
          // Small delay to prevent blocking the main thread
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        logger.info(`Background loading complete. Total GIFs loaded: ${GIF_CACHE.cache.size}`);
      }, 5000); // Start background loading after 5 seconds
    }
    
    return loadedCount;
  } catch (error) {
    logger.error(`Error preloading GIFs: ${error.message}`);
    return 0;
  }
}

/**
 * Get an optimized version of a GIF, from cache if available
 * @param {string} filePath - Path to the GIF file
 * @returns {Promise<Buffer>} - Optimized GIF buffer
 */
async function getOptimizedGif(filePath) {
  try {
    const fileHash = crypto.createHash('md5').update(filePath).digest('hex');
    
    // Check if already in cache
    const cached = GIF_CACHE.get(fileHash);
    if (cached) {
      return cached;
    }
    
    // Not in cache, load and optimize
    return await preloadGif(filePath);
  } catch (error) {
    logger.error(`Error getting optimized GIF: ${error.message}`);
    // Fall back to just reading the file
    return fs.promises.readFile(filePath);
  }
}

/**
 * Get cache statistics for monitoring
 * @returns {Object} - Cache statistics
 */
function getCacheStatistics() {
  return {
    gif: GIF_CACHE.getStatistics(),
    image: IMAGE_CACHE.getStatistics(),
    sticker: STICKER_CACHE.getStatistics()
  };
}

/**
 * Clear all caches (used for memory management)
 */
function clearAllCaches() {
  GIF_CACHE.clear();
  IMAGE_CACHE.clear();
  STICKER_CACHE.clear();
  logger.info('All media caches cleared');
}

// Export the API
module.exports = {
  preloadGif,
  preloadGifsFromDirectory,
  getOptimizedGif,
  getCacheStatistics,
  clearAllCaches,
  GIF_CACHE,
  IMAGE_CACHE,
  STICKER_CACHE
};