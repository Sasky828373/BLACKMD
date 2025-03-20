/**
 * Heroku Monitoring Utility
 * Provides specialized monitoring and status reporting for Heroku deployments
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { isHeroku } = require('./herokuHelper');

// Enable more detailed logging for tracking dyno health
const LOG_FILE = 'connection-monitor.log';
const MEMORY_CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes
const STATUS_CHECK_INTERVAL = 15 * 60 * 1000; // 15 minutes

/**
 * Start Heroku-specific monitoring
 * @param {Object} connectionManager - The WhatsApp connection manager
 */
function startHerokuMonitoring(connectionManager) {
    if (!isHeroku()) {
        return; // Only run on Heroku
    }

    logger.info('Starting Heroku-specific monitoring');

    // Monitor connection status
    monitorConnectionStatus(connectionManager);
    
    // Monitor memory usage
    monitorMemoryUsage();
    
    // Log dyno information
    logDynoInformation();
}

/**
 * Monitor WhatsApp connection status
 * @param {Object} connectionManager - WhatsApp connection manager
 */
function monitorConnectionStatus(connectionManager) {
    setInterval(() => {
        try {
            const status = connectionManager.getStatus();
            const timestamp = new Date().toISOString();
            const logEntry = {
                timestamp,
                connected: status.isConnected,
                connecting: status.isConnecting,
                loggedIn: status.isLoggedIn,
                dyno: process.env.DYNO,
                uptime: process.uptime()
            };
            
            // Append to connection log
            fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\\n');
            
            if (!status.isConnected && !status.isConnecting) {
                logger.warn('Connection check: WhatsApp is disconnected, attempting reconnection');
                // Attempt reconnection if not already connecting
                connectionManager.connect().catch(err => {
                    logger.error('Error reconnecting to WhatsApp:', err);
                });
            } else {
                logger.debug(`Connection check: WhatsApp is ${status.isConnected ? 'connected' : 'connecting'}`);
            }
        } catch (error) {
            logger.error('Error in connection monitoring:', error);
        }
    }, STATUS_CHECK_INTERVAL);
}

/**
 * Monitor memory usage to prevent OOM crashes
 */
function monitorMemoryUsage() {
    setInterval(() => {
        try {
            const memoryUsage = process.memoryUsage();
            const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100;
            const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100;
            const rssMB = Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100;
            
            logger.info(`Memory usage - Heap: ${heapUsedMB}MB/${heapTotalMB}MB, RSS: ${rssMB}MB`);
            
            // Warning if memory usage is high (Heroku has 512MB limit for eco dynos)
            if (rssMB > 400) {
                logger.warn('High memory usage detected! Consider restarting the dyno');
            }
        } catch (error) {
            logger.error('Error in memory monitoring:', error);
        }
    }, MEMORY_CHECK_INTERVAL);
}

/**
 * Log Heroku dyno information once on startup
 */
function logDynoInformation() {
    try {
        const info = {
            dyno: process.env.DYNO,
            dynoId: process.env.DYNO_ID,
            appName: process.env.HEROKU_APP_NAME,
            nodeEnv: process.env.NODE_ENV,
            platform: process.env.PLATFORM,
            nodeVersion: process.version,
            timestamp: new Date().toISOString(),
            startupTime: process.uptime()
        };
        
        logger.info('Heroku Dyno Information:', JSON.stringify(info, null, 2));
    } catch (error) {
        logger.error('Error logging dyno information:', error);
    }
}

/**
 * Check if the bot is healthy
 * @param {Object} connectionManager - The WhatsApp connection manager
 * @returns {Object} Health status object
 */
function getHealthStatus(connectionManager) {
    try {
        const status = connectionManager ? connectionManager.getStatus() : { isConnected: false };
        const memoryUsage = process.memoryUsage();
        
        return {
            status: status.isConnected ? 'healthy' : 'unhealthy',
            connected: status.isConnected,
            uptime: process.uptime(),
            memory: {
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100,
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100,
                rss: Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100
            },
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        logger.error('Error getting health status:', error);
        return {
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = {
    startHerokuMonitoring,
    getHealthStatus
};