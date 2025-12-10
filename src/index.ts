import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import { corsOptions } from './middleware/security';
import { syncDatabase } from './utils/database';
import authRoutes from './routes/auth';
import walletRoutes from './routes/wallet';
import keyRoutes from './routes/keys';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors(corsOptions));
app.use(helmet());
app.use(morgan('dev')); // Use 'dev' for development for cleaner logs
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
    version: '1.0.0'
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
    }
  });
});

// Routes
app.use('/auth', authRoutes);
app.use('/wallet', walletRoutes);
app.use('/keys', keyRoutes);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : err.message,
  });
});

// 404 handler
app.use((req: express.Request, res: express.Response) => {
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

// Start server
const startServer = async () => {
  try {
    console.log('🔄 Connecting to database...');
    
    // Sync database (force: true only for development, false for production)
    await syncDatabase(process.env.NODE_ENV === 'development');
    console.log('✅ Database synchronized successfully');

    app.listen(PORT, () => {
      console.log(`
🚀 Server running on port ${PORT}
📚 API Documentation: http://localhost:${PORT}/api-docs

Available endpoints:
- GET  /                - Welcome page
- GET  /health          - Health check
- GET  /api-docs        - Swagger documentation

- GET  /auth/google     - Google OAuth
- POST /auth/test-login - Test login
- GET  /auth/me         - Get current user

- POST /keys/create     - Create API key
- POST /keys/rollover   - Rollover expired key
- GET  /keys            - List API keys

- POST /wallet/deposit  - Initialize deposit
- GET  /wallet/balance  - Get balance
- POST /wallet/transfer - Transfer funds
      `);
    });
  } catch (error: any) {
    console.error('❌ Failed to start server:', error.message);
    console.log('\n💡 Troubleshooting tips:');
    console.log('1. Make sure PostgreSQL is running:');
    console.log('   Windows: net start postgresql-x64-16');
    console.log('   Linux/Mac: sudo service postgresql start');
    console.log('2. Create the database manually:');
    console.log('   psql -U postgres');
    console.log('   CREATE DATABASE wallet_service;');
    console.log('3. Check your .env file credentials');
    process.exit(1);
  }
};

startServer();

export default app;