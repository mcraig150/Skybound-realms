import { Router } from 'express';
import authRoutes from './auth';
import playerRoutes from './player';
import worldRoutes from './world';
import economyRoutes from './economy';

const router = Router();

// Mount route modules
router.use('/auth', authRoutes);
router.use('/player', playerRoutes);
router.use('/world', worldRoutes);
router.use('/economy', economyRoutes);

// Test chunk endpoint for client development (no auth required)
router.get('/test-chunk', (req, res) => {
  try {
    // Generate a simple 8x8x8 test chunk with different block types
    const testChunk = {
      chunkId: 'test-chunk-0-0-0',
      position: { x: 0, y: 0, z: 0 },
      size: { width: 8, height: 8, depth: 8 },
      blocks: [] as any[],
      lastModified: new Date().toISOString()
    };

    // Generate blocks in an 8x8x8 pattern
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        for (let z = 0; z < 8; z++) {
          let blockType = 'air';
          
          // Create different patterns for different block types
          if (y === 0) {
            blockType = 'stone'; // Bottom layer
          } else if (y === 1) {
            blockType = 'dirt'; // Second layer
          } else if (y === 2 && (x + z) % 2 === 0) {
            blockType = 'grass'; // Checkerboard pattern
          } else if (y === 3 && x === z) {
            blockType = 'wood'; // Diagonal line
          } else if (y === 4 && (x === 0 || x === 7 || z === 0 || z === 7)) {
            blockType = 'cobblestone'; // Border
          } else if (y === 5 && x === 3 && z === 3) {
            blockType = 'gold'; // Single gold block in center
          }

          if (blockType !== 'air') {
            testChunk.blocks.push({
              position: { x, y, z },
              blockType,
              metadata: {}
            });
          }
        }
      }
    }

    res.json(testChunk);
  } catch (error) {
    console.error('Error generating test chunk:', error);
    res.status(500).json({ 
      error: 'Failed to generate test chunk',
      code: 'TEST_CHUNK_ERROR' 
    });
  }
});

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    name: 'Skybound Realms API',
    version: '1.0.0',
    description: 'REST API for Skybound Realms MMORPG',
    endpoints: {
      auth: '/api/auth',
      player: '/api/player',
      world: '/api/world',
      economy: '/api/economy',
      testChunk: '/api/test-chunk'
    },
    documentation: 'https://docs.skybound-realms.com/api'
  });
});

export default router;