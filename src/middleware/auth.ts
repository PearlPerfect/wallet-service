import { Request, Response, NextFunction } from 'express';
import jwtService from '../utils/jwt';
import ApiKey, { ApiKeyPermission } from '../models/ApiKey';
import User from '../models/User';
import apiKeyService from '../services/apiKeyService';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      apiKey?: ApiKey;
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check for API key first
    const apiKey = req.headers['x-api-key'] as string;
    
    if (apiKey) {
      const key = await apiKeyService.validateApiKey(apiKey);
      
      if (!key) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      if (!key.isValid()) {
        return res.status(401).json({ error: 'API key expired or revoked' });
      }

      req.apiKey = key;
      req.user = key.user;
      return next();
    }

    // Check for JWT token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const payload = jwtService.verifyToken(token);

    const user = await User.findByPk(payload.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

export const requirePermission = (...permissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // If using API key, check permissions
      if (req.apiKey) {
        const hasPermission = permissions.every(permission =>
          req.apiKey!.hasPermission(permission as ApiKeyPermission)
        );

        if (!hasPermission) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }
      }

      // JWT users have all permissions
      next();
    } catch (error) {
      return res.status(403).json({ error: 'Permission check failed' });
    }
  };
};