require('dotenv').config();
const { OAuth2Client } = require('google-auth-library');
const sequelize = require('../config/database').default;
const User = require('../models/User').default;

async function debugGoogleAuth() {
  try {
    console.log('🔧 Debugging Google OAuth Setup\n');
    
    // 1. Check environment variables
    console.log('1. Checking environment variables:');
    console.log('   GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? '✓ Set' : '✗ Missing');
    console.log('   GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? '✓ Set' : '✗ Missing');
    console.log('   FRONTEND_URL:', process.env.FRONTEND_URL || 'Not set (using default)');
    
    // 2. Check database connection
    console.log('\n2. Checking database connection...');
    await sequelize.authenticate();
    console.log('   ✓ Database connected');
    
    // 3. Check if your email exists
    console.log('\n3. Checking for your email in database...');
    const yourEmail = 'favourudoh2020@gmail.com';
    const existingUser = await User.findOne({ where: { email: yourEmail } });
    
    if (existingUser) {
      console.log('   ✓ User found in database:');
      console.log('     ID:', existingUser.id);
      console.log('     Email:', existingUser.email);
      console.log('     Name:', existingUser.fullName);
      console.log('     Google ID:', existingUser.googleId || 'Not set');
    } else {
      console.log('   ✗ User NOT found in database');
      console.log('   This explains why you get "user not found" errors!');
    }
    
    // 4. List all users
    console.log('\n4. All users in database:');
    const allUsers = await User.findAll({
      attributes: ['id', 'email', 'fullName', 'googleId', 'createdAt']
    });
    
    if (allUsers.length === 0) {
      console.log('   No users found');
    } else {
      allUsers.forEach(user => {
        console.log(`   - ${user.email} (${user.fullName})`);
        console.log(`     ID: ${user.id}`);
        console.log(`     Google ID: ${user.googleId || 'N/A'}`);
        console.log('');
      });
    }
    
    // 5. Test OAuth2Client initialization
    console.log('\n5. Testing OAuth2Client initialization...');
    try {
      const redirectUri = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/google/callback`;
      console.log('   Redirect URI:', redirectUri);
      
      const client = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );
      console.log('   ✓ OAuth2Client initialized successfully');
    } catch (error) {
      console.log('   ✗ OAuth2Client initialization failed:', error.message);
    }
    
    console.log('\n🎯 RECOMMENDATION:');
    console.log('1. Use the test login endpoint first to create a user:');
    console.log('   POST http://localhost:3000/auth/test-login');
    console.log('   Body: {"email":"favourudoh2020@gmail.com","fullName":"Your Name"}');
    console.log('\n2. Then use the returned token to create API keys');
    console.log('\n3. For Google OAuth, make sure your Google Console has:');
    console.log('   - Redirect URI: http://localhost:3000/auth/google/callback');
    console.log('   - Your email added to test users if using restricted app');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await sequelize.close();
    console.log('\n🔚 Database connection closed');
  }
}

debugGoogleAuth();