# Wallet Service API

A secure backend wallet service with Paystack integration for deposits, transfers, and API key management. Built with Node.js, TypeScript, PostgreSQL, and Sequelize.

## 🚀 Features

### ✅ Authentication & Security
- **Google OAuth 2.0** for user authentication
- **JWT-based authentication** with token expiry
- **API Key system** for service-to-service access
- **Permission-based access control** (read, deposit, transfer)
- **Rate limiting** on all endpoints
- **CORS enabled** with security headers
- **Request validation** with Joi schemas

### 💰 Wallet Operations
- **Deposit funds** via Paystack payment gateway
- **Wallet-to-wallet transfers** with balance validation
- **Real-time balance checking**
- **Transaction history** with pagination
- **Webhook integration** for payment verification
- **Atomic transactions** to prevent double-spending

### 🔑 API Key Management
- **Create API keys** with custom permissions
- **Key expiry** (supports minutes, hours, days, weeks, months, years)
- **Maximum 5 active keys per user**
- **Key rollover** for expired keys
- **Key revocation** capability
- **HMAC-based key hashing** for security

## 🏗️ Architecture
├── src/
│ ├── config/ # Configuration files
│ │ ├── database.ts # Sequelize configuration
│ │ └── swagger.ts # Swagger/OpenAPI docs
│ ├── controllers/ # Request handlers
│ ├── middleware/ # Authentication & security middleware
│ ├── models/ # Sequelize data models
│ ├── routes/ # API route definitions
│ ├── services/ # Business logic services
│ └── utils/ # Utility functions
└── tests/ # Test files

text

## 📋 Prerequisites

- **Node.js** (v16 or higher)
- **PostgreSQL** (v12 or higher)
- **npm** or **yarn**
- **Google OAuth** credentials
- **Paystack** account with API keys

## ⚡ Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd wallet-service
2. Install Dependencies
bash
npm install
3. Set Up Environment Variables
Create a .env file in the root directory:

env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=wallet_service
DB_USER=postgres
DB_PASSWORD=your_password

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_change_in_production
JWT_EXPIRY=24h

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
FRONTEND_URL=http://localhost:3000

# Paystack Configuration
PAYSTACK_SECRET_KEY=sk_test_your_paystack_secret_key
PAYSTACK_PUBLIC_KEY=pk_test_your_paystack_public_key
PAYSTACK_BASE_URL=https://api.paystack.co

# API Key Configuration
API_KEY_PREFIX=sk_live_
API_KEY_HASH_SECRET=your_api_key_hash_secret_change_in_production

# Webhook Configuration
WEBHOOK_URL=http://localhost:3000/wallet/paystack/webhook
4. Set Up Database
bash
# Create PostgreSQL database
psql -U postgres -c "CREATE DATABASE wallet_service;"

# Or if using a different user
psql -U your_username -c "CREATE DATABASE wallet_service;"
5. Start the Application
bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
The server will start at http://localhost:3000

6. Access API Documentation
Visit http://localhost:3000/api-docs for interactive Swagger documentation.

📚 API Endpoints
Authentication
Method	      Endpoint 	            Description	          Auth Required
GET	         /auth/google	        Initiate Google OAuth	    No
GET	        /auth/google/callback	Google OAuth callback	    No
POST	    /auth/test-login	    Test login (development)	No
GET	        /auth/me	             Get current user	        Yes

API Keys
Method	     Endpoint	                Description	      Auth Required
POST	    /keys/create	            Create API key	    JWT
POST	    /keys/rollover	        Rollover expired key	JWT
GET	        /keys	                List user's API keys	JWT
POST	    /keys/:keyId/revoke	         Revoke API key	    JWT

Wallet Operations
Method	     Endpoint	            Description	          Auth Required
POST	    /wallet/deposit	        Initialize deposit	    JWT/API Key
POST	    /wallet/paystack/webhook Paystack webhook	        No
GET	 /wallet/deposit/:reference/status Check deposit status	JWT/API Key
GET	        /wallet/balance	            Get wallet balance	JWT/API Key
POST	    /wallet/transfer	        Transfer funds	    JWT/API Key
GET	        /wallet/transactions	    Transaction history	JWT/API Key
GET	        /wallet/details	            Get wallet details	JWT/API Key

🔒 Authentication Methods
1. JWT Authentication (For Users)
http
Authorization: Bearer <jwt_token>
2. API Key Authentication (For Services)
http
x-api-key: <api_key>
API Key Permissions
read: Read wallet balance and transactions
deposit: Initialize deposits
transfer: Transfer funds between wallets

💳 Paystack Integration
Deposit Flow
User initiates deposit via /wallet/deposit
System creates transaction record with unique reference
Paystack returns payment link
User completes payment on Paystack
Paystack sends webhook to /wallet/paystack/webhook
System verifies webhook signature and credits wallet