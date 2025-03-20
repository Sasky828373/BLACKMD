# WhatsApp Bot Reaction Commands Guide

This comprehensive guide explains how to use, customize, and troubleshoot reaction commands in the WhatsApp bot.

## What Are Reaction Commands?

Reaction commands allow users to express emotions or actions with animated GIFs. When a user sends a command like `!hug` or `!slap`, the bot responds with:

1. A text message describing the action (e.g., "@user hugs @target 🤗")
2. An animated GIF showing that reaction/emotion

## Available Reaction Commands

The bot supports the following reaction commands:

### Self-Reactions
These commands show the user performing an action:

- `!smile` - Shows a smiling GIF
- `!happy` - Shows a happy GIF
- `!dance` - Shows a dancing GIF
- `!cry` - Shows a crying GIF
- `!blush` - Shows a blushing GIF
- `!laugh` - Shows a laughing GIF

### Target Reactions
These commands show the user performing an action on someone else:

- `!hug [target]` - Hugs the target person
- `!pat [target]` - Pats the target person
- `!kiss [target]` - Kisses the target person
- `!cuddle [target]` - Cuddles with the target person
- `!wave [target]` - Waves at the target person
- `!wink [target]` - Winks at the target person
- `!poke [target]` - Pokes the target person
- `!slap [target]` - Slaps the target person
- `!bonk [target]` - Bonks the target person
- `!bite [target]` - Bites the target person
- `!punch [target]` - Punches the target person
- `!highfive [target]` - High fives the target person
- `!yeet [target]` - Yeets the target person
- `!kill [target]` - "Kills" the target person (non-realistic)

The `[target]` can be:
- A mentioned user (using @ symbol)
- A name typed after the command (e.g., `!hug John`)

## How Reaction GIFs Work

Reaction commands work by:

1. The command is matched in `src/commands/reactions.js`
2. The matching GIF is loaded from `data/reaction_gifs/[command].gif`
3. The GIF is sent as an animated video with the `gifPlayback` flag set to `true`

## Customizing Reaction GIFs

You can replace any reaction GIF with your own preferred animation:

### Method 1: Direct Replacement

1. Find or create a GIF for the reaction you want to replace
2. Rename it to match the command (e.g., `hug.gif` for the `!hug` command)
3. Copy it to `data/reaction_gifs/` directory, replacing the existing file

### Method 2: Using the Fix Script

For bulk updates or to ensure GIFs match their commands semantically:

1. Add your new GIFs to the `attached_assets` directory
2. Edit the `src/fix-reaction-gifs-corrected.js` file to update the mapping:

```javascript
const REACTION_GIF_MAPPING = {
    'hug': 'your-new-hug-animation.gif',
    'kiss': 'your-new-kiss-animation.gif',
    // ... other mappings
};
```

3. Run the script to apply the changes:

```
node src/fix-reaction-gifs-corrected.js
```

4. Restart the bot to ensure changes are picked up

## Troubleshooting Reaction Commands

If your reaction commands aren't working correctly, try these steps:

### 1. Check if GIF Files Exist

Run the verification script to check if all GIF files exist and match:

```
node src/verify-semantic-match.js
```

This will create a report in `verification_results/semantic_verification_report.md` with details about each GIF.

### 2. Fix Missing or Mismatched GIFs

If GIFs are missing or mismatched:

1. Run the fix script:

```
node src/fix-reaction-gifs-corrected.js
```

2. Restart the bot to apply changes

### 3. Check for Errors in Console

When using a reaction command, check the console for any errors about missing GIFs or sending failures.

### 4. GIF Size Issues

If a GIF is too large (> 10MB), WhatsApp might have trouble sending it. Try using smaller GIFs (ideally < 2MB) for better performance.

## Advanced: Adding New Reaction Commands

To add a new reaction command:

1. Add the new command to `src/commands/reactions.js`:

```javascript
// In the commands object
commands = {
    // ... existing commands
    newreaction: async (sock, message, args) => await handleReaction(sock, message, 'newreaction', args)
};
```

2. Add a text format in the `handleReaction` function's switch statement:

```javascript
case 'newreaction': reactionMessage = `${formattedSender} does something to ${formattedTarget} 🎯`; break;
```

3. Add an appropriate GIF file named `newreaction.gif` to the `data/reaction_gifs/` directory

4. Update the mapping in `src/fix-reaction-gifs-corrected.js` to include your new command

5. Restart the bot to apply changes

## Emoji Reference for Reaction Messages

These emojis are used in reaction messages for visual enhancement:

- 😊 - smile
- 😄 - happy
- 💃 - dance
- 😢 - cry
- 😳 - blush
- 😂 - laugh
- 🤗 - hug
- 👋 - pat/wave
- 😘 - kiss
- 🥰 - cuddle
- 😉 - wink
- 👉 - poke
- 👋 - slap
- 🔨 - bonk
- 😬 - bite
- 👊 - punch
- ✋ - highfive
- 🚀 - yeet
- 💀 - kill

Feel free to customize these emojis in the `handleReaction` function to better match your GIFs.

## Performance Optimization

Reaction GIFs are now cached in memory for faster response times. If you're running the bot on a low-memory device, you can modify the cache settings in `src/commands/reactions.js` by adjusting the `gifCache` implementation.

For the best performance:
- Use smaller GIFs (< 2MB) for faster loading
- Use MP4 video files when possible (they're more efficient than GIFs)
- Reduce the resolution of animated content if it's too high

## Persistent Reaction GIF Verification

The bot now automatically verifies and fixes reaction GIFs at startup, ensuring they always match their commands correctly. This feature is implemented in `src/qr-web-server.js` and requires no user intervention.

If you need to manually trigger this verification, restart the bot or run:

```
node src/reload-reaction-gifs.js
```