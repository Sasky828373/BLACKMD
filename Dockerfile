FROM node:16

# Set environment variables
ENV NODE_ENV=production

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
    python-is-python3

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy app source code
COPY . .

# Expose port for web server
EXPOSE 8080

# Start the application
CMD ["node", "app.js"]