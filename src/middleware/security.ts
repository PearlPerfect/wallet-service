import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// Helper function to get client IP (handles Render proxy)
const getClientIP = (req: Request): string => {
  // Check for Render's X-Forwarded-For header
  const forwardedFor = req.headers['x-forwarded-for'];
  
  if (forwardedFor) {
    if (Array.isArray(forwardedFor)) {
      return forwardedFor[0];
    }
    // Handle comma-separated list
    return forwardedFor.split(',')[0].trim();
  }
  
  // Fallback to default Express IP
  return req.ip || 'unknown';
};

// Rate limiting for API endpoints
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIP(req),
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/';
  }
});

// Specific rate limit for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 login attempts per hour
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIP(req),
});

// API key rate limiting
export const apiKeyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000, // Higher limit for API keys
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIP(req),
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

// CORS configuration - ALLOW ALL ORIGINS with Render support
export const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // List of allowed origins
    const allowedOrigins = [
      'https://wallet-service-83s5.onrender.com',
      'http://localhost:3000',
      'http://localhost:8080',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:8080',
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // For Swagger UI in production, allow the current origin
      if (origin.includes('render.com') || origin.includes('localhost')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-API-Key'],
  maxAge: 86400, // 24 hours
};