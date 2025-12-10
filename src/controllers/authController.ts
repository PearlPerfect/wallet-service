import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwtService from '../utils/jwt';
import User from '../models/User';
import Wallet from '../models/Wallet';
import { generateWalletNumber } from '../utils/database';
import Joi from 'joi';

const frontendUrl = process.env.FRONTEND_URL?.endsWith('/') 
  ? process.env.FRONTEND_URL.slice(0, -1) 
  : process.env.FRONTEND_URL || 'http://localhost:3000';

const redirectUri = `${frontendUrl}/auth/google/callback`;
// Initialize OAuth2Client
const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  redirectUri
);

const testLoginSchema = Joi.object({
  email: Joi.string().email().required(),
  fullName: Joi.string().required(),
});

export class AuthController {
  static async googleAuth(req: Request, res: Response) {
    try {
      const url = client.generateAuthUrl({
        access_type: 'offline',
        scope: ['profile', 'email'],
        prompt: 'consent',
        redirect_uri: redirectUri
      });
      res.redirect(url);
    } catch (error: any) {
      res.status(500).json({ 
        success: false,
        error: 'Failed to initiate Google OAuth' 
      });
    }
  }

  static async googleCallback(req: Request, res: Response) {
    try {
      const { code } = req.query;
      
      if (!code) {
        return res.status(400).json({ 
          success: false,
          error: 'Authorization code missing' 
        });
      }
      const { tokens } = await client.getToken(code as string);
      client.setCredentials(tokens);

      if (!tokens.id_token) {
        throw new Error('No ID token received from Google');
      }

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        return res.status(400).json({ 
          success: false,
          error: 'Failed to get user info from Google' 
        });
      }


      // Find or create user
      let user = await User.findOne({ 
        where: { 
          email: payload.email 
        } 
      });
      
      if (!user) {
        user = await User.create({
          email: payload.email!,
          fullName: payload.name!,
          googleId: payload.sub,
          profilePicture: payload.picture,
        });


        // Create wallet for new user
        const walletNumber = generateWalletNumber();
        await Wallet.create({
          userId: user.id,
          walletNumber: walletNumber,
          balance: 0.00,
        });
      } else {
        
        // Update user details if needed
        if (!user.googleId) {
          user.googleId = payload.sub;
          await user.save();
          console.log('Updated user with Google ID');
        }
      }

      // Generate JWT token
      const token = jwtService.generateToken({
        userId: user.id,
        email: user.email,
      });

      
      // Get wallet info
      const wallet = await Wallet.findOne({ where: { userId: user.id } });
      
      // Return JSON response directly
      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          profilePicture: user.profilePicture,
          googleId: user.googleId,
          createdAt: user.createdAt
        },
        wallet: wallet ? {
          id: wallet.id,
          walletNumber: wallet.walletNumber,
          balance: wallet.balance,
          createdAt: wallet.createdAt
        } : null,
        message: 'Google authentication successful. Use this token in Authorization header as Bearer token.',
        instructions: {
          authorization: 'Add this header to your requests:',
          header: 'Authorization: Bearer ' + token,
          endpoints: [
            'GET /auth/me - Get current user info',
            'POST /keys/create - Create API key',
            'GET /wallet/balance - Check wallet balance',
            'POST /wallet/deposit - Deposit funds',
            'POST /wallet/transfer - Transfer to another wallet'
          ]
        }
      });
      
    } catch (error: any) {
      
      // Return error as JSON
      res.status(500).json({ 
        success: false,
        error: error.message || 'Authentication failed',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  static async testLogin(req: Request, res: Response) {
    try {
      const { error, value } = testLoginSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          success: false,
          error: error.details[0].message 
        });
      }

      const { email, fullName } = value;
      
      // Check if user already exists
      let user = await User.findOne({ where: { email } });
      
      if (!user) {
        user = await User.create({
          email,
          fullName,
        });

        // Create wallet for test user
        await Wallet.create({
          userId: user.id,
          walletNumber: generateWalletNumber(),
          balance: 0.00,
        });
      }

      // Get wallet info
      const wallet = await Wallet.findOne({ where: { userId: user.id } });
      
      const token = jwtService.generateToken({
        userId: user.id,
        email: user.email,
      });

      
      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          profilePicture: user.profilePicture,
          createdAt: user.createdAt
        },
        wallet: wallet ? {
          id: wallet.id,
          walletNumber: wallet.walletNumber,
          balance: wallet.balance,
          createdAt: wallet.createdAt
        } : null,
        note: 'This is a test login. In production, use Google OAuth.',
        instructions: {
          authorization: 'Add this header to your requests:',
          header: 'Authorization: Bearer ' + token
        }
      });
    } catch (error: any) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }

  static async getCurrentUser(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          success: false,
          error: 'User not authenticated' 
        });
      }

      // Get user with wallet info
      const user = await User.findByPk(req.user.id, {
        include: [{
          model: Wallet,
          attributes: ['id', 'walletNumber', 'balance', 'createdAt']
        }]
      });

      if (!user) {
        return res.status(404).json({ 
          success: false,
          error: 'User not found' 
        });
      }

      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          profilePicture: user.profilePicture,
          googleId: user.googleId,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        },
        wallet: user.wallet ? {
          id: user.wallet.id,
          walletNumber: user.wallet.walletNumber,
          balance: user.wallet.balance,
          currency: 'NGN',
          createdAt: user.wallet.createdAt
        } : null
      });
    } catch (error: any) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }

  static async refreshToken(req: Request, res: Response) {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ 
          success: false,
          error: 'Token is required' 
        });
      }

      const newToken = jwtService.refreshToken(token);
      
      if (!newToken) {
        return res.status(400).json({ 
          success: false,
          error: 'Invalid or expired token' 
        });
      }

      res.json({
        success: true,
        token: newToken,
        message: 'Token refreshed successfully'
      });
    } catch (error: any) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }

  static async logout(req: Request, res: Response) {
    try {
      // Note: JWT is stateless, so we can't really "logout" on server-side
      // Client should discard the token
      
      res.json({
        success: true,
        message: 'Logout successful. Please discard your token on the client side.',
        instructions: 'Delete the JWT token from client storage (localStorage, cookies, etc.)'
      });
    } catch (error: any) {
      console.error('Logout error:', error);
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }

  static async getUserProfile(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      
      if (!req.user) {
        return res.status(401).json({ 
          success: false,
          error: 'User not authenticated' 
        });
      }

      // Users can only view their own profile
      if (userId !== req.user.id) {
        return res.status(403).json({ 
          success: false,
          error: 'Access denied. You can only view your own profile.' 
        });
      }

      const user = await User.findByPk(userId, {
        include: [{
          model: Wallet,
          attributes: ['id', 'walletNumber', 'balance', 'createdAt']
        }],
        attributes: ['id', 'email', 'fullName', 'profilePicture', 'googleId', 'createdAt', 'updatedAt']
      });

      if (!user) {
        return res.status(404).json({ 
          success: false,
          error: 'User not found' 
        });
      }

      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          profilePicture: user.profilePicture,
          googleId: user.googleId,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        },
        wallet: user.wallet ? {
          id: user.wallet.id,
          walletNumber: user.wallet.walletNumber,
          balance: user.wallet.balance,
          currency: 'NGN',
          createdAt: user.wallet.createdAt
        } : null
      });
    } catch (error: any) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }
}