# Multi-stage build for Jimmy's POS
# Stage 1: Build frontend and backend
FROM node:23-alpine AS builder

WORKDIR /app

# Copy all source files first
COPY . .

# Install dependencies
RUN npm ci

# Build-time base path for Vite (when hosting the app under a sub-path)
ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=$VITE_BASE_PATH

# Build the frontend
RUN npm run build

# Stage 2: Production runtime
FROM node:23-alpine

WORKDIR /app

# Install dumb-init to handle signals properly
RUN apk add --no-cache dumb-init git openssh-client

# Copy package files from builder
COPY --from=builder /app/package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built frontend from builder
COPY --from=builder /app/dist ./dist

# Copy server code and src
COPY --from=builder /app/server ./server
COPY --from=builder /app/src ./src
COPY --from=builder /app/server.ts ./

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Use dumb-init to handle signals
ENTRYPOINT ["dumb-init", "--"]

# Start the server
CMD ["node", "--import", "tsx", "server.ts"]
