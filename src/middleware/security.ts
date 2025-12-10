import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

const isProduction = process.env.NODE_ENV === 'production';

// Helper function to get client IP (handles Render proxy)
const getClientIP = (req: Request): string => {
  // Check for proxy headers in production
  if (isProduction) {
    const forwardedFor = req.headers['x-forwarded-for'];
    
    if (forwardedFor) {
      if (Array.isArray(forwardedFor)) {
        return forwardedFor[0];
      }
      // Handle comma-separated list
      return forwardedFor.split(',')[0].trim();
    }
  }
  
  // Fallback to default Express IP
  return req.ip || 'unknown';
};

// Rate limiting for API endpoints - more strict in production
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 100 : 1000, // Different limits for prod/dev
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIP(req),
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/';
  },
  skipSuccessfulRequests: !isProduction, // Only track failures in dev
});

// Specific rate limit for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isProduction ? 5 : 50, // Stricter in production
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIP(req),
});

// API key rate limiting
export const apiKeyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 1000 : 10000, // Higher limit for API keys
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
  const maxSize = isProduction ? 1024 * 1024 : 10 * 1024 * 1024; // 1MB prod, 10MB dev
  
  if (contentLength > maxSize) {
    return res.status(413).json({ 
      success: false,
      error: `Request body too large (max ${maxSize / 1024 / 1024}MB)` 
    });
  }
  
  next();
};

// CORS configuration - Dynamic based on environment
export const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    if (!origin) {
      return callback(null, true);
    }
    
    // List of allowed origins
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:8080',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:8080',
      'https://wallet-service-83s5.onrender.com',
    ];
    
    // Add any custom domains from environment
    if (process.env.FRONTEND_URL) {
      allowedOrigins.push(process.env.FRONTEND_URL);
    }
    
    // Add Render URLs if available
    if (process.env.RENDER_EXTERNAL_URL) {
      allowedOrigins.push(process.env.RENDER_EXTERNAL_URL);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else if (!isProduction) {
      // In development, allow all origins
      callback(null, true);
    } else if (origin.includes('render.com') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      // Allow subdomains of render.com and localhost
      callback(null, true);
    } else {
      console.warn('⚠️ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Length', 'X-API-Key', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: isProduction ? 86400 : 600, // 24 hours in prod, 10 minutes in dev
  optionsSuccessStatus: 204,
};