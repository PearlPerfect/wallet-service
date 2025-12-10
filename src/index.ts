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


app.set('trust proxy', true);
app.use(cors(corsOptions));
app.use(helmet());
app.use(morgan('dev'));
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
    node_env: process.env.NODE_ENV,
    database_connected: true
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
    environment: process.env.NODE_ENV || 'development'
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

const startServer = async () => {
  try {
    console.log('🔄 Connecting to database...');

    await syncDatabase(false);
    console.log('✅ Database synchronized successfully');

    // Only start listening if not on Vercel
    if (process.env.VERCEL !== '1') {
      app.listen(PORT, () => {
        console.log(`
🚀 Server running on port ${PORT}
📚 API Documentation: https://wallet-service-83s5.onrender.com/api-docs
        `);
      });
    }
  } catch (error: any) {
    console.error('❌ Failed to start server:', error.message);
    if (process.env.VERCEL !== '1') {
      process.exit(1);
    }
  }
};

startServer();

export default app;