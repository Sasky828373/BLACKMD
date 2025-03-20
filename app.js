// Heroku entry point
const fs = require('fs');
const { execSync } = require('child_process');

console.log('Starting WhatsApp Bot on Heroku...');

// Check Node.js version
const currentVersion = process.version;
console.log(`Current Node.js version: ${currentVersion}`);

// Check if we're running on Heroku
const isHeroku = process.env.DYNO ? true : false;
console.log(`Running on Heroku: ${isHeroku}`);

// If running on Heroku, check for system dependencies
if (isHeroku) {
  try {
    // Install any missing system dependencies
    console.log('Installing system dependencies...');
    execSync('apt-get update && apt-get install -y libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev g++ build-essential');
    console.log('System dependencies installed successfully');
  } catch (error) {
    console.error('Failed to install system dependencies:', error.message);
  }
}

// Start the main application
require('./src/index.js');