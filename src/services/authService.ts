import User from '../models/User';
import Wallet from '../models/Wallet';
import { generateWalletNumber } from '../utils/database';
import jwtService from '../utils/jwt';
import { OAuth2Client } from 'google-auth-library';

export class AuthService {
  private static client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/google/callback`
  );

  /**
   * Handle Google OAuth authentication
   */
  static async handleGoogleAuth(code: string) {
    try {
      // Exchange code for tokens
      const { tokens } = await AuthService.client.getToken(code);
      AuthService.client.setCredentials(tokens);

      // Verify ID token
      const ticket = await AuthService.client.verifyIdToken({
        idToken: tokens.id_token!,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new Error('Failed to get user info from Google');
      }

      // Find or create user
      let user = await User.findOne({ where: { email: payload.email } });
      
      if (!user) {
        user = await User.create({
          email: payload.email!,
          fullName: payload.name!,
          googleId: payload.sub,
          profilePicture: payload.picture,
        });

        // Create wallet for new user
        await Wallet.create({
          userId: user.id,
          walletNumber: generateWalletNumber(),
          balance: 0.00,
        });
      }

      // Generate JWT token
      const token = jwtService.generateToken({
        userId: user.id,
        email: user.email,
      });

      return {
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          profilePicture: user.profilePicture,
        },
      };
    } catch (error: any) {
      throw new Error('Authentication failed');
    }
  }

  /**
   * Handle test login (creates REAL user in database)
   */
  static async handleTestLogin(email: string, fullName: string) {
    try {
      // Check if user already exists
      let user = await User.findOne({ where: { email } });
      
      if (!user) {
        // Create real user in database
        user = await User.create({
          email,
          fullName,
          // No googleId for test users
        });

        // Create wallet for new user
        await Wallet.create({
          userId: user.id,
          walletNumber: generateWalletNumber(),
          balance: 0.00,
        });
      }

      // Generate JWT token
      const token = jwtService.generateToken({
        userId: user.id,
        email: user.email,
      });

      return {
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          profilePicture: user.profilePicture,
        },
        note: 'This is a test login. In production, use Google OAuth.'
      };
    } catch (error: any) {
      throw new Error('Test login failed');
    }
  }

  /**
   * Get current user info
   */
  static async getCurrentUser(userId: string) {
    try {
      const user = await User.findByPk(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          profilePicture: user.profilePicture,
        },
      };
    } catch (error: any) {
      throw new Error('Failed to get user info');
    }
  }

  /**
   * Generate Google OAuth URL
   */
  static getGoogleAuthUrl() {
    const url = AuthService.client.generateAuthUrl({
      access_type: 'offline',
      scope: ['profile', 'email'],
      prompt: 'consent',
      redirect_uri: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/google/callback`
    });
    
    return url;
  }
}

export default AuthService;