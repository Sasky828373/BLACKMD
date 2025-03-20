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
    python3 \
    python3-pip \
    pkg-config

# Create symlink for python and upgrade pip
RUN ln -sf /usr/bin/python3 /usr/bin/python && \
    pip3 install --upgrade pip setuptools wheel

# Copy package files and rename our special Heroku package.json
COPY package-heroku.json ./package.json
COPY package-lock.json ./

# Install app dependencies
RUN npm ci --only=production

# Copy app source code
COPY . .

# Install Python requirements (using pip directly to avoid TOML parsing issues)
RUN pip3 install trafilatura twilio --no-cache-dir

# Expose port for web server
EXPOSE $PORT

# Start the application
CMD ["node", "app.js"]