import { Sequelize } from 'sequelize-typescript';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
console.log('🔧 Initializing database connection...');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL available:', !!process.env.DATABASE_URL);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  throw new Error('DATABASE_URL is required');
}

const dbUrl = process.env.DATABASE_URL;
const maskedUrl = dbUrl.replace(/:[^:@]*@/, ':****@');
console.log('🔗 Database URL:', maskedUrl);

// Create Sequelize instance with explicit pg dialect
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectModule: require('pg'), 
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 60000, // Increased for serverless
    idle: 10000
  },
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  models: [
    path.join(__dirname, '../models/User.ts'),
    path.join(__dirname, '../models/Wallet.ts'),
    path.join(__dirname, '../models/Transaction.ts'),
    path.join(__dirname, '../models/ApiKey.ts')
  ],
  // Important for serverless
  define: {
    freezeTableName: true,
    timestamps: true
  }
});


if (process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1') {
  sequelize.authenticate()
    .then(() => {
      console.log('✅ Database connection successful');
    })
    .catch((error: any) => {
      console.error('❌ Database connection failed:', error.message);
    });
}

export default sequelize;