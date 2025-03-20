# Heroku Deployment Troubleshooting Guide

## Error: "Couldn't find any supported Python package manager files"

If you encounter this error when deploying to Heroku, here's how to fix it:

1. **Make sure you have a requirements.txt file** in the root of your repository
   - This file should list all Python dependencies
   - Our project already has this file with `trafilatura` and `twilio` listed

2. **Check that you have the correct buildpacks** in your Heroku app settings
   - Go to the Settings tab in your Heroku dashboard
   - Scroll down to the Buildpacks section
   - Make sure you have both `heroku/nodejs` and `heroku/python` in this exact order
   - If not, add them using the "Add buildpack" button

3. **Verify runtime.txt** is present with a valid Python version
   - Our project has `python-3.11.8` specified

4. **Make sure all files are committed** to your repository
   - The following files must be present:
     - requirements.txt
     - runtime.txt
     - Procfile
     - app.json
     - .buildpacks

5. **Try a clean deployment**
   - In Heroku Dashboard, go to the Deploy tab
   - Scroll down to the Manual Deploy section
   - Choose the branch and click "Deploy Branch"

6. **Check your logs** after deployment
   - In Heroku Dashboard, click "More" at the top right
   - Select "View logs" to see what's happening during the build process

## Important Files for Deployment

- `requirements.txt` - Python dependencies
- `runtime.txt` - Python version specification
- `Procfile` - Command to run the application
- `app.json` - Application metadata
- `.buildpacks` - Explicit buildpack declaration
- `package.json` - Node.js dependencies and scripts
- `.node-version` - Node.js version specification