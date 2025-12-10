import { Sequelize } from 'sequelize-typescript';
import dotenv from 'dotenv';
import User from '../models/User';
import Wallet from '../models/Wallet';
import Transaction from '../models/Transaction';
import ApiKey from '../models/ApiKey';

dotenv.config();

console.log('🔧 Initializing database connection...');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL available:', !!process.env.DATABASE_URL);

if (!process.env.DATABASE_URL) {
  throw new Error('❌ DATABASE_URL is required');
}

const dbUrl = process.env.DATABASE_URL;
const maskedUrl = dbUrl.replace(/:[^:@]*@/, ':****@');
console.log('🔗 Database URL:', maskedUrl);

// Create Sequelize instance
const sequelize = new Sequelize(dbUrl, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,

  dialectOptions:
    process.env.NODE_ENV === 'production'
      ? {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        }
      : {},

  pool: {
    max: 5,
    min: 0,
    acquire: 60000,
    idle: 10000,
  },

  define: {
    freezeTableName: true,
    timestamps: true,
  },
});

sequelize.addModels([User, Wallet, Transaction, ApiKey]);

if (process.env.NODE_ENV !== 'production') {
  sequelize
    .authenticate()
    .then(() => console.log('✅ Database connection successful'))
    .catch((error) => console.error('❌ DB connection failed:', error.message));
}

export default sequelize;
