require('dotenv').config();
const path = require('path');
const { syncDatabase } = require('../utils/database');

async function fixExpiredKeys() {
  try {
    console.log('🔧 Fixing expired API keys...');
    
    // Connect to database
    const sequelize = require('../config/database').default;
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Fix expired keys that are still active
    const sql = `
      UPDATE api_keys 
      SET is_active = false, 
          updated_at = NOW() 
      WHERE expires_at < NOW() 
        AND is_active = true
      RETURNING id, name, expires_at;
    `;

    const [result] = await sequelize.query(sql, {
      type: sequelize.QueryTypes.UPDATE
    });

    console.log(`✅ Fixed ${result.length} expired keys:`);
    result.forEach(key => {
      console.log(`  - ${key.id}: ${key.name} (expired: ${key.expires_at})`);
    });

    // Check current state
    const checkSql = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_count,
        COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_count,
        COUNT(CASE WHEN expires_at < NOW() AND is_active = true THEN 1 END) as expired_but_active
      FROM api_keys;
    `;

    const [stats] = await sequelize.query(checkSql, {
      type: sequelize.QueryTypes.SELECT
    });

    console.log('\n📊 Current API Key Statistics:');
    console.log(`  Total keys: ${stats.total}`);
    console.log(`  Active keys: ${stats.active_count}`);
    console.log(`  Inactive keys: ${stats.inactive_count}`);
    console.log(`  Expired but still active: ${stats.expired_but_active}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

fixExpiredKeys();