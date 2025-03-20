/**
 * Image Optimizer Utility
 * Provides high-performance image processing and caching for faster media delivery
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const axios = require('axios');
const crypto = require('crypto');
const logger = require('./logger');

// Optimize cache settings
const CACHE_DIR = path.join(process.cwd(), 'temp', 'media_cache');
const IMAGE_CACHE = new Map(); // In-memory cache for ultra-fast access
const MAX_CACHE_ITEMS = 100;   // Maximum items in the in-memory cache
const MAX_CACHE_AGE = 3600000; // Cache lifetime: 1 hour (in ms)

// Ensure cache directory exists
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    logger.info(`Created media cache directory at ${CACHE_DIR}`);
  }
}

/**
 * Generate a cache key for a URL or file path
 * @param {string} source - URL or file path
 * @returns {string} - Cache key
 */
function generateCacheKey(source) {
  return crypto.createHash('md5').update(source).digest('hex');
}

/**
 * Get cached image if available
 * @param {string} source - Original image URL or path
 * @returns {Buffer|null} - Cached image buffer or null
 */
function getCachedImage(source) {
  const cacheKey = generateCacheKey(source);
  
  // Check in-memory cache first (fastest)
  if (IMAGE_CACHE.has(cacheKey)) {
    const cacheEntry = IMAGE_CACHE.get(cacheKey);
    
    // Check if cache is still valid
    if (Date.now() - cacheEntry.timestamp < MAX_CACHE_AGE) {
      logger.debug(`Cache hit for ${source.substring(0, 30)}... (in-memory)`);
      return cacheEntry.buffer;
    }
    
    // Remove expired cache entry
    IMAGE_CACHE.delete(cacheKey);
  }
  
  // Check file cache
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.webp`);
  if (fs.existsSync(cachePath)) {
    try {
      const stats = fs.statSync(cachePath);
      
      // Check if file cache is still valid
      if (Date.now() - stats.mtimeMs < MAX_CACHE_AGE) {
        const buffer = fs.readFileSync(cachePath);
        
        // Update in-memory cache
        IMAGE_CACHE.set(cacheKey, {
          buffer,
          timestamp: Date.now()
        });
        
        logger.debug(`Cache hit for ${source.substring(0, 30)}... (file)`);
        return buffer;
      }
      
      // Remove expired cache file
      fs.unlinkSync(cachePath);
    } catch (err) {
      logger.error(`Error reading cache file: ${err.message}`);
    }
  }
  
  return null;
}

/**
 * Cache an optimized image
 * @param {string} source - Original image URL or path
 * @param {Buffer} buffer - Optimized image buffer
 */
function cacheImage(source, buffer) {
  const cacheKey = generateCacheKey(source);
  
  // Add to in-memory cache
  IMAGE_CACHE.set(cacheKey, {
    buffer,
    timestamp: Date.now()
  });
  
  // Maintain cache size limit (LRU policy)
  if (IMAGE_CACHE.size > MAX_CACHE_ITEMS) {
    // Get oldest entry
    let oldestKey = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of IMAGE_CACHE.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }
    
    // Remove oldest entry
    if (oldestKey) {
      IMAGE_CACHE.delete(oldestKey);
    }
  }
  
  // Save to file cache
  try {
    const cachePath = path.join(CACHE_DIR, `${cacheKey}.webp`);
    fs.writeFileSync(cachePath, buffer);
  } catch (err) {
    logger.error(`Error writing cache file: ${err.message}`);
  }
}

/**
 * Optimize an image for faster sending
 * @param {string|Buffer} input - Image URL, path, or buffer
 * @param {Object} options - Optimization options
 * @param {boolean} options.useCache - Whether to use the cache
 * @param {number} options.quality - Image quality (1-100)
 * @param {number} options.maxWidth - Maximum width
 * @param {number} options.maxHeight - Maximum height
 * @returns {Promise<Buffer>} - Optimized image buffer
 */
async function optimizeImage(input, options = {}) {
  // Default options
  const {
    useCache = true,
    quality = 80,
    maxWidth = 1280,
    maxHeight = 1280,
    format = 'webp'
  } = options;
  
  ensureCacheDir();
  
  // For URL inputs, try the cache first
  if (typeof input === 'string' && input.startsWith('http') && useCache) {
    const cachedBuffer = getCachedImage(input);
    if (cachedBuffer) {
      return cachedBuffer;
    }
  }
  
  try {
    let imageBuffer;
    
    // Handle different input types
    if (Buffer.isBuffer(input)) {
      imageBuffer = input;
    } else if (typeof input === 'string') {
      if (input.startsWith('http')) {
        // Download from URL with optimized settings
        const response = await axios.get(input, { 
          responseType: 'arraybuffer',
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        imageBuffer = Buffer.from(response.data);
      } else {
        // Load from file path
        imageBuffer = fs.readFileSync(input);
      }
    } else {
      throw new Error('Invalid input type');
    }
    
    // Optimize the image
    let optimizedBuffer;
    
    if (format === 'webp') {
      optimizedBuffer = await sharp(imageBuffer)
        .resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({ quality })
        .toBuffer();
    } else if (format === 'jpeg') {
      optimizedBuffer = await sharp(imageBuffer)
        .resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality })
        .toBuffer();
    } else if (format === 'png') {
      optimizedBuffer = await sharp(imageBuffer)
        .resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .png({ quality })
        .toBuffer();
    } else {
      // Default to original format with resizing
      optimizedBuffer = await sharp(imageBuffer)
        .resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .toBuffer();
    }
    
    // Cache the result
    if (typeof input === 'string' && useCache) {
      cacheImage(input, optimizedBuffer);
    }
    
    return optimizedBuffer;
  } catch (err) {
    logger.error(`Image optimization error: ${err.message}`);
    
    // Return the original buffer/file if optimization fails
    if (Buffer.isBuffer(input)) {
      return input;
    } else if (typeof input === 'string' && !input.startsWith('http')) {
      return fs.readFileSync(input);
    }
    
    throw err;
  }
}

/**
 * Fast path for GIF URLs that don't need processing
 * This significantly speeds up GIF loading
 * @param {string} url - URL to check
 * @returns {boolean} - Whether the URL can be used directly
 */
function isOptimizedGifUrl(url) {
  // Common CDNs that serve optimized content
  const optimizedDomains = [
    'media.tenor.com',
    'media.giphy.com',
    'i.imgur.com',
    'c.tenor.com',
    'cdn.discordapp.com',
    'media1.tenor.com',
    'media2.tenor.com',
    'thumbs.gfycat.com',
    'media.discordapp.net',
    'i.tenor.com'
  ];
  
  try {
    const urlObj = new URL(url);
    return optimizedDomains.some(domain => urlObj.hostname.includes(domain));
  } catch (e) {
    return false;
  }
}

/**
 * Optimize a GIF for faster sending with fast path for optimized sources
 * @param {string|Buffer} input - GIF URL, path, or buffer
 * @param {Object} options - Optimization options
 * @returns {Promise<Buffer>} - Optimized GIF buffer
 */
async function optimizeGif(input, options = {}) {
  // Default options
  const {
    useCache = true,
    maxWidth = 400,
    maxHeight = 400,
    fps = 15,
    skipOptimization = false  // Skip optimization for fast loading
  } = options;
  
  ensureCacheDir();
  
  // FAST PATH: Skip optimization for already optimized sources
  if (typeof input === 'string' && input.startsWith('http')) {
    // Check if from optimized CDN - these GIFs are already optimized
    if (isOptimizedGifUrl(input) || skipOptimization) {
      try {
        logger.debug(`Using fast path for ${input.substring(0, 30)}...`);
        // Just download without processing
        const response = await axios.get(input, { 
          responseType: 'arraybuffer',
          timeout: 3000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        return Buffer.from(response.data);
      } catch (err) {
        // Fall back to regular optimization path on error
        logger.warn(`Fast path failed for ${input.substring(0, 30)}..., using regular optimization`);
      }
    }
    
    // Check cache for other URLs
    if (useCache) {
      const cachedBuffer = getCachedImage(input);
      if (cachedBuffer) {
        return cachedBuffer;
      }
    }
  }
  
  // Regular optimization path
  try {
    let gifBuffer;
    
    if (Buffer.isBuffer(input)) {
      gifBuffer = input;
    } else if (typeof input === 'string') {
      if (input.startsWith('http')) {
        const response = await axios.get(input, { 
          responseType: 'arraybuffer',
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        gifBuffer = Buffer.from(response.data);
      } else {
        gifBuffer = fs.readFileSync(input);
      }
    } else {
      throw new Error('Invalid input type');
    }
    
    // Use WebP for animated GIFs - more efficient but requires processing
    const optimizedBuffer = await sharp(gifBuffer, { animated: true })
      .resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ 
        quality: 70,    // Slightly lower quality for faster processing
        effort: 3,      // Lower value is faster (1-6 scale)
        animation: { 
          fps
        } 
      })
      .toBuffer();
    
    // Cache the result
    if (typeof input === 'string' && useCache) {
      cacheImage(input, optimizedBuffer);
    }
    
    return optimizedBuffer;
  } catch (err) {
    logger.error(`GIF optimization error: ${err.message}`);
    
    // Return the original buffer/file if optimization fails
    if (Buffer.isBuffer(input)) {
      return input;
    } else if (typeof input === 'string' && !input.startsWith('http')) {
      return fs.readFileSync(input);
    }
    
    throw err;
  }
}

/**
 * Clear expired cache items
 */
function clearExpiredCache() {
  // Clear in-memory cache
  for (const [key, entry] of IMAGE_CACHE.entries()) {
    if (Date.now() - entry.timestamp > MAX_CACHE_AGE) {
      IMAGE_CACHE.delete(key);
    }
  }
  
  // Clear file cache
  try {
    const files = fs.readdirSync(CACHE_DIR);
    for (const file of files) {
      const filePath = path.join(CACHE_DIR, file);
      const stats = fs.statSync(filePath);
      
      if (Date.now() - stats.mtimeMs > MAX_CACHE_AGE) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (err) {
    logger.error(`Error clearing cache: ${err.message}`);
  }
}

// Clear expired cache every hour
setInterval(clearExpiredCache, 3600000);

// Initialize cache directory on module load
ensureCacheDir();

module.exports = {
  optimizeImage,
  optimizeGif,
  getCachedImage,
  clearExpiredCache
};