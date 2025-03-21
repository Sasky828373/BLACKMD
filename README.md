# Blacksky-MD WhatsApp Bot

A WhatsApp Multi-Device bot with advanced command handling, intelligent interaction capabilities, and user-friendly design.

## Deployment Options

### Deploying to Railway

1. Fork or clone this repository
2. Create a new project on [Railway](https://railway.app/)
3. Connect your GitHub repository to Railway
4. Railway will automatically detect the configuration and start the deployment
5. Once deployed, access the QR code at `https://your-app-name.railway.app/qr`

For detailed Railway deployment instructions, see [RAILWAY_DEPLOYMENT_GUIDE.md](RAILWAY_DEPLOYMENT_GUIDE.md).

### Deploying to Heroku

1. Fork or clone this repository
2. Create a new Heroku app
3. Connect your GitHub repository to Heroku
4. Add the necessary buildpacks in the following order:
   - heroku/nodejs
   - heroku/python
5. Deploy your app

For detailed Heroku deployment instructions, see [HEROKU_DEPLOY_GUIDE.md](HEROKU_DEPLOY_GUIDE.md).

## Required Environment Variables

Set the following environment variables in your platform's settings:

- `CREDS_DATA`: Your WhatsApp session credentials data (optional, can be generated at first run)
- `PLATFORM`: Set to "railway" if deploying on Railway, or "heroku" if deploying on Heroku
- `PORT`: Port for the web server (usually set automatically by the platform)

## Technical Details

This bot uses:
- Node.js for the main application
- Python for specialized processing (trafilatura, twilio)
- WhatsApp Multi-Device API through Baileys
- Advanced command handling system

## Local Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Install Python dependencies: `pip install -r requirements.txt`
4. Start the app: `npm start`