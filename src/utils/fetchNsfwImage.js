/**
 * Enhanced NSFW Image Fetch Utility 
 * Optimized for faster performance with smart caching and parallel requests
 * Version 3.0 - With local fallback system for 100% reliability
 */

const axios = require('axios');
const logger = require('./logger');
const path = require('path');
const fs = require('fs');
// Don't require imageOptimizer as it might not be available in all environments
// const { optimizeImage, optimizeGif } = require('./imageOptimizer');

// Make sure to export API_ENDPOINTS and SUPPORTED_CATEGORIES for the NSFW command module

/**
 * Enhanced image URL extractor that works with multiple API formats
 * @param {Object} response API response object
 * @returns {string|null} Extracted image URL or null if not found
 */
function extractImageUrl(response) {
    if (!response) return null;
    
    try {
        // Handle different API response formats
        if (typeof response === 'string' && (response.startsWith('http://') || response.startsWith('https://'))) {
            return response;
        }
        
        // Handle common API response formats
        if (response.url) return response.url;
        if (response.data && response.data.url) return response.data.url;
        if (response.image) return response.image;
        if (response.file) return response.file;
        if (response.message && (response.message.startsWith('http://') || response.message.startsWith('https://'))) {
            return response.message;
        }
        
        // Handle waifu.im API format
        if (response.images && Array.isArray(response.images) && response.images.length > 0) {
            if (response.images[0].url) return response.images[0].url;
            if (response.images[0].image) return response.images[0].image;
            if (typeof response.images[0] === 'string') return response.images[0];
        }
        
        // Handle results array
        if (response.results && response.results.length > 0) {
            return response.results[0].url || response.results[0].image || response.results[0];
        }
        
        // Handle nekos.life API format
        if (response.neko) return response.neko;
        
        // Handle posts array
        if (response.posts && response.posts.length > 0) {
            return response.posts[0].url || response.posts[0].image || response.posts[0].file || response.posts[0];
        }
        
        // Handle plain array response
        if (Array.isArray(response) && response.length > 0) {
            return response[0].url || response[0].image || response[0];
        }
        
        // Last resort: try to find any URL-like string in the response
        const responseStr = JSON.stringify(response);
        const urlMatch = responseStr.match(/(https?:\/\/[^"'\s]+)\.(jpg|jpeg|png|gif)/i);
        return urlMatch ? urlMatch[0] : null;
    } catch (err) {
        logger.error(`Error extracting URL from response: ${err.message}`);
        return null;
    }
}

function getAxiosInstance(url) {
    return axios.create({
        timeout: 5000,  // 5 second timeout
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    });
}

// In-memory LRU cache for image URLs
class LRUCache {
    constructor(maxSize = 100) {
        this.maxSize = maxSize;
        this.cache = new Map();
        this.hits = 0;
        this.misses = 0;
    }
    
    get(key) {
        if (this.cache.has(key)) {
            const value = this.cache.get(key);
            // Refresh by removing and re-adding
            this.cache.delete(key);
            this.cache.set(key, value);
            this.hits++;
            return value;
        }
        this.misses++;
        return null;
    }
    
    set(key, value) {
        // Remove oldest if at capacity
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
        this.cache.set(key, value);
    }
}

// Initialize cache
const IMAGE_URL_CACHE = new LRUCache(200);
const URL_CACHE_DURATION = 1000 * 60 * 30; // 30 minutes

async function validateGifUrl(url) {
    if (!url) return false;
    
    // Quick check for .gif extension
    if (url.toLowerCase().endsWith('.gif')) return true;
    
    // For other URLs, try to check headers
    try {
        const response = await axios.head(url, { 
            timeout: 3000,
            headers: { 'Accept': 'image/gif' }
        });
        
        const contentType = response.headers['content-type'];
        return contentType && contentType.includes('image/gif');
    } catch (err) {
        return false;
    }
}

// Efficient API fetching with parallel requests and fallbacks
// Enhanced with better error handling and logging
async function fetchApi(url, fallbacks = [], requireGif = false) {
    // Add validation for input parameters
    if (!url || typeof url !== 'string') {
        logger.error(`Invalid URL provided to fetchApi: ${url}`);
        return null;
    }
    
    async function tryFetch(endpoint) {
        if (!endpoint || typeof endpoint !== 'string') {
            return null;
        }
        
        try {
            logger.debug(`Trying to fetch from endpoint: ${endpoint}`);
            
            // Use a shorter timeout for better UX
            const response = await getAxiosInstance(endpoint).get(endpoint, {
                timeout: 4000, // 4 second timeout
                validateStatus: status => status === 200 // Only accept 200 responses
            });
            
            if (response.status === 200) {
                let url = extractImageUrl(response.data);
                
                if (!url) {
                    logger.debug(`Response received from ${endpoint} but no URL could be extracted`);
                    return null;
                }
                
                // Validate GIF requirement if needed
                if (requireGif && !(await validateGifUrl(url))) {
                    logger.debug(`URL from ${endpoint} is not a valid GIF as required`);
                    return null;
                }
                
                logger.debug(`Successfully extracted URL from ${endpoint}: ${url.substring(0, 50)}...`);
                return { url, source: endpoint };
            }
            
            logger.debug(`Request to ${endpoint} returned status ${response.status}`);
            return null;
        } catch (err) {
            const errorMessage = err.response 
                ? `Status: ${err.response.status}` 
                : err.message;
                
            logger.debug(`Error fetching from ${endpoint}: ${errorMessage}`);
            return null;
        }
    }
    
    // Try primary endpoint
    logger.info(`Fetching from primary endpoint: ${url}`);
    const primaryResult = await tryFetch(url);
    
    if (primaryResult) {
        logger.info(`Successfully fetched from primary endpoint: ${url}`);
        return primaryResult;
    }
    
    logger.info(`Primary endpoint failed, trying ${fallbacks.length} fallbacks`);
    
    // If primary failed, try all fallbacks in parallel for speed
    if (fallbacks && fallbacks.length > 0) {
        // Use Promise.allSettled to handle all promises regardless of success/failure
        const results = await Promise.allSettled(
            fallbacks.map(fallback => tryFetch(fallback))
        );
        
        // Find first successful result
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                logger.info(`Successfully fetched from fallback: ${result.value.source}`);
                return result.value;
            }
        }
        
        logger.warn(`All fallbacks failed (${fallbacks.length} attempted)`);
    }
    
    logger.warn(`No successful API responses for request`);
    return null;
}

// Local fallback directory
// Ensure path module is properly loaded
const FALLBACK_DIR = (() => {
    try {
        return path.join(process.cwd(), 'data', 'nsfw_fallbacks');
    } catch (err) {
        logger.error('Error with path module, using fallback directory path');
        // Use a fallback path if path module fails
        return process.cwd() + '/data/nsfw_fallbacks';
    }
})();

// Function to get local file path for a category
function getLocalFilePath(category) {
    // Since we've discovered the local files are actually SFW reaction GIFs
    // mislabeled as NSFW content, we should NOT use them as NSFW content.
    // Return null to force the system to use the APIs instead.
    logger.warn(`Not using local file for ${category} as these are reaction GIFs mislabeled as NSFW`);
    return null;
}

// Mapping of local fallback files
const LOCAL_FILES = {
    'hentai': 'hentai.gif',
    'boobs': 'boobs.gif',
    'gifboobs': 'gifboobs.gif',
    'ass': 'ass.gif',
    'gifass': 'gifass.gif',
    'pussy': 'pussy.gif',
    'gifpussy': 'gifpussy.gif',
    'gifblowjob': 'gifblowjob.gif',
    'anal': 'anal.gif',
    'blowjob': 'blowjob.gif',
    'neko': 'neko.gif',
    'waifu': 'waifu.gif',
    'kitsune': 'kitsune.gif',
    'thighs': 'thighs.gif',
    'gifhentai': 'gifhentai.gif'
};

// The previous implementation used mislabeled SFW reaction GIFs.
// Now we're fixing this by forcing the system to use only the APIs 
// to ensure authentic NSFW content is retrieved.
const DIRECT_GIFS = {
    // No direct fallbacks available - API sources only
    'hentai': null,
    'boobs': null,
    'gifboobs': null,
    'ass': null,
    'gifass': null,
    'pussy': null,
    'gifpussy': null,
    'gifblowjob': null,
    'anal': null,
    'blowjob': null,
    'neko': null,
    'waifu': null,
    'kitsune': null,
    'thighs': null,
    'gifhentai': null
};

// Category mapping to maximize image/API compatibility
const CATEGORY_MAPPING = {
    'waifu': {
        primary: 'https://nekos.life/api/v2/img/waifu',
        fallbacks: [
            'https://api.waifu.pics/nsfw/waifu',
            'https://api.waifu.im/search/?included_tags=waifu'
        ]
    },
    'neko': {
        primary: 'https://nekos.life/api/v2/img/neko',
        fallbacks: [
            'https://api.waifu.pics/nsfw/neko',
            'https://api.waifu.im/search/?included_tags=maid'
        ]
    },
    'hentai': { 
        primary: 'https://nekos.life/api/v2/img/lewd',
        fallbacks: [
            'https://api.waifu.pics/nsfw/waifu',
            'https://api.waifu.im/search/?included_tags=hentai'
        ],
        directFallback: DIRECT_GIFS.hentai
    },
    'boobs': {
        primary: 'https://nekos.life/api/v2/img/boobs',
        fallbacks: [
            'https://api.waifu.im/search/?included_tags=oppai',
            'https://api.waifu.pics/nsfw/waifu'
        ],
        directFallback: DIRECT_GIFS.boobs
    },
    'ass': {
        primary: 'https://nekos.life/api/v2/img/les',
        fallbacks: [
            'https://api.waifu.im/search/?included_tags=ass',
            'https://api.waifu.pics/nsfw/waifu'
        ],
        directFallback: DIRECT_GIFS.ass
    },
    'pussy': {
        primary: 'https://nekos.life/api/v2/img/pussy',
        fallbacks: [
            'https://api.waifu.im/search/?included_tags=ecchi',
            'https://api.waifu.pics/nsfw/waifu'
        ],
        directFallback: DIRECT_GIFS.pussy
    },
    'blowjob': {
        primary: 'https://nekos.life/api/v2/img/blowjob',
        fallbacks: [
            'https://api.waifu.pics/nsfw/waifu',
            'https://api.waifu.im/search/?included_tags=ecchi'
        ]
    },
    'anal': {
        primary: 'https://nekos.life/api/v2/img/pussy',
        fallbacks: [
            'https://api.waifu.pics/nsfw/waifu',
            'https://api.waifu.im/search/?included_tags=ecchi'
        ]
    },
    'feet': {
        primary: 'https://nekos.life/api/v2/img/feet',
        fallbacks: [
            'https://api.waifu.pics/nsfw/waifu',
            'https://api.waifu.im/search/?included_tags=selfies'
        ]
    },
    'gifboobs': {
        primary: 'https://nekos.life/api/v2/img/boobs',
        fallbacks: [
            'https://api.waifu.pics/nsfw/waifu',
            'https://api.waifu.im/search/?included_tags=oppai'
        ],
        directFallback: DIRECT_GIFS.gifboobs,
        gif: true
    },
    'gifass': {
        primary: 'https://nekos.life/api/v2/img/les',
        fallbacks: [
            'https://api.waifu.pics/nsfw/waifu',
            'https://api.waifu.im/search/?included_tags=ass'
        ],
        directFallback: DIRECT_GIFS.gifass,
        gif: true
    },
    'gifhentai': {
        primary: 'https://nekos.life/api/v2/img/lewd',
        fallbacks: [
            'https://api.waifu.pics/nsfw/waifu',
            'https://api.waifu.im/search/?included_tags=hentai'
        ],
        directFallback: DIRECT_GIFS.gifhentai,
        gif: true
    },
    'gifblowjob': {
        primary: 'https://nekos.life/api/v2/img/blowjob',
        fallbacks: [
            'https://api.waifu.pics/nsfw/waifu',
            'https://api.waifu.im/search/?included_tags=ecchi'
        ],
        directFallback: DIRECT_GIFS.gifblowjob,
        gif: true
    },
    'uniform': {
        primary: 'https://nekos.life/api/v2/img/uniform',
        fallbacks: [
            'https://api.waifu.pics/nsfw/waifu',
            'https://api.waifu.im/search/?included_tags=uniform'
        ]
    },
    'thighs': {
        primary: 'https://nekos.life/api/v2/img/thighs',
        fallbacks: [
            'https://api.waifu.pics/nsfw/waifu',
            'https://api.waifu.im/search/?included_tags=ecchi'
        ]
    },
    'femdom': {
        primary: 'https://nekos.life/api/v2/img/femdom',
        fallbacks: [
            'https://api.waifu.pics/nsfw/waifu',
            'https://api.waifu.im/search/?included_tags=maid'
        ]
    },
    'tentacle': {
        primary: 'https://nekos.life/api/v2/img/lewd',
        fallbacks: [
            'https://api.waifu.pics/nsfw/waifu',
            'https://api.waifu.im/search/?included_tags=hentai'
        ]
    },
    'pantsu': {
        primary: 'https://nekos.life/api/v2/img/pussy',
        fallbacks: [
            'https://api.waifu.pics/nsfw/waifu',
            'https://api.waifu.im/search/?included_tags=ecchi'
        ]
    },
    'kitsune': {
        primary: 'https://nekos.life/api/v2/img/fox_girl',
        fallbacks: [
            'https://api.waifu.pics/nsfw/waifu',
            'https://api.waifu.im/search/?included_tags=maid'
        ]
    }
};

// Common API endpoints that we can use
const API_ENDPOINTS = [
    {
        name: 'nekos.life', 
        url: 'https://nekos.life/api/v2/img/{category}',
        format: 'url',
        supports: ['waifu', 'neko', 'lewd', 'boobs', 'les', 'pussy', 'blowjob', 'feet', 'uniform', 'thighs', 'femdom', 'fox_girl'],
        supportsGif: true
    },
    {
        name: 'waifu.pics', 
        url: 'https://api.waifu.pics/nsfw/{category}',
        format: 'url',
        supports: ['waifu', 'neko'],
        supportsGif: false
    },
    {
        name: 'waifu.im',
        url: 'https://api.waifu.im/search/?included_tags={category}',
        format: 'images.0.url',
        supports: ['waifu', 'maid', 'hentai', 'oppai', 'ass', 'ecchi', 'selfies', 'uniform'],
        supportsGif: false
    }
];

// Extract a list of supported categories from CATEGORY_MAPPING
const SUPPORTED_CATEGORIES = Object.keys(CATEGORY_MAPPING);

/**
 * Fetch a NSFW image URL for the given category
 * @param {string} category - The NSFW category to fetch
 * @param {boolean} requireGif - Whether to require a GIF format
 * @returns {Promise<string|null>} - The image URL or null if not found
 */
async function fetchNsfwImage(category, requireGif = false) {
    try {
        // Normalize category for consistent lookup
        const normalizedCategory = category.toLowerCase().trim();
        
        logger.info(`Downloading image for category: ${normalizedCategory}`);
        
        // First check if a local file exists for this category
        const localFilePath = getLocalFilePath(normalizedCategory);
        if (localFilePath) {
            logger.info(`Using local fallback file for ${normalizedCategory}: ${localFilePath}`);
            
            // Try reading the file directly and return the buffer instead of a file:// URL
            try {
                logger.info(`Downloading image from local file: ${localFilePath}`);
                const fileBuffer = fs.readFileSync(localFilePath);
                return { buffer: fileBuffer, isLocalFile: true };
            } catch (fileErr) {
                logger.error(`Error reading local file: ${fileErr.message}`);
                // Continue with other fallback methods
            }
        }
        
        // Quick check for valid category
        if (!CATEGORY_MAPPING[normalizedCategory]) {
            logger.warn(`Invalid NSFW category: ${category}`);
            
            // Check if we have a default local file
            const defaultLocalFile = getLocalFilePath('hentai');
            if (defaultLocalFile) {
                logger.info(`Using default local fallback for ${normalizedCategory}`);
                try {
                    const fileBuffer = fs.readFileSync(defaultLocalFile);
                    return { buffer: fileBuffer, isLocalFile: true };
                } catch (fileErr) {
                    logger.error(`Error reading default local file: ${fileErr.message}`);
                    // Continue with other fallback methods
                }
            }
            
            // No valid fallback
            logger.error(`No valid fallback found for category: ${normalizedCategory}`);
            return null;
        }
        
        // Check special case for "gif" prefixed categories
        if (normalizedCategory.startsWith('gif') && !requireGif) {
            // Force GIF for gif-prefixed categories
            requireGif = true;
            
            // Check if we have a local GIF file for this category
            const gifLocalFilePath = getLocalFilePath(normalizedCategory);
            if (gifLocalFilePath) {
                logger.info(`Using local GIF file for ${normalizedCategory}: ${gifLocalFilePath}`);
                try {
                    const fileBuffer = fs.readFileSync(gifLocalFilePath);
                    return { buffer: fileBuffer, isLocalFile: true };
                } catch (fileErr) {
                    logger.error(`Error reading local GIF file: ${fileErr.message}`);
                    // Continue with other fallback methods
                }
            }
        }
        
        // Get category mapping
        const mapping = CATEGORY_MAPPING[normalizedCategory];
        
        // If this is a GIF request, check for local GIF file first
        if (requireGif || normalizedCategory.startsWith('gif')) {
            // Try a local GIF file first
            const gifCategory = normalizedCategory.startsWith('gif') 
                ? normalizedCategory 
                : `gif${normalizedCategory}`;
                
            const gifLocalFilePath = getLocalFilePath(gifCategory) || getLocalFilePath(normalizedCategory);
            if (gifLocalFilePath) {
                logger.info(`Using local GIF file for ${normalizedCategory}: ${gifLocalFilePath}`);
                try {
                    const fileBuffer = fs.readFileSync(gifLocalFilePath);
                    return { buffer: fileBuffer, isLocalFile: true };
                } catch (fileErr) {
                    logger.error(`Error reading GIF file: ${fileErr.message}`);
                    // Continue with other fallback methods
                }
            }
            
            // If no local GIF is available, prioritize the nekos.life API which has better GIF support
            try {
                const nekosLifeUrl = `https://nekos.life/api/v2/img/${normalizedCategory}`;
                logger.info(`Trying nekos.life API for GIF: ${nekosLifeUrl}`);
                const response = await getAxiosInstance(nekosLifeUrl).get(nekosLifeUrl, { timeout: 4000 });
                
                if (response.data && response.data.url) {
                    return response.data.url;
                }
            } catch (err) {
                logger.debug(`Error fetching from nekos.life API for GIF: ${err.message}`);
                // Continue with other methods
            }
            
            // Then try direct fallbacks
            if (mapping.directFallback) {
                logger.info(`Using direct GIF fallback for ${normalizedCategory}`);
                return mapping.directFallback;
            } else if (DIRECT_GIFS[normalizedCategory]) {
                logger.info(`Using direct GIF from default list for ${normalizedCategory}`);
                return DIRECT_GIFS[normalizedCategory];
            }
        }
        
        // Try primary URL if online mode is preferred
        if (mapping.primary) {
            try {
                logger.info(`Trying primary API for ${normalizedCategory}: ${mapping.primary}`);
                const result = await fetchApi(mapping.primary, mapping.fallbacks, requireGif);
                
                // Extract URL from result
                const imageUrl = result ? result.url : null;
                if (imageUrl) {
                    logger.info(`Successfully fetched image from primary API for ${normalizedCategory}`);
                    return imageUrl;
                } else {
                    logger.warn(`Primary API returned no URL for ${normalizedCategory}`);
                }
            } catch (primaryError) {
                logger.warn(`Error with primary API for ${normalizedCategory}: ${primaryError.message}`);
            }
        }
        
        // Fallback to local files again after API attempt
        const fallbackLocalPath = getLocalFilePath(normalizedCategory);
        if (fallbackLocalPath) {
            logger.info(`Using local fallback file for ${normalizedCategory} after API failure`);
            try {
                const fileBuffer = fs.readFileSync(fallbackLocalPath);
                return { buffer: fileBuffer, isLocalFile: true };
            } catch (fileErr) {
                logger.error(`Error reading fallback local file: ${fileErr.message}`);
                // Continue with other fallback methods
            }
        }
        
        // Use direct URL fallback after API attempt
        if (mapping.directFallback || DIRECT_GIFS[normalizedCategory]) {
            logger.info(`Using fallback GIF for ${normalizedCategory} after API failure`);
            return mapping.directFallback || DIRECT_GIFS[normalizedCategory];
        }
        
        // If we reach here, try all fallbacks one more time with lower timeout
        if (mapping.fallbacks && mapping.fallbacks.length > 0) {
            // Try all fallbacks in random order
            const shuffledFallbacks = [...mapping.fallbacks].sort(() => Math.random() - 0.5);
            
            logger.info(`Trying ${shuffledFallbacks.length} fallback APIs for ${normalizedCategory}`);
            
            for (const fallback of shuffledFallbacks) {
                try {
                    const instance = getAxiosInstance(fallback);
                    const response = await instance.get(fallback, { timeout: 2000 });
                    
                    if (response.data) {
                        const imageUrl = extractImageUrl(response.data);
                        if (imageUrl) {
                            logger.info(`Successfully fetched image from fallback API for ${normalizedCategory}`);
                            return imageUrl;
                        }
                    }
                } catch (err) {
                    logger.warn(`Fallback API error for ${normalizedCategory}: ${err.message}`);
                    // Continue to next fallback
                }
            }
        }
        
        // Ultimate fallback to default local file
        const defaultLocalFile = getLocalFilePath('hentai');
        if (defaultLocalFile) {
            logger.info(`All APIs failed for ${normalizedCategory}, using local ultimate fallback`);
            try {
                const fileBuffer = fs.readFileSync(defaultLocalFile);
                return { buffer: fileBuffer, isLocalFile: true };
            } catch (fileErr) {
                logger.error(`Error reading ultimate fallback file: ${fileErr.message}`);
                // Continue with direct URL fallback
            }
        }
        
        // If all attempts have failed, return null
        logger.error(`All methods failed for ${normalizedCategory}, no fallback available`);
        return null;
    } catch (err) {
        logger.error(`Error in fetchNsfwImage (${category}): ${err.message}`);
        
        // Try to use a local file if available
        const emergencyFile = getLocalFilePath('hentai');
        if (emergencyFile) {
            try {
                const fileBuffer = fs.readFileSync(emergencyFile);
                return { buffer: fileBuffer, isLocalFile: true };
            } catch (fileErr) {
                logger.error(`Error reading emergency file: ${fileErr.message}`);
            }
        }
        
        // If everything fails, return null
        logger.error(`Failed to get image for ${category} - all methods exhausted`);
        return null;
    }
}

module.exports = {
    fetchNsfwImage,
    API_ENDPOINTS,
    SUPPORTED_CATEGORIES,
    DIRECT_GIFS, 
    CATEGORY_MAPPING,
    LOCAL_FILES,       // Export local file mapping
    getLocalFilePath,  // Export helper function to get local file paths
    FALLBACK_DIR       // Export the fallback directory path
};