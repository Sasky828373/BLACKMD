/**
 * Post-Deployment Check Script for Heroku
 * Run automatically after deployment to verify environment setup
 */

console.log('Running post-deployment check for Heroku...');

// Function to verify required environment variables
function checkRequiredEnvVars() {
    const requiredVars = [
        'PLATFORM',
        'NODE_ENV',
        'CREDS_DATA',
        'OWNER_NUMBER'
    ];
    
    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
        console.error('❌ CRITICAL: Missing required environment variables:');
        missing.forEach(varName => {
            console.error(`   - ${varName}`);
        });
        
        if (missing.includes('CREDS_DATA')) {
            console.error('\n⚠️ CREDS_DATA is missing. Your bot will not be able to connect to WhatsApp.');
            console.error('   Run the .getcreds command in your local bot and add the output to Heroku Config Vars.');
        }
        
        return false;
    }
    
    console.log('✅ All required environment variables are present');
    return true;
}

// Check if running on Heroku
function checkHerokuEnvironment() {
    if (!process.env.DYNO) {
        console.warn('⚠️ This script is meant to run on Heroku');
        return false;
    }
    
    console.log('✅ Running on Heroku');
    return true;
}

// Check PORT configuration
function checkPortConfiguration() {
    if (!process.env.PORT) {
        console.warn('⚠️ PORT environment variable is not set');
        console.warn('   Heroku will provide a PORT at runtime');
        return false;
    }
    
    console.log(`✅ PORT is configured: ${process.env.PORT}`);
    return true;
}

// Check credentials data format
function checkCredsDataFormat() {
    if (!process.env.CREDS_DATA) {
        return false;
    }
    
    try {
        const data = process.env.CREDS_DATA;
        
        // Basic validation (not perfect but helps catch obvious issues)
        if (data.length < 100) {
            console.error('❌ CREDS_DATA is too short. It may be incorrect or corrupted.');
            return false;
        }
        
        // Check if it's base64 encoded
        const base64Regex = /^[A-Za-z0-9+/=]+$/;
        if (!base64Regex.test(data)) {
            console.error('❌ CREDS_DATA does not appear to be valid base64 data.');
            return false;
        }
        
        console.log('✅ CREDS_DATA format appears valid');
        return true;
    } catch (error) {
        console.error('❌ Error checking CREDS_DATA format:', error.message);
        return false;
    }
}

// Main function
function runChecks() {
    console.log('==== BLACKSKY-MD HEROKU DEPLOYMENT CHECK ====');
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`Node.js: ${process.version}`);
    console.log('--------------------------------------------');
    
    const results = {
        herokuEnvironment: checkHerokuEnvironment(),
        requiredEnvVars: checkRequiredEnvVars(),
        portConfiguration: checkPortConfiguration(),
        credsDataFormat: checkCredsDataFormat()
    };
    
    console.log('--------------------------------------------');
    
    const allPassed = Object.values(results).every(result => result === true);
    
    if (allPassed) {
        console.log('✅ All checks passed! Your deployment is configured correctly.');
        console.log('   Bot should connect to WhatsApp when the application starts.');
    } else {
        console.log('⚠️ Some checks failed. Review the issues above.');
        console.log('   Your bot may not work correctly until these are resolved.');
    }
    
    console.log('==== END OF DEPLOYMENT CHECK ====');
}

// Run the checks
runChecks();