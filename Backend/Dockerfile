# Use official Node image
FROM node:20-alpine

# Install docker CLI (needed for spawn("docker"))
RUN apk add --no-cache docker-cli

ENV NODE_ENV=production

# Create app directory
WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy rest of the code
    COPY . .

# Create temp directory safely
RUN mkdir -p temp && chmod 700 temp

# Expose port
EXPOSE 5001

# Start server
CMD ["node", "index.js"]
