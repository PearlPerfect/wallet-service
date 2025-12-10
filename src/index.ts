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

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

// Always enable Swagger in both environments
const enableSwagger = process.env.ENABLE_SWAGGER !== 'false'; // Default: true

if (isProduction) {
  app.set('trust proxy', 1);
  console.log('🌐 Production mode: Trust proxy enabled');
}

// Middleware
app.use(cors(corsOptions));
app.use(helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:", "data:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https:", "data:"],
    }
  } : false,
  crossOriginEmbedderPolicy: false,
}));
app.use(morgan(isProduction ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Swagger Documentation - Always enabled unless explicitly disabled
if (enableSwagger) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: "Wallet Service API",
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
    }
  }));
  console.log('📚 Swagger UI available at /api-docs');
} else {
  console.log('🚫 Swagger UI disabled (ENABLE_SWAGGER=false)');
}

// Health check with detailed information
app.get('/health', (req, res) => {
  const healthData = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Wallet Service API',
    version: '1.0.0',
    node_env: NODE_ENV,
    environment: {
      node_version: process.version,
      platform: process.platform,
      memory_usage: process.memoryUsage(),
      uptime: process.uptime(),
    },
    server: {
      host: req.hostname,
      ip: req.ip,
      protocol: req.protocol,
      secure: req.secure,
    },
    database: {
      connected: true,
      type: 'PostgreSQL',
    },
    features: {
      swagger_enabled: enableSwagger,
      authentication: true,
      paystack_integration: true,
      api_keys: true,
    }
  };
  
  res.json(healthData);
});

// Welcome route
app.get('/', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  const response = {
    message: '🚀 Welcome to Wallet Service API',
    description: 'A secure wallet service with Paystack integration',
    version: '1.0.0',
    environment: NODE_ENV,
    documentation: enableSwagger ? `${baseUrl}/api-docs` : 'Disabled (set ENABLE_SWAGGER=true to enable)',
    endpoints: {
      authentication: {
        google_oauth: `${baseUrl}/auth/google`,
        test_login: `${baseUrl}/auth/test-login`,
        get_current_user: `${baseUrl}/auth/me`,
        refresh_token: `${baseUrl}/auth/refresh`,
      },
      wallet: {
        deposit: `${baseUrl}/wallet/deposit`,
        transfer: `${baseUrl}/wallet/transfer`,
        balance: `${baseUrl}/wallet/balance`,
        transactions: `${baseUrl}/wallet/transactions`,
        details: `${baseUrl}/wallet/details`,
        public_status: `${baseUrl}/wallet/deposit/{reference}/public-status`,
      },
      api_keys: {
        create: `${baseUrl}/keys/create`,
        list: `${baseUrl}/keys`,
        revoke: `${baseUrl}/keys/revoke/:id`,
      },
      health: `${baseUrl}/health`,
    },
    instructions: {
      authentication: 'Use Google OAuth or test login to get JWT token',
      authorization: 'Add "Authorization: Bearer <token>" header to requests',
      api_keys: 'For service-to-service communication, use "x-api-key" header',
      testing: 'For Paystack test payments, use card: 4084084084084081',
    },
    status: 'operational',
    timestamp: new Date().toISOString(),
    swagger_enabled: enableSwagger,
  };
  
  res.json(response);
});

// API Routes
app.use('/auth', authRoutes);
app.use('/wallet', walletRoutes);
app.use('/keys', keyRoutes);

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('🔥 Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });
  
  const statusCode = err.status || 500;
  const errorResponse: any = {
    success: false,
    error: isProduction ? 'Something went wrong!' : err.message,
    timestamp: new Date().toISOString(),
    request_id: req.headers['x-request-id'] || Math.random().toString(36).substring(7),
  };
  
  if (!isProduction) {
    errorResponse.stack = err.stack;
    errorResponse.details = err.details;
  }
  
  res.status(statusCode).json(errorResponse);
});

// 404 handler - EXCLUDE /api-docs from 404 if Swagger is enabled
app.use((req: express.Request, res: express.Response) => {
  // Don't show 404 for /api-docs if Swagger is enabled
  if (enableSwagger && req.originalUrl === '/api-docs') {
    return res.redirect('/api-docs/'); // Redirect to trailing slash
  }
  
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  res.status(404).json({
    success: false,
    error: `Route ${req.originalUrl} not found`,
    message: 'Check the API documentation for available endpoints',
    available_endpoints: {
      root: `${baseUrl}/`,
      health: `${baseUrl}/health`,
      authentication: `${baseUrl}/auth`,
      wallet: `${baseUrl}/wallet`,
      api_keys: `${baseUrl}/keys`,
      documentation: enableSwagger ? `${baseUrl}/api-docs` : undefined,
    },
    timestamp: new Date().toISOString(),
  });
});

// Graceful shutdown handler
const gracefulShutdown = () => {
  console.log('🛑 Received shutdown signal, closing server gracefully...');
  
  // Close server
  if (server) {
    server.close(() => {
      console.log('✅ HTTP server closed');
      process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      console.error('⏰ Force closing server after timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('SIGUSR2', gracefulShutdown);

let server: any;

const startServer = async () => {
  try {
  
    console.log('🔄 Connecting to database...');
    await syncDatabase(false);
    console.log('✅ Database synchronized successfully');
    
    server = app.listen(PORT, () => {
      const baseUrl = `http://localhost:${PORT}`;
      const renderUrl = process.env.RENDER_EXTERNAL_URL;
      const serverUrl = isProduction && renderUrl ? renderUrl : baseUrl;
      
      console.log(`
🎉 Server started successfully!
🚀 Server running on port ${PORT}

📚 Documentation: ${enableSwagger ? `${serverUrl}/api-docs` : 'Disabled'}
❤️  Health Check: ${serverUrl}/health
🔐 Google OAuth: ${serverUrl}/auth/google

📊 Database: Connected
🛡️  Security: ${isProduction ? 'Production mode' : 'Development mode'}
      `);
      
      if (enableSwagger) {
        console.log(`
💡 Quick Start:
1. Authenticate: ${serverUrl}/auth/google
2. Test deposit: ${serverUrl}/api-docs/#/Wallet/post_wallet_deposit
3. Use test card: 4084084084084081
        `);
      }
    });
    
    // Handle server errors
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
        process.exit(1);
      } else {
        process.exit(1);
      }
    });
    
  } catch (error: any) {
    console.error('❌ Failed to start server:', error.message);
    
    // Provide helpful error messages
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Database connection failed. Please check:');
    }
    
    process.exit(1);
  }
};

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('🔥 Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  
  // Don't exit in production, try to recover
  if (isProduction) {
    console.log('⚠️  Uncaught exception in production, continuing...');
  } else {
    process.exit(1);
  }
});

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  
  // Don't exit in production
  if (!isProduction) {
    process.exit(1);
  }
});

// Start the server
if (require.main === module) {
  startServer();
}

export default app;