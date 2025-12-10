import swaggerJsdoc from 'swagger-jsdoc';

// Determine server URLs based on environment
const isProduction = process.env.NODE_ENV === 'production';
const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

const servers = [
  {
    url: baseUrl,
    description: isProduction ? 'Production server' : 'Development server',
  }
];

// Add Render URL if available in production
if (isProduction && process.env.RENDER_EXTERNAL_URL) {
  servers.unshift({
    url: process.env.RENDER_EXTERNAL_URL,
    description: 'Render production server',
  });
}

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Wallet Service API',
      version: '1.0.0',
      description: 'A secure wallet service with Paystack integration for deposits, transfers, and API key management',
      contact: {
        name: 'API Support',
        email: 'support@wallet-service.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers,
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from Google OAuth',
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'API key for service-to-service access',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'string',
              example: 'Error message',
            },
          },
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'fullName'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'test@example.com'
            },
            fullName: {
              type: 'string',
              example: 'Test User'
            }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            token: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
            },
            user: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  example: 'user_123'
                },
                email: {
                  type: 'string',
                  example: 'test@example.com'
                },
                fullName: {
                  type: 'string',
                  example: 'Test User'
                },
                profilePicture: {
                  type: 'string',
                  nullable: true
                }
              }
            },
            note: {
              type: 'string',
              example: 'This is a test login. In production, use Google OAuth.'
            }
          }
        },
        UserResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            user: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  example: 'user_123'
                },
                email: {
                  type: 'string',
                  example: 'test@example.com'
                },
                fullName: {
                  type: 'string',
                  example: 'Test User'
                },
                profilePicture: {
                  type: 'string',
                  nullable: true
                }
              }
            }
          }
        },
        ApiKeyRequest: {
          type: 'object',
          required: ['name', 'permissions', 'expiry'],
          properties: {
            name: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              example: 'wallet-service'
            },
            permissions: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['read', 'deposit', 'transfer']
              },
              example: ['read', 'deposit', 'transfer']
            },
            expiry: {
              type: 'string',
              pattern: '^(\\d+)(m|h|d|w|M|y)$',
              example: '1D'
            }
          }
        },
        ApiKeyResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            api_key: {
              type: 'string',
              example: 'sk_live_xxxxxxxxxxxxxxxx'
            },
            name: {
              type: 'string',
              example: 'wallet-service'
            },
            permissions: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['read', 'deposit', 'transfer']
            },
            expires_at: {
              type: 'string',
              format: 'date-time'
            },
            created_at: {
              type: 'string',
              format: 'date-time'
            },
            warning: {
              type: 'string',
              example: 'Save this API key now. It will not be shown again.'
            }
          }
        },
        DepositRequest: {
          type: 'object',
          required: ['amount'],
          properties: {
            amount: {
              type: 'number',
              minimum: 100,
              maximum: 500000000,
              example: 5000
            },
            email: {
              type: 'string',
              format: 'email'
            }
          }
        },
        DepositResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            reference: {
              type: 'string',
              example: 'ref_123456'
            },
            authorization_url: {
              type: 'string',
              example: 'https://paystack.co/pay/test-reference'
            },
            amount: {
              type: 'number',
              example: 5000
            },
            status: {
              type: 'string',
              example: 'pending'
            },
            message: {
              type: 'string',
              example: 'Payment initialized successfully'
            }
          }
        },
        TransferRequest: {
          type: 'object',
          required: ['wallet_number', 'amount'],
          properties: {
            wallet_number: {
              type: 'string',
              length: 13,
              example: '4566678954356'
            },
            amount: {
              type: 'number',
              minimum: 100,
              maximum: 10000000,
              example: 3000
            },
            description: {
              type: 'string',
              maxLength: 255
            }
          }
        },
        TransferResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            message: {
              type: 'string',
              example: 'Transfer completed successfully'
            },
            transactionId: {
              type: 'string',
              example: 'tx_123456'
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Authentication',
        description: 'Google OAuth authentication endpoints',
      },
      {
        name: 'Wallet',
        description: 'Wallet operations (deposit, transfer, balance)',
      },
      {
        name: 'API Keys',
        description: 'API key management endpoints',
      },
    ],
  },
  // Include both routes and controllers
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);