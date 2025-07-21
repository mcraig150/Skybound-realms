import { Router } from 'express';
import { z } from 'zod';
import { PlayerService } from '../services/PlayerService';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const playerService = new PlayerService();

// Validation schemas
const UpdatePlayerSchema = z.object({
  username: z.string().min(3).max(20).optional(),
  settings: z.record(z.any()).optional()
});

const AddExperienceSchema = z.object({
  skillType: z.enum(['MINING', 'FARMING', 'COMBAT', 'CRAFTING', 'BUILDING', 'TRADING']),
  amount: z.number().positive()
});

const UpdateInventorySchema = z.object({
  action: z.enum(['ADD', 'REMOVE', 'UPDATE']),
  itemId: z.string(),
  quantity: z.number().positive(),
  metadata: z.object({
    rarity: z.enum(['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'DIVINE']).optional(),
    enchantments: z.array(z.any()).optional(),
    durability: z.number().optional()
  }).optional()
});

// Apply authentication middleware to all routes
router.use(authenticateToken);

// GET /api/player - Get current player data
router.get('/', async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const player = await playerService.getPlayer(req.player!.playerId);
    if (!player) {
      res.status(404).json({ 
        error: 'Player not found',
        code: 'PLAYER_NOT_FOUND' 
      });
      return;
    }
    res.json(player);
  } catch (error) {
    console.error('Error fetching player:', error);
    res.status(500).json({ 
      error: 'Failed to fetch player data',
      code: 'FETCH_PLAYER_ERROR' 
    });
  }
});

// PUT /api/player - Update player data
router.put('/', async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const validatedData = UpdatePlayerSchema.parse(req.body);
    const updatedPlayer = await playerService.updatePlayer(req.player!.playerId, validatedData);
    res.json(updatedPlayer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ 
        error: 'Invalid request data',
        code: 'VALIDATION_ERROR',
        details: error.errors 
      });
      return;
    }
    console.error('Error updating player:', error);
    res.status(500).json({ 
      error: 'Failed to update player data',
      code: 'UPDATE_PLAYER_ERROR' 
    });
  }
});

// GET /api/player/skills - Get player skills
router.get('/skills', async (req: AuthenticatedRequest, res) => {
  try {
    const skills = await playerService.getPlayerSkills(req.player!.playerId);
    res.json(skills);
  } catch (error) {
    console.error('Error fetching player skills:', error);
    res.status(500).json({ 
      error: 'Failed to fetch player skills',
      code: 'FETCH_SKILLS_ERROR' 
    });
  }
});

// POST /api/player/skills/experience - Add experience to a skill
router.post('/skills/experience', async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const validatedData = AddExperienceSchema.parse(req.body);
    const result = await playerService.addExperience(
      req.player!.playerId, 
      validatedData.skillType as any, 
      validatedData.amount
    );
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
    console.error('Error adding experience:', error);
    res.status(500).json({ 
      error: 'Failed to add experience',
      code: 'ADD_EXPERIENCE_ERROR' 
    });
  }
});

// GET /api/player/inventory - Get player inventory
router.get('/inventory', async (req: AuthenticatedRequest, res) => {
  try {
    const inventory = await playerService.getPlayerInventory(req.player!.playerId);
    res.json(inventory);
  } catch (error) {
    console.error('Error fetching player inventory:', error);
    res.status(500).json({ 
      error: 'Failed to fetch player inventory',
      code: 'FETCH_INVENTORY_ERROR' 
    });
  }
});

// POST /api/player/inventory - Update player inventory
router.post('/inventory', async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const validatedData = UpdateInventorySchema.parse(req.body);
    const result = await playerService.updateInventory(
      req.player!.playerId,
      validatedData.action,
      validatedData.itemId,
      validatedData.quantity,
      validatedData.metadata
    );
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
    console.error('Error updating inventory:', error);
    res.status(500).json({ 
      error: 'Failed to update inventory',
      code: 'UPDATE_INVENTORY_ERROR' 
    });
  }
});

// GET /api/player/stats - Get player statistics
router.get('/stats', async (req: AuthenticatedRequest, res) => {
  try {
    const stats = await playerService.getPlayerStats(req.player!.playerId);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching player stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch player statistics',
      code: 'FETCH_STATS_ERROR' 
    });
  }
});

export default router;