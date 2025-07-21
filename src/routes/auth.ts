import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { PlayerService } from '../services/PlayerService';
import { generateToken } from '../middleware/auth';

const router = Router();
const playerService = new PlayerService();

// Validation schemas
const RegisterSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z.string().email(),
  password: z.string().min(8).max(128)
});

const LoginSchema = z.object({
  username: z.string(),
  password: z.string()
});

// POST /api/auth/register - Register new player
router.post('/register', async (req, res): Promise<void> => {
  try {
    const validatedData = RegisterSchema.parse(req.body);
    
    // Check if username already exists
    const existingPlayer = await playerService.getPlayerByUsername(validatedData.username);
    if (existingPlayer) {
      res.status(409).json({ 
        error: 'Username already exists',
        code: 'USERNAME_EXISTS' 
      });
      return;
    }
    
    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(validatedData.password, saltRounds);
    
    // Create new player
    const newPlayer = await playerService.createPlayer({
      username: validatedData.username,
      email: validatedData.email,
      passwordHash: hashedPassword
    });
    
    // Generate JWT token
    const token = generateToken(newPlayer.id, newPlayer.username);
    
    res.status(201).json({
      success: true,
      message: 'Player registered successfully',
      player: {
        id: newPlayer.id,
        username: newPlayer.username,
        email: newPlayer.email || '',
        createdAt: newPlayer.createdAt || new Date()
      },
      token
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ 
        error: 'Invalid registration data',
        code: 'VALIDATION_ERROR',
        details: error.errors 
      });
      return;
    }
    console.error('Error registering player:', error);
    res.status(500).json({ 
      error: 'Failed to register player',
      code: 'REGISTRATION_ERROR' 
    });
  }
});

// POST /api/auth/login - Login player
router.post('/login', async (req, res): Promise<void> => {
  try {
    const validatedData = LoginSchema.parse(req.body);
    
    // Get player by username
    const player = await playerService.getPlayerByUsername(validatedData.username);
    if (!player) {
      res.status(401).json({ 
        error: 'Invalid username or password',
        code: 'INVALID_CREDENTIALS' 
      });
      return;
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(validatedData.password, player.passwordHash || '');
    if (!isValidPassword) {
      res.status(401).json({ 
        error: 'Invalid username or password',
        code: 'INVALID_CREDENTIALS' 
      });
      return;
    }
    
    // Update last login
    await playerService.updateLastLogin(player.id);
    
    // Generate JWT token
    const token = generateToken(player.id, player.username);
    
    res.json({
      success: true,
      message: 'Login successful',
      player: {
        id: player.id,
        username: player.username,
        email: player.email || '',
        lastLogin: new Date()
      },
      token
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ 
        error: 'Invalid login data',
        code: 'VALIDATION_ERROR',
        details: error.errors 
      });
      return;
    }
    console.error('Error logging in player:', error);
    res.status(500).json({ 
      error: 'Failed to login',
      code: 'LOGIN_ERROR' 
    });
  }
});

// POST /api/auth/refresh - Refresh JWT token
router.post('/refresh', async (req, res): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      res.status(401).json({ 
        error: 'Refresh token required',
        code: 'MISSING_TOKEN' 
      });
      return;
    }
    
    // For now, we'll just generate a new token with the same payload
    // In a production system, you'd want separate refresh tokens
    const jwt = require('jsonwebtoken');
    const jwtSecret = process.env.JWT_SECRET;
    
    if (!jwtSecret) {
      res.status(500).json({ 
        error: 'Server configuration error',
        code: 'SERVER_ERROR' 
      });
      return;
    }
    
    try {
      const decoded = jwt.verify(token, jwtSecret, { ignoreExpiration: true }) as any;
      const newToken = generateToken(decoded.playerId, decoded.username);
      
      res.json({
        success: true,
        token: newToken
      });
    } catch (error) {
      res.status(401).json({ 
        error: 'Invalid refresh token',
        code: 'INVALID_TOKEN' 
      });
      return;
    }
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ 
      error: 'Failed to refresh token',
      code: 'REFRESH_ERROR' 
    });
  }
});

export default router;