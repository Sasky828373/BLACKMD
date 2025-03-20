FROM node:18

# Install dependencies for canvas and other modules
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    ffmpeg \
    python3 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Create directories for auth files if they don't exist
RUN mkdir -p auth_info_baileys auth_info_heroku

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000

# This will be used by heroku-bot.js
CMD ["node", "src/index.js"]