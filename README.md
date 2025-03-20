# Blacksky-MD WhatsApp Bot

A WhatsApp Multi-Device bot with advanced command handling, intelligent interaction capabilities, and user-friendly design.

## Deployment to Heroku

1. Fork or clone this repository
2. Create a new Heroku app
3. Connect your GitHub repository to Heroku
4. Add the necessary buildpacks in the following order:
   - heroku/nodejs
   - heroku/python
5. Deploy your app

## Required Environment Variables

Set the following environment variables in your Heroku app settings:

- `CREDS_DATA`: Your WhatsApp session credentials data (optional, can be generated at first run)

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