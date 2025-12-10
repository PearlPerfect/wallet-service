import 'reflect-metadata';
import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from '../src/config/swagger';
import { corsOptions } from '../src/middleware/security';
import authRoutes from '../src/routes/auth';
import walletRoutes from '../src/routes/wallet';
import keyRoutes from '../src/routes/keys';
import sequelize from '../src/config/database';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Middleware
app.use(cors(corsOptions));
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Wallet Service',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'production'
  });
});

// Welcome route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Wallet Service API',
    documentation: '/api-docs',
    health: '/health',
    endpoints: {
      authentication: '/auth',
      api_keys: '/keys',
      wallet: '/wallet'
    },
    environment: process.env.NODE_ENV || 'production'
  });
});

// Routes
app.use('/auth', authRoutes);
app.use('/wallet', walletRoutes);
app.use('/keys', keyRoutes);

// Error handling
app.use((err: any, req: Request, res: Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : err.message,
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ 
    success: false,
    error: 'Route not found',
    available_endpoints: {
      root: '/',
      health: '/health',
      api_docs: '/api-docs',
      auth: '/auth',
      wallet: '/wallet',
      keys: '/keys'
    }
  });
});

// Initialize database connection (don't sync tables in serverless)
let isDbConnected = false;

async function ensureDbConnection() {
  if (!isDbConnected) {
    try {
      await sequelize.authenticate();
      console.log('✅ Database connection established');
      isDbConnected = true;
    } catch (error: any) {
      console.error('❌ Database connection failed:', error.message);
      throw error;
    }
  }
}

// Middleware to ensure DB is connected before handling requests
app.use(async (req: Request, res: Response, next: express.NextFunction) => {
  try {
    await ensureDbConnection();
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Database connection failed'
    });
  }
});

// Export for Vercel
export default app;