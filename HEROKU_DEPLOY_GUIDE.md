# Heroku Deployment Guide for BlackSky-MD

This guide explains how to deploy the BlackSky-MD WhatsApp bot to Heroku.

## Prerequisites

1. A [Heroku](https://www.heroku.com/) account
2. [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) installed
3. [Git](https://git-scm.com/) installed

## Deployment Steps

### 1. Clone the Repository (if you haven't already)

```bash
git clone https://github.com/YOUR_USERNAME/BLACKMD.git
cd BLACKMD
```

### 2. Login to Heroku

```bash
heroku login
```

### 3. Create a Heroku App

```bash
heroku create your-app-name
```

Or connect to an existing app:

```bash
heroku git:remote -a your-app-name
```

### 4. Set Stack to Container

```bash
heroku stack:set container
```

### 5. Push to Heroku

```bash
git push heroku main
```

### 6. Scale the Dyno

```bash
heroku ps:scale web=1
```

### 7. View the Logs

```bash
heroku logs --tail
```

## Troubleshooting

### Connection Issues

If the bot has connection issues:

1. Check the logs: `heroku logs --tail`
2. You may need to scan the QR code again. You can do this by:
   - Opening the app in your browser: `heroku open`
   - Or by temporarily enabling development mode and viewing logs

### Session Management

To persist WhatsApp session data between deployments:

1. Use the built-in session backup feature
2. You can manually upload session data using the environment variable:

```bash
heroku config:set CREDS_DATA="your-base64-encoded-creds-data"
```

## Environment Variables

Set these environment variables for configuration:

```bash
# Required
heroku config:set OWNER_NUMBER="your-phone-number"

# Optional
heroku config:set BOT_NAME="Your Bot Name"
heroku config:set PREFIX="!"
```

## Additional Resources

- [Heroku Node.js Support](https://devcenter.heroku.com/articles/nodejs-support)
- [Docker Deployment on Heroku](https://devcenter.heroku.com/articles/container-registry-and-runtime)

## Need Help?

If you encounter issues, check the project issues on GitHub or reach out to the community for support.