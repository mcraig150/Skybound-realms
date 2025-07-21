# Multi-stage build for Skybound Realms server
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for building)
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create production entry point with path mapping
RUN printf "// Production entry point with path mapping\nconst tsConfigPaths = require('tsconfig-paths');\n\n// Register path mapping for production\nconst baseUrl = __dirname;\ntsConfigPaths.register({\n  baseUrl,\n  paths: {\n    '@models/*': ['models/*'],\n    '@services/*': ['services/*'],\n    '@shared/*': ['shared/*']\n  }\n});\n\n// Start the application\nrequire('./index.js');" > dist/start.js

# Production stage
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S skybound -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=skybound:nodejs /app/dist ./dist
COPY --from=builder --chown=skybound:nodejs /app/src/docs ./src/docs
COPY --from=builder --chown=skybound:nodejs /app/tsconfig.json ./tsconfig.json

# Create necessary directories
RUN mkdir -p logs && chown skybound:nodejs logs

# Switch to non-root user
USER skybound

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/start.js"]