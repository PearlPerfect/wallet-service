import { Request, Response } from 'express';
import Joi from 'joi';
import paystackService from '../services/paystackService';
import walletService from '../services/walletService';
import Transaction from '../models/Transaction';

export class WalletController {
  private static depositSchema = Joi.object({
    amount: Joi.number().required().min(100).max(500000000),
    email: Joi.string().email().optional(),
  });

  private static transferSchema = Joi.object({
    wallet_number: Joi.string().required().length(13),
    amount: Joi.number().required().min(100).max(10000000),
    description: Joi.string().max(255).optional(),
  });

  static async deposit(req: Request, res: Response) {
    try {
      const { error, value } = WalletController.depositSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          success: false,
          error: error.details[0].message 
        });
      }

      const email = value.email || req.user!.email;
      const transaction = await walletService.createDepositTransaction(
        req.user!.id,
        value.amount,
        `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      );

      const response = await paystackService.initializeTransaction({
        email,
        amount: value.amount,
        reference: transaction.reference!,
        callback_url: `${process.env.FRONTEND_URL}/deposit/callback`,
      });

      res.json({
        success: true,
        reference: response.data.reference,
        authorization_url: response.data.authorization_url,
        amount: value.amount,
        status: 'pending',
        message: 'Payment initialized successfully',
      });
    } catch (error: any) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }

  static async handleWebhook(req: Request, res: Response) {
    try {
      const signature = req.headers['x-paystack-signature'] as string;
      
      if (!signature) {
        return res.status(400).json({ 
          success: false,
          error: 'Missing signature' 
        });
      }

      const result = await paystackService.handleWebhook(req.body, signature);
      
      if (result.success) {
        res.json({ status: true });
      } else {
        res.status(400).json({ 
          success: false,
          error: result.message 
        });
      }
    } catch (error: any) {
      console.error('Webhook error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Webhook processing failed' 
      });
    }
  }

  static async verifyDepositStatus(req: Request, res: Response) {
    try {
      const { reference } = req.params;
      
      const transaction = await Transaction.findOne({
        where: { reference },
      });

      if (!transaction) {
        return res.status(404).json({ 
          success: false,
          error: 'Transaction not found' 
        });
      }

      if (transaction.status === 'success') {
        return res.json({
          reference: transaction.reference,
          status: transaction.status,
          amount: transaction.amount,
          createdAt: transaction.createdAt,
        });
      }

      const paystackResponse = await paystackService.verifyTransaction(reference);
      
      res.json({
        reference: paystackResponse.data.reference,
        status: paystackResponse.data.status,
        amount: paystackResponse.data.amount / 100,
      });
    } catch (error: any) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }

  static async getBalance(req: Request, res: Response) {
    try {
      const balance = await walletService.getWalletBalance(req.user!.id);
      
      res.json({
        success: true,
        balance,
        currency: 'NGN',
      });
    } catch (error: any) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }

  static async transfer(req: Request, res: Response) {
    try {
      const { error, value } = WalletController.transferSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          success: false,
          error: error.details[0].message 
        });
      }

      const result = await walletService.transferFunds(
        req.user!.id,
        value.wallet_number,
        value.amount,
        value.description
      );

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          transactionId: result.transactionId,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message,
        });
      }
    } catch (error: any) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }

  static async getTransactions(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const type = req.query.type as any;
      const status = req.query.status as any;

      const history = await walletService.getTransactionHistory(
        req.user!.id,
        page,
        limit,
        type,
        status
      );

      res.json({
        success: true,
        transactions: history.transactions.map(t => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          status: t.status,
          reference: t.reference,
          recipient_wallet_number: t.recipientWalletNumber,
          sender_wallet_number: t.senderWalletNumber,
          description: t.description,
          created_at: t.createdAt,
          metadata: t.metadata ? JSON.parse(t.metadata) : null,
        })),
        pagination: {
          page,
          limit,
          total: history.total,
          pages: history.pages,
        },
      });
    } catch (error: any) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }

  static async getWalletDetails(req: Request, res: Response) {
    try {
      const wallet = await walletService.getWalletByUserId(req.user!.id);
      
      if (!wallet) {
        return res.status(404).json({ 
          success: false,
          error: 'Wallet not found' 
        });
      }

      res.json({
        success: true,
        wallet: {
          wallet_number: wallet.walletNumber,
          balance: wallet.balance,
          currency: 'NGN',
          created_at: wallet.createdAt,
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