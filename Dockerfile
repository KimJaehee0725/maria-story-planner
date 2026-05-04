# Build stage
FROM node:24-slim as builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY vite.config.mts ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src
COPY data-model.js ./
COPY server.js ./
COPY styles.css ./
COPY index.html ./
COPY scripts ./scripts

# Build frontend
RUN npm run build

# Production stage
FROM node:24-slim

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/data-model.js ./data-model.js

# Create storage directory for persistence
RUN mkdir -p /app/storage/projects/backups /app/storage/imports

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8765) + '/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Default port
EXPOSE 8765

# Run server
CMD ["node", "server.js"]
