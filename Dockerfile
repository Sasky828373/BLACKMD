FROM node:16

# Set environment variables
ENV NODE_ENV=production
ENV NODE_VERSION=16.20.0

# Create app directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    librsvg2-dev \
    g++ \
    build-essential \
    python3-dev \
    python-is-python3 \
    pkg-config

# Copy package files and rename our special Heroku package.json
COPY package-heroku.json ./package.json
COPY package-lock.json ./

# Install app dependencies
RUN npm ci --only=production

# Copy app source code
COPY . .

# Fix canvas installation
RUN apt-get install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

# Expose port for web server
EXPOSE $PORT

# Start the application
CMD ["node", "app.js"]