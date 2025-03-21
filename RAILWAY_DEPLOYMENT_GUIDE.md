# BLACKSKY-MD WhatsApp Bot - Railway Deployment Guide

This guide will help you deploy the BLACKSKY-MD WhatsApp Bot to Railway, a modern cloud platform that offers easy deployment and scaling.

## Prerequisites

- A Railway account (Sign up at [railway.app](https://railway.app))
- Basic familiarity with Git repositories

## Deployment Steps

### 1. Fork or Clone the Repository

First, fork or clone this repository to your GitHub account.

### 2. Set Up a New Project on Railway

1. Log in to your Railway account
2. Click "New Project" in the dashboard
3. Select "Deploy from GitHub repo"
4. Select your forked/cloned repository
5. Choose the main/master branch

### 3. Configure Environment Variables

You need to set the following environment variables in your Railway project settings:

| Variable Name | Value | Description |
|--------------|-------|-------------|
| `OWNER_NUMBER` | Your phone number with country code | Bot owner's number (e.g., 1234567890) |
| `BOT_PREFIX` | `!` | Command prefix for the bot (can be any symbol) |
| `NODE_VERSION` | `18.x` | Ensures the correct Node.js version is used |

Optional variables for additional customization:

| Variable Name | Value | Description |
|--------------|-------|-------------|
| `BOT_NAME` | Your bot name | Custom name for your bot |
| `LANGUAGE` | `en` | Default language (en, de, es, etc.) |
| `PLATFORM` | `railway` | Explicitly set the platform to Railway |

### 4. Initial Deployment

Once you've connected your repository and set the environment variables, Railway will automatically start the deployment process. This may take a few minutes.

### 5. Scan QR Code to Connect WhatsApp

1. Once deployed, click on the "Generate Domain" button in Railway to get a public URL
2. Navigate to `https://your-railway-url.up.railway.app/qr` to see the QR code
3. Scan this QR code with your WhatsApp to link your device

### 6. Save WhatsApp Session (Important)

After successfully connecting your WhatsApp, you need to save the session credentials to avoid rescanning the QR code on future deployments:

1. Wait a few minutes to ensure all credentials are properly generated
2. Access your Railway logs and look for a log message that says "Auth initialized successfully"
3. In your Railway project settings, add a new environment variable:
   - Name: `CREDS_DATA`
   - Value: (Create this value by following the steps in the "Creating CREDS_DATA" section below)

### Creating CREDS_DATA

To create the CREDS_DATA value for persistent WhatsApp connection across deployments:

1. Locally clone your repository and run it once to connect to WhatsApp
2. Run `node heroku-credentials-helper.js` in the project directory
3. Copy the entire output string (it's a Base64-encoded compressed representation of your credentials)
4. Add this as the value for the CREDS_DATA environment variable in Railway

Alternatively, if you're already connected on Railway:

1. Use the Railway CLI to extract the credentials
2. Run: `railway run node heroku-credentials-helper.js`
3. Copy the output string and add it as the CREDS_DATA environment variable

### 7. Verify Successful Setup

After deploying and connecting, your bot should automatically:

1. Connect to WhatsApp using your saved credentials
2. Start responding to commands in chats
3. Show a "Connected" status at `https://your-railway-url.up.railway.app/health`

## Troubleshooting

### Connection Issues

If you're having trouble connecting to WhatsApp:

1. Check the Railway logs for any error messages
2. Make sure you've properly scanned the QR code
3. Try clearing the `auth_info_baileys` directory and rescanning the QR code
4. Ensure your Railway instance can access the internet

### Performance Tuning

Railway automatically scales resources, but if you need to optimize performance:

1. Update the `nixpacks.toml` file with specific resource settings
2. Reduce unnecessary logging by setting `DEBUG_MODE=false` in environment variables
3. Use the Railway Redis add-on for improved caching performance

## Railway Advantages

- **Zero Downtime Deployment**: Railway keeps your bot running even during updates
- **Automatic HTTPS**: Your bot gets a secure HTTPS URL automatically
- **Resource Scaling**: Resources scale automatically based on usage
- **Integrated Monitoring**: View logs and performance metrics directly in the dashboard

## Additional Notes

- Railway's free tier has usage limits. Consider upgrading to a paid plan for production use
- Use the Railway CLI for advanced deployment options and management
- Enable GitHub automatic deployments to keep your bot updated with your latest code changes

For more help, refer to the [Railway documentation](https://docs.railway.app/) or open an issue in the repository.