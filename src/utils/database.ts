import sequelize from '../config/database';
import User from '../models/User';
import Wallet from '../models/Wallet';
import Transaction from '../models/Transaction';
import ApiKey from '../models/ApiKey';
import { Op } from 'sequelize';

const syncDatabase = async (force = false) => {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    // Define associations
    User.hasOne(Wallet, { foreignKey: 'userId', onDelete: 'CASCADE' });
    Wallet.belongsTo(User, { foreignKey: 'userId' });

    User.hasMany(Transaction, { foreignKey: 'userId', onDelete: 'CASCADE' });
    Transaction.belongsTo(User, { foreignKey: 'userId' });

    User.hasMany(ApiKey, { foreignKey: 'userId', onDelete: 'CASCADE' });
    ApiKey.belongsTo(User, { foreignKey: 'userId' });

    // Sync models
    await sequelize.sync({ force });
    console.log('Database synced successfully.');

    // Create indexes
    await createIndexes();

    // Create test user if needed
    if (force) {
      await createTestData();
    }
  } catch (error) {
    console.error('Unable to sync database:', error);
    process.exit(1);
  }
};

const createIndexes = async () => {
  try {
    // Create indexes using Sequelize queries
    const indexes = [
      // Users table indexes
      `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
      `CREATE INDEX IF NOT EXISTS idx_users_google_id ON users("googleId")`,
      
      // Wallets table indexes
      `CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets("userId")`,
      `CREATE INDEX IF NOT EXISTS idx_wallets_wallet_number ON wallets("walletNumber")`,
      `CREATE INDEX IF NOT EXISTS idx_wallets_balance ON wallets(balance)`,
      
      // Transactions table indexes
      `CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions("userId")`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference)`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status)`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions("createdAt")`,
      
      // Composite indexes for common queries
      `CREATE INDEX IF NOT EXISTS idx_transactions_user_status ON transactions("userId", status)`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_user_type ON transactions("userId", type)`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions("userId", "createdAt")`,
      
      // API Keys table indexes
      `CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys("keyHash")`,
      `CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys("userId")`,
      `CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys("expiresAt")`,
      `CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys("isActive")`,
      
      // Composite index for active API keys check
      `CREATE INDEX IF NOT EXISTS idx_api_keys_user_active ON api_keys("userId", "isActive", "expiresAt")`
    ];

    for (const indexQuery of indexes) {
      try {
        await sequelize.query(indexQuery);
      } catch (error) {
        console.warn(`Index creation warning: ${error}`);
      }
    }
    
    console.log('Database indexes created/verified successfully.');
  } catch (error) {
    console.error('Error creating indexes:', error);
  }
};

const createTestData = async () => {
  try {
    // Create test user 1
    const user1 = await User.create({
      email: 'test1@example.com',
      fullName: 'Test User 1',
      googleId: 'test123',
    });

    // Create wallet for user 1
    await Wallet.create({
      userId: user1.id,
      walletNumber: generateWalletNumber(),
      balance: 10000.00,
    });

    // Create test user 2
    const user2 = await User.create({
      email: 'test2@example.com',
      fullName: 'Test User 2',
      googleId: 'test456',
    });

    // Create wallet for user 2
    await Wallet.create({
      userId: user2.id,
      walletNumber: generateWalletNumber(),
      balance: 5000.00,
    });

    console.log('Test data created successfully.');
  } catch (error) {
    console.error('Error creating test data:', error);
  }
};

const generateWalletNumber = (): string => {
  return Math.floor(1000000000000 + Math.random() * 9000000000000).toString();
};

export { syncDatabase, generateWalletNumber };