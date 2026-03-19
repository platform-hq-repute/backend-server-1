# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
RUN npm install --production

# Copy all backend source files
COPY . .

# Set Cloud Run port
ENV PORT 8080

# Expose port
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]
