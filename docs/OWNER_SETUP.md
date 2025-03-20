# BLACKSKY-MD Bot Owner Setup Guide

This guide explains how to properly set up the owner of the BLACKSKY-MD WhatsApp bot. The owner has access to special commands and administrative privileges not available to regular users.

## Why Set Up an Owner?

Setting up the correct owner number is essential for:

1. **Security**: Only the owner can execute certain high-risk commands
2. **Administration**: The owner can manage the bot remotely via WhatsApp
3. **Control**: The owner can restart, update, or modify bot behavior through commands

## Methods to Set Up the Owner

There are two primary methods to set up the bot owner:

### Method 1: Using Environment Variables (Recommended)

This method is more secure and recommended for all deployments, especially on platforms like Heroku.

1. **Create an .env file** (for local deployment):
   ```
   OWNER_NUMBER=1234567890
   ```
   Replace `1234567890` with your full WhatsApp number without any special characters or plus sign.

2. **Set up environment variables** (for Heroku or other cloud platforms):
   - Go to your app's dashboard
   - Navigate to Settings → Config Vars
   - Add a new variable called `OWNER_NUMBER` with your WhatsApp number as the value
   - Click "Save Changes"

### Method 2: Directly in the config.js File

This method is simpler but less secure if you're sharing your code.

1. Open the file `src/config/config.js`
2. Locate the `owner` section
3. Change the number in this line:
   ```javascript
   number: process.env.OWNER_NUMBER || '4915561048015', // Replace this with your WhatsApp number
   ```
   Replace `4915561048015` with your full WhatsApp number without any special characters or plus sign.

## Format of the Owner Number

The owner number must be in the following format:

- Full international format
- No spaces or special characters
- No plus sign (+) at the beginning
- Example: For +1 (202) 555-0199, use `12025550199`

## Verifying Owner Setup

To verify that your owner number is correctly set up:

1. Start the bot
2. Send the command `.owner` or `!owner` to the bot (depending on your prefix setting)
3. The bot should recognize you as the owner and respond accordingly

If it doesn't recognize you as the owner, double-check:
- That you're using the correct number format
- That you've restarted the bot after making changes
- That the environment variables are correctly set

## Owner-Only Commands

Once properly set up as the owner, you have access to powerful commands including:

- `.shutdown` - Safely shutdown the bot
- `.restart` - Restart the bot
- `.update` - Check for and apply updates
- `.eval` - Execute JavaScript code
- `.setvar` - Set bot configuration variables
- `.getvar` - Get current configuration values
- `.block` - Block a user from using the bot
- `.unblock` - Unblock a previously blocked user
- `.join` - Make the bot join a group via invite link
- `.leave` - Make the bot leave a specified group
- `.broadcast` - Send a message to all chats
- `.getcreds` - Get credential backup for Heroku deployment

## Multiple Owners

If you want to set up multiple owners:

1. Open the file `src/config/config.js`
2. Add or modify the `additionalOwners` array:
   ```javascript
   additionalOwners: [
     '1234567890',
     '9876543210'
   ]
   ```
3. Replace the example numbers with your additional owner numbers

## Security Considerations

- Keep your owner number private
- Don't share bot instances where you're set as the owner
- When using the `.eval` command, be cautious with the code you execute
- Regularly update your bot for security patches

## Troubleshooting

If you're having issues with owner authentication:

1. **Check number format**: Ensure your number is in the correct format without any special characters
2. **Restart required**: Any changes to owner settings require a bot restart
3. **Environment variables priority**: Environment variables always override settings in the config file
4. **WhatsApp multi-device**: Ensure you're using the correct number if you use WhatsApp on multiple devices
5. **Strict validation**: If you've enabled `strictValidation`, your number must exactly match

## Need More Help?

If you're still having issues setting up the bot owner after following this guide, you can:

- Check the main [README.md](../README.md) file for general troubleshooting
- Review the logs for any authentication errors
- Join our support group on WhatsApp