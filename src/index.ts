import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import apiRoutes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { WebSocketService } from './services/WebSocketService';
import { ConnectionManager } from './services/ConnectionManager';
import { PlayerService } from './services/PlayerService';
import { ChatServiceImpl } from './services/ChatService';
import { TradingServiceImpl } from './services/TradingService';
import { PlayerRepository } from './repositories/PlayerRepository';
import { WorldService } from './services/WorldService';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Error handling middleware (must be after all routes)
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize services
const playerService = new PlayerService();
const chatService = new ChatServiceImpl(new PlayerRepository());
const tradingService = new TradingServiceImpl();
const worldService = new WorldService();

// Initialize WebSocket service
const webSocketService = new WebSocketService(
  server,
  playerService,
  chatService,
  tradingService,
  worldService
);

// Initialize connection manager
const connectionManager = new ConnectionManager(webSocketService);

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || 'localhost';

server.listen(PORT, () => {
  console.log(`🚀 Skybound Realms server running on http://${HOST}:${PORT}`);
  console.log(`📊 Health check available at http://${HOST}:${PORT}/health`);
  console.log(`🔌 WebSocket server ready for connections`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  connectionManager.shutdown();
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  connectionManager.shutdown();
});

export { app, server, webSocketService, connectionManager };