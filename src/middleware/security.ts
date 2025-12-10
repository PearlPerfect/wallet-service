import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// Rate limiting for API endpoints
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Specific rate limit for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 login attempts per hour
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// API key rate limiting (simplified without custom keyGenerator)
export const apiKeyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000, // Higher limit for API keys
  standardHeaders: true,
  legacyHeaders: false,
});

// Validate request body size
export const validateBodySize = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const contentLength = parseInt(req.headers['content-length'] || '0');
  
  if (contentLength > 1024 * 1024) { // 1MB limit
    return res.status(413).json({ error: 'Request body too large' });
  }
  
  next();
};

// CORS configuration - ALLOW ALL ORIGINS
export const corsOptions = {
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
};