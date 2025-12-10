import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwtService from '../utils/jwt';
import User from '../models/User';
import Wallet from '../models/Wallet';
import { generateWalletNumber } from '../utils/database';
import Joi from 'joi';

const redirectUri = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/google/callback`;

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
    const url = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['profile', 'email'],
      prompt: 'consent',
      redirect_uri: redirectUri
    });
    res.redirect(url);
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

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token!,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        return res.status(400).json({ 
          success: false,
          error: 'Failed to get user info' 
        });
      }

      let user = await User.findOne({ where: { email: payload.email } });
      
      if (!user) {
        user = await User.create({
          email: payload.email!,
          fullName: payload.name!,
          googleId: payload.sub,
          profilePicture: payload.picture,
        });

        await Wallet.create({
          userId: user.id,
          walletNumber: generateWalletNumber(),
          balance: 0.00,
        });
      }

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
        },
      });
    } catch (error: any) {
      console.error('Google auth error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Authentication failed' 
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
      const mockUserId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const token = jwtService.generateToken({
        userId: mockUserId,
        email,
      });

      res.json({
        success: true,
        token,
        user: {
          id: mockUserId,
          email,
          fullName,
          profilePicture: null,
        },
        note: 'This is a test login. In production, use Google OAuth.'
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

      res.json({
        success: true,
        user: {
          id: req.user.id,
          email: req.user.email,
          fullName: req.user.fullName,
          profilePicture: req.user.profilePicture,
        },
      });
    } catch (error: any) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }
}