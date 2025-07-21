import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

// JWT payload schema
const JWTPayloadSchema = z.object({
  playerId: z.string().uuid(),
  username: z.string(),
  iat: z.number(),
  exp: z.number()
});

export interface AuthenticatedRequest extends Request {
  player?: {
    playerId: string;
    username: string;
  };
}

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({ 
      error: 'Access token required',
      code: 'MISSING_TOKEN' 
    });
    return;
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('JWT_SECRET environment variable not set');
    res.status(500).json({ 
      error: 'Server configuration error',
      code: 'SERVER_ERROR' 
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as any;
    const validatedPayload = JWTPayloadSchema.parse(decoded);
    
    req.player = {
      playerId: validatedPayload.playerId,
      username: validatedPayload.username
    };
    
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED' 
      });
    } else if (error instanceof jwt.JsonWebTokenError) {
      res.status(403).json({ 
        error: 'Invalid token',
        code: 'INVALID_TOKEN' 
      });
    } else {
      res.status(403).json({ 
        error: 'Token validation failed',
        code: 'TOKEN_VALIDATION_FAILED' 
      });
    }
  }
};

export const generateToken = (playerId: string, username: string): string => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable not set');
  }

  return jwt.sign(
    { playerId, username },
    jwtSecret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' } as jwt.SignOptions
  );
};