import { Router } from 'express';
import { z } from 'zod';
import { WorldService } from '../services/WorldService';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const worldService = new WorldService();

// GET /api/world/test-chunk - Get a test chunk for client development (no auth required)
router.get('/test-chunk', async (req, res) => {
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

// Validation schemas
const VoxelChangeSchema = z.object({
  position: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number()
  }),
  blockType: z.string(),
  metadata: z.record(z.any()).optional()
});

const SaveIslandChangesSchema = z.object({
  changes: z.array(VoxelChangeSchema)
});

const ExpandIslandSchema = z.object({
  blueprintId: z.string(),
  direction: z.enum(['NORTH', 'SOUTH', 'EAST', 'WEST', 'UP', 'DOWN'])
});

const ChunkCoordinateSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number()
});

// Apply authentication middleware to all other routes
router.use(authenticateToken);

// GET /api/world/island - Get player's island
router.get('/island', async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const island = await worldService.getPlayerIsland(req.player!.playerId);
    if (!island) {
      res.status(404).json({ 
        error: 'Island not found',
        code: 'ISLAND_NOT_FOUND' 
      });
      return;
    }
    res.json(island);
  } catch (error) {
    console.error('Error fetching player island:', error);
    res.status(500).json({ 
      error: 'Failed to fetch island data',
      code: 'FETCH_ISLAND_ERROR' 
    });
  }
});

// POST /api/world/island/save - Save island changes
router.post('/island/save', async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const validatedData = SaveIslandChangesSchema.parse(req.body);
    // Convert the changes to the expected VoxelChange format
    const voxelChanges = validatedData.changes.map(change => ({
      ...change,
      oldBlockId: 'air', // Default old block
      newBlockId: change.blockType,
      timestamp: new Date(),
      playerId: req.player!.playerId
    }));
    await worldService.saveIslandChanges(req.player!.playerId, voxelChanges as any);
    res.json({ 
      success: true, 
      message: 'Island changes saved successfully',
      changesCount: validatedData.changes.length 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ 
        error: 'Invalid request data',
        code: 'VALIDATION_ERROR',
        details: error.errors 
      });
      return;
    }
    console.error('Error saving island changes:', error);
    res.status(500).json({ 
      error: 'Failed to save island changes',
      code: 'SAVE_ISLAND_ERROR' 
    });
  }
});

// POST /api/world/island/expand - Expand player's island
router.post('/island/expand', async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const validatedData = ExpandIslandSchema.parse(req.body);
    const result = await worldService.expandIslandWithBlueprint(
      req.player!.playerId, 
      validatedData.blueprintId,
      validatedData.direction
    );
    
    if (!result.success) {
      res.status(400).json({ 
        error: result.error || 'Failed to expand island',
        code: 'EXPAND_ISLAND_FAILED' 
      });
      return;
    }
    
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ 
        error: 'Invalid request data',
        code: 'VALIDATION_ERROR',
        details: error.errors 
      });
      return;
    }
    console.error('Error expanding island:', error);
    res.status(500).json({ 
      error: 'Failed to expand island',
      code: 'EXPAND_ISLAND_ERROR' 
    });
  }
});

// GET /api/world/chunk/:x/:y/:z - Get specific world chunk
router.get('/chunk/:x/:y/:z', async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const coordinate = ChunkCoordinateSchema.parse({
      x: parseInt(req.params.x!),
      y: parseInt(req.params.y!),
      z: parseInt(req.params.z!)
    });
    
    const chunk = await worldService.getChunk(coordinate);
    if (!chunk) {
      res.status(404).json({ 
        error: 'Chunk not found',
        code: 'CHUNK_NOT_FOUND' 
      });
      return;
    }
    
    res.json(chunk);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ 
        error: 'Invalid chunk coordinates',
        code: 'VALIDATION_ERROR',
        details: error.errors 
      });
      return;
    }
    console.error('Error fetching chunk:', error);
    res.status(500).json({ 
      error: 'Failed to fetch chunk data',
      code: 'FETCH_CHUNK_ERROR' 
    });
  }
});

// GET /api/world/zones - Get available public zones
router.get('/zones', async (req: AuthenticatedRequest, res) => {
  try {
    const zones = await worldService.getPublicZones();
    res.json(zones);
  } catch (error) {
    console.error('Error fetching public zones:', error);
    res.status(500).json({ 
      error: 'Failed to fetch public zones',
      code: 'FETCH_ZONES_ERROR' 
    });
  }
});

// GET /api/world/zone/:zoneId - Get specific public zone
router.get('/zone/:zoneId', async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const zoneId = req.params.zoneId!;
    const zone = await worldService.getPublicZone(zoneId);
    
    if (!zone) {
      res.status(404).json({ 
        error: 'Zone not found',
        code: 'ZONE_NOT_FOUND' 
      });
      return;
    }
    
    res.json(zone);
  } catch (error) {
    console.error('Error fetching public zone:', error);
    res.status(500).json({ 
      error: 'Failed to fetch zone data',
      code: 'FETCH_ZONE_ERROR' 
    });
  }
});

// GET /api/world/island/blueprints - Get available island expansion blueprints
router.get('/island/blueprints', async (req: AuthenticatedRequest, res) => {
  try {
    const blueprints = await worldService.getExpansionBlueprints();
    res.json(blueprints);
  } catch (error) {
    console.error('Error fetching expansion blueprints:', error);
    res.status(500).json({ 
      error: 'Failed to fetch expansion blueprints',
      code: 'FETCH_BLUEPRINTS_ERROR' 
    });
  }
});

export default router;