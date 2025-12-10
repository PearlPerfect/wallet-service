import { Sequelize } from 'sequelize-typescript';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL available:', !!process.env.DATABASE_URL);

let sequelizeConfig: any;

if (process.env.DATABASE_URL) {
  console.log('🔗 Using DATABASE_URL configuration');
  
  const dbUrl = process.env.DATABASE_URL;
  console.log('Database URL:', dbUrl?.replace(/:[^:@]*@/, ':****@')); // Hide password in logs
  
  sequelizeConfig = {
    url: process.env.DATABASE_URL,
    dialect: 'postgres',
    models: [path.join(__dirname, '../models/*.ts')],
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  };
} else {
  console.error('DATABASE_URL is required for production!');
  process.exit(1);
}

const sequelize = new Sequelize(sequelizeConfig);

// Test connection
sequelize.authenticate()
  .then(() => {
    console.log('✅ Database connection successful');
  })
  .catch((error: any) => {
    console.error('❌ Database connection failed:', error.message);
    
    // Don't exit in production - let Vercel handle it
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  });

export default sequelize;