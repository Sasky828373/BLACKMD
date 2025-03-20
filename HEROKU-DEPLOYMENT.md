# BLACKSKY-MD WhatsApp Bot - Heroku Deployment Guide

This guide provides detailed instructions for deploying BLACKSKY-MD WhatsApp Bot to Heroku for 24/7 operation.

## Prerequisites

- A Heroku account (sign up at [heroku.com](https://heroku.com) if you don't have one)
- Git installed on your computer
- Your BLACKSKY-MD bot running locally at least once (to generate connection credentials)

## 1. Prepare Your WhatsApp Session

Before deploying to Heroku, you need to extract your WhatsApp session credentials:

1. Run your bot locally until you've successfully connected it to WhatsApp
2. Send the command `.getcreds` to your bot (this command is owner-only)
3. The bot will respond with your credentials in a compressed format
4. Save this data - you will need it for the Heroku deployment

## 2. Create a Heroku App

1. Log in to your Heroku dashboard
2. Click "New" and select "Create new app"
3. Choose a unique app name and select your region
4. Click "Create app"

## 3. Configure Environment Variables

In your Heroku app's dashboard:

1. Go to the "Settings" tab
2. Click "Reveal Config Vars"
3. Add the following variables:
   - `CREDS_DATA`: Paste the credentials data you received from the `.getcreds` command
   - `PLATFORM`: heroku
   - `NODE_ENV`: production
   - `OWNER_NUMBER`: Your WhatsApp number without + (e.g., 1234567890)
   - `PREFIX`: Your preferred command prefix (default is `.`)
   - `BOT_NAME`: Your preferred bot name (optional)

## 4. Deployment Options

You have several options for deploying to Heroku:

### Option A: Deploy using GitHub (Recommended)

1. Push your bot code to a GitHub repository
2. In your Heroku app dashboard, go to the "Deploy" tab
3. Select "GitHub" as the deployment method
4. Connect your GitHub account and select your repository
5. Choose either:
   - "Enable Automatic Deploys" for automatic deployment when you push to GitHub
   - "Deploy Branch" for manual deployment

### Option B: Deploy using Heroku CLI

1. Install the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
2. Open your terminal and navigate to your bot's directory
3. Log in to Heroku:
   ```
   heroku login
   ```
4. Initialize a Git repository (if not already done):
   ```
   git init
   git add .
   git commit -m "Initial commit"
   ```
5. Add the Heroku remote:
   ```
   heroku git:remote -a your-app-name
   ```
6. Push to Heroku:
   ```
   git push heroku main
   ```

## 5. Verify Deployment

1. After deployment, go to the "Resources" tab in your Heroku dashboard
2. Make sure the web dyno is turned on (if not, click the pen icon to edit and enable it)
3. Click "More" at the top right and select "View logs" to check for any errors

## 6. Maintaining 24/7 Operation

For 24/7 operation on Heroku:

1. Use at least the Eco dyno tier ($5/month) - this is a minimal cost but ensures your bot doesn't sleep
2. Alternatively, use the free tier with the following limitations:
   - Your bot will sleep after 30 minutes of inactivity
   - Your bot will be limited to 550 hours per month (about 23 days)
   - Use services like UptimeRobot to ping your app URL every 25 minutes to prevent sleeping

## Troubleshooting

If you encounter any issues:

1. Check the Heroku logs:
   ```
   heroku logs --tail -a your-app-name
   ```

2. Common issues:
   - **Connection errors**: Make sure your `CREDS_DATA` is correct and properly formatted
   - **Memory errors**: Free and Eco dynos have limited memory - adjust your bot's features if needed
   - **Timeout errors**: For operations that take more than 30 seconds, consider using background tasks

3. If your bot disconnects frequently, try:
   - Refreshing your WhatsApp credentials by updating the `CREDS_DATA` value
   - Checking for memory leaks or high resource usage in your code
   - Ensuring your bot handles reconnection properly

## Additional Tips

- **Regular Backup**: Use the `.getcreds` command periodically to backup your session
- **Restart Dynos**: If your bot behaves erratically, try restarting the dyno:
  ```
  heroku restart -a your-app-name
  ```
- **Monitor Resource Usage**: Check your app's metrics in the Heroku dashboard to ensure it's not exceeding limits

---

For detailed logging and more technical troubleshooting, refer to the Heroku documentation: [https://devcenter.heroku.com/](https://devcenter.heroku.com/)