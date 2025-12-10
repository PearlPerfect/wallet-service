import { Request, Response } from 'express';
import Joi from 'joi';
import paystackService from '../services/paystackService';
import walletService from '../services/walletService';
import Transaction, { TransactionStatus } from '../models/Transaction';

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

      // Use the webhook URL from environment for callback
      const frontendUrl = process.env.FRONTEND_URL?.endsWith('/') 
        ? process.env.FRONTEND_URL.slice(0, -1) 
        : process.env.FRONTEND_URL || 'http://localhost:3000';
      
      // Use public status endpoint for callback
      const callbackUrl = `${frontendUrl}/wallet/deposit/${transaction.reference}/public-status`;

      const response = await paystackService.initializeTransaction({
        email,
        amount: value.amount,
        reference: transaction.reference!,
        callback_url: callbackUrl,
      });

      res.json({
        success: true,
        reference: response.data.reference,
        authorization_url: response.data.authorization_url,
        amount: value.amount,
        status: 'pending',
        message: 'Payment initialized successfully',
        transactionId: transaction.id,
        callback_url: callbackUrl,
        instructions: {
          test_payment: 'Use test card: 4084084084084081',
          webhook_status: 'Webhook URL: ' + process.env.WEBHOOK_URL,
          check_status: `GET ${frontendUrl}/wallet/deposit/${transaction.reference}/public-status`
        }
      });
    } catch (error: any) {
      console.error('Deposit error:', error);
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }

  static async handleWebhook(req: Request, res: Response) {
    try {
      const signature = req.headers['x-paystack-signature'] as string;
      
      // Log all headers for debugging
      console.log('📋 Webhook Headers:', JSON.stringify(req.headers, null, 2));
      console.log('📦 Webhook Body:', JSON.stringify(req.body, null, 2));
      
      const result = await paystackService.handleWebhook(req.body, signature);
      
      if (result.success) {
        console.log('✅ Webhook processed successfully');
        // Always return 200 to Paystack even if we had errors
        res.status(200).json({ status: true, message: 'Webhook processed' });
      } else {
        console.log('❌ Webhook processing failed:', result.message);
        // Still return 200 to Paystack to avoid retries
        res.status(200).json({ 
          status: false, 
          message: result.message,
          note: 'Logged error but returning 200 to prevent Paystack retries'
        });
      }
    } catch (error: any) {
      console.error('🔥 Webhook error:', error);
      // IMPORTANT: Always return 200 to Paystack to prevent infinite retries
      res.status(200).json({ 
        status: false,
        error: 'Webhook processing failed but acknowledged',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
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

      // If already successful, return immediately
      if (transaction.status === TransactionStatus.SUCCESS) {
        const wallet = await walletService.getWalletByUserId(req.user!.id);
        return res.json({
          success: true,
          reference: transaction.reference,
          status: transaction.status,
          amount: transaction.amount,
          balance: wallet ? wallet.balance : 0,
          createdAt: transaction.createdAt,
          credited: true,
          message: 'Payment already processed successfully'
        });
      }

      // Verify with Paystack
      const paystackResponse = await paystackService.verifyTransaction(reference);
      
      let credited = false;
      let message = `Payment status: ${paystackResponse.data.status}`;
      
      // If Paystack says successful but our DB doesn't, trigger webhook logic
      if (paystackResponse.data.status === 'success') {
        console.log(`🔄 Paystack reports success, checking if we need to credit wallet`);
        
        // Cast to string to avoid TypeScript error
        const currentStatus = transaction.status as string;
        
        if (currentStatus !== TransactionStatus.SUCCESS) {
          console.log(`🔄 Manually triggering webhook logic for reference: ${reference}`);
          
          // Simulate webhook payload
          const webhookPayload = {
            event: 'charge.success',
            data: {
              reference: paystackResponse.data.reference,
              amount: paystackResponse.data.amount,
              status: paystackResponse.data.status,
              metadata: paystackResponse.data.metadata
            }
          };
          
          // Process as if webhook came in
          await paystackService.handleWebhook(webhookPayload, 'manual-trigger-' + reference);
          credited = true;
          message = 'Payment successful! Wallet has been credited.';
        }
      }
      
      // Get updated transaction
      const updatedTransaction = await Transaction.findOne({
        where: { reference },
      });

      const wallet = await walletService.getWalletByUserId(req.user!.id);
      
      res.json({
        success: true,
        reference: paystackResponse.data.reference,
        status: paystackResponse.data.status,
        amount: paystackResponse.data.amount / 100,
        balance: wallet ? wallet.balance : 0,
        credited,
        message,
        transaction_status: updatedTransaction?.status || transaction.status,
        paystack_status: paystackResponse.data.status,
        webhook_configured: !!process.env.WEBHOOK_URL,
      });
    } catch (error: any) {
      console.error('Status check error:', error);
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }

  // NEW: Public status endpoint for Paystack callback
  static async getPublicDepositStatus(req: Request, res: Response) {
    try {
      const { reference } = req.params;
      const { trxref } = req.query;
      
      const actualReference = reference || trxref;
      
      if (!actualReference) {
        return res.status(400).json({ 
          success: false,
          error: 'No transaction reference provided' 
        });
      }

      console.log('🌐 Public status check for reference:', actualReference);
      
      const transaction = await Transaction.findOne({
        where: { reference: actualReference as string },
      });

      if (!transaction) {
        return res.status(404).json({ 
          success: false,
          error: 'Transaction not found' 
        });
      }

      // Verify with Paystack
      const paystackResponse = await paystackService.verifyTransaction(actualReference as string);
      
      let credited = false;
      let message = `Payment ${paystackResponse.data.status}`;
      
      // Cast to string to avoid TypeScript error
      const currentStatus = transaction.status as string;
      
      // If Paystack says successful but our DB doesn't, trigger webhook logic
      if (paystackResponse.data.status === 'success' && currentStatus !== TransactionStatus.SUCCESS) {
        console.log(`🔄 Auto-triggering webhook for public status check: ${actualReference}`);
        
        const webhookPayload = {
          event: 'charge.success',
          data: {
            reference: paystackResponse.data.reference,
            amount: paystackResponse.data.amount,
            status: paystackResponse.data.status,
            metadata: paystackResponse.data.metadata
          }
        };
        
        await paystackService.handleWebhook(webhookPayload, 'public-status-' + actualReference);
        credited = true;
        message = '✅ Payment successful! Your wallet has been credited.';
      }

      // Get updated transaction
      const updatedTransaction = await Transaction.findOne({
        where: { reference: actualReference as string },
      });

      const wallet = await walletService.getWalletByUserId(transaction.userId);
      
      res.json({
        success: true,
        reference: paystackResponse.data.reference,
        status: paystackResponse.data.status,
        amount: paystackResponse.data.amount / 100,
        balance: wallet ? wallet.balance : 0,
        credited,
        message,
        transaction_status: updatedTransaction?.status || transaction.status,
        next_steps: [
          'Check your wallet balance at /wallet/balance',
          'View transaction history at /wallet/transactions'
        ]
      });
    } catch (error: any) {
      console.error('Public status check error:', error);
      
      // Return HTML for browser users
      if (req.headers['user-agent']?.includes('Mozilla')) {
        return res.send(`
          <html>
          <head><title>Payment Status</title></head>
          <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h1>Unable to Check Payment Status</h1>
            <p>There was an error checking your payment status.</p>
            <p>Error: ${error.message}</p>
            <hr>
            <p><a href="/api-docs">API Documentation</a></p>
          </body>
          </html>
        `);
      }
      
      res.status(500).json({ 
        success: false,
        error: 'Unable to check transaction status'
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