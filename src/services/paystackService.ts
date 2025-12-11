import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import Transaction, { TransactionStatus, TransactionType } from '../models/Transaction';
import Wallet from '../models/Wallet';
import walletService from './walletService';

interface InitializeTransactionDto {
  email: string;
  amount: number;
  reference?: string;
  callback_url?: string;
}

interface TransactionResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

interface VerifyTransactionResponse {
  status: boolean;
  message: string;
  data: {
    reference: string;
    amount: number;
    status: 'success' | 'failed' | 'pending' | 'abandoned';
    metadata?: any;
  };
}

interface TransferResponse {
  status: boolean;
  message: string;
  data: {
    reference: string;
    amount: number;
    recipient: {
      name: string;
      account_number: string;
      bank_code: string;
    };
    status: 'success' | 'failed' | 'pending';
  };
}

class PaystackService {
  private readonly baseURL: string;
  private readonly secretKey: string;
  private readonly webhookUrl: string;
  private readonly isProduction: boolean;

  constructor() {
    this.baseURL = process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co';
    this.secretKey = process.env.PAYSTACK_SECRET_KEY || '';
    this.webhookUrl = process.env.WEBHOOK_URL || '';
    this.isProduction = process.env.NODE_ENV === 'production';
    
    console.log('💰 Paystack Service initialized');
    console.log('📊 Base URL:', this.baseURL);
    console.log('🔑 Secret Key configured:', this.secretKey ? 'Yes' : 'No');
    console.log('🌍 Webhook URL:', this.webhookUrl);
    console.log('🏭 Environment:', this.isProduction ? 'Production' : 'Development');
  }

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  async initializeTransaction(
    dto: InitializeTransactionDto
  ): Promise<TransactionResponse> {
    try {
      const reference = dto.reference || `ref_${uuidv4()}`;
      
      console.log('🚀 Initializing Paystack transaction:', {
        email: dto.email,
        amount: dto.amount,
        reference,
        callback_url: dto.callback_url
      });
      
      // Use webhook URL in metadata so Paystack knows where to send webhook
      const response = await axios.post(
        `${this.baseURL}/transaction/initialize`,
        {
          email: dto.email,
          amount: dto.amount * 100, // Convert to kobo
          reference,
          callback_url: dto.callback_url,
          metadata: {
            webhook_url: this.webhookUrl,
            custom_fields: [
              {
                display_name: "Wallet Deposit",
                variable_name: "wallet_deposit",
                value: "true"
              }
            ]
          }
        },
        { headers: this.getHeaders() }
      );

      console.log('✅ Paystack transaction initialized successfully:', {
        reference: response.data.data.reference,
        authorization_url: response.data.data.authorization_url.substring(0, 50) + '...',
        message: 'Open this URL to make payment with test card: 4084084084084081'
      });

      return response.data;
    } catch (error: any) {
      console.error('❌ Paystack initialization error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      throw new Error(error.response?.data?.message || 'Failed to initialize transaction');
    }
  }

  async verifyTransaction(reference: string): Promise<VerifyTransactionResponse> {
    try {
      console.log('🔍 Verifying Paystack transaction:', reference);
      
      const response = await axios.get(
        `${this.baseURL}/transaction/verify/${reference}`,
        { headers: this.getHeaders() }
      );

      console.log('✅ Paystack verification result:', {
        reference: response.data.data.reference,
        status: response.data.data.status,
        amount: response.data.data.amount / 100
      });

      return response.data;
    } catch (error: any) {
      console.error('❌ Paystack verification error:', error.response?.data);
      throw new Error(error.response?.data?.message || 'Failed to verify transaction');
    }
  }

  async handleWebhook(
    body: any,
    signature: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log('🔄 ========== WEBHOOK RECEIVED ==========');
      
      // Validate body structure
      if (!body || typeof body !== 'object') {
        console.error('❌ Invalid webhook body:', body);
        return { success: false, message: 'Invalid webhook body' };
      }
      
      console.log('📧 Event:', body.event);
      console.log('🔗 Reference:', body.data?.reference);
      console.log('💰 Amount:', body.data?.amount);
      console.log('🏦 Status:', body.data?.status);
      console.log('📝 Signature:', signature ? `${signature.substring(0, 20)}...` : 'None');
      
      // In development, allow manual testing without signature
      const isManualTest = signature && (
        signature.startsWith('test_sig_') || 
        signature.startsWith('manual-trigger-') ||
        signature.startsWith('public-status-')
      );
      
      // Check if we should verify signature
      const shouldVerifySignature = this.isProduction || (!isManualTest && signature);
      
      if (shouldVerifySignature) {
        if (!signature) {
          console.error('❌ Missing webhook signature');
          return { success: false, message: 'Missing signature' };
        }
        
        // Verify webhook signature
        const isValid = await this.verifySignature(body, signature);
        if (!isValid) {
          console.error('❌ Invalid webhook signature');
          return { success: false, message: 'Invalid webhook signature' };
        }
        console.log('✅ Webhook signature verified');
      } else {
        console.log('🧪 Skipping signature verification (development/manual test)');
      }

      const event = body.event;
      const data = body.data;

      if (!event || !data) {
        console.error('❌ Missing event or data in webhook');
        return { success: false, message: 'Missing event or data in webhook' };
      }

      console.log(`🎯 Processing Paystack webhook event: ${event}`);

      switch (event) {
        case 'charge.success':
          await this.processSuccessfulCharge(data);
          return { success: true, message: 'Charge successful' };
          
        case 'transfer.success':
          await this.processTransferSuccess(data);
          return { success: true, message: 'Transfer successful' };
          
        case 'charge.failed':
          await this.processFailedCharge(data);
          return { success: true, message: 'Charge failed' };
          
        case 'transfer.failed':
          await this.processTransferFailed(data);
          return { success: true, message: 'Transfer failed' };

        case 'transfer.reversed':
          await this.processTransferReversed(data);
          return { success: true, message: 'Transfer reversed' };
          
        default:
          console.log(`ℹ️ Unhandled webhook event: ${event}`);
          return { success: true, message: 'Event not processed' };
      }
    } catch (error: any) {
      console.error('🔥 Webhook processing error:', error.message);
      console.error('Stack:', error.stack);
      return { success: false, message: error.message };
    } finally {
      console.log('🔄 ========== WEBHOOK PROCESSING COMPLETE ==========');
    }
  }

  private async verifySignature(body: any, signature: string): Promise<boolean> {
    // Create HMAC SHA512 hash
    const hash = crypto
      .createHmac('sha512', this.secretKey)
      .update(JSON.stringify(body))
      .digest('hex');
    
    console.log('🔐 Signature verification:', {
      received: signature.substring(0, 20) + '...',
      computed: hash.substring(0, 20) + '...',
      match: hash === signature
    });
    
    return hash === signature;
  }

  private async processSuccessfulCharge(data: any) {
    console.log('💸 Processing successful charge:', {
      reference: data.reference,
      amount: data.amount,
      status: data.status
    });
    
    const transaction = await Transaction.findOne({
      where: { reference: data.reference },
    });

    if (!transaction) {
      console.error('❌ Transaction not found for reference:', data.reference);
      // In development, try to create a transaction if it doesn't exist
      if (!this.isProduction) {
        console.log('⚠️ Attempting to find transaction by checking all recent transactions...');
        const allTransactions = await Transaction.findAll({
          limit: 10,
          order: [['createdAt', 'DESC']]
        });
        console.log('Recent transactions:', allTransactions.map(t => t.reference));
      }
      throw new Error('Transaction not found');
    }

    // Prevent double processing
    if (transaction.status === TransactionStatus.SUCCESS) {
      console.log('⚠️ Transaction already processed:', data.reference);
      return;
    }

    console.log('📝 Updating transaction status to SUCCESS');
    // Update transaction status
    await transaction.updateStatus(TransactionStatus.SUCCESS, data);

    // Credit wallet - Paystack amount is in kobo, convert to Naira
    const wallet = await Wallet.findOne({
      where: { userId: transaction.userId },
    });

    if (wallet) {
      // Convert amount from kobo to Naira (divide by 100)
      const depositAmountInNaira = parseFloat(data.amount) / 100;
      const oldBalance = parseFloat(wallet.balance.toString());
      
      // Calculate new balance properly
      const newBalance = oldBalance + depositAmountInNaira;
      
      // Update wallet with proper decimal places
      wallet.balance = parseFloat(newBalance.toFixed(2));
      await wallet.save();
      
      console.log(`✅ Wallet ${wallet.id} credited:`, {
        amountInKobo: data.amount,
        amountInNaira: depositAmountInNaira,
        oldBalance: oldBalance.toFixed(2),
        newBalance: wallet.balance.toFixed(2),
        difference: (wallet.balance - oldBalance).toFixed(2)
      });
      
      // Also update the transaction with wallet info
      transaction.metadata = JSON.stringify({
        ...(transaction.metadata ? JSON.parse(transaction.metadata) : {}),
        walletId: wallet.id,
        walletNumber: wallet.walletNumber,
        creditedAt: new Date().toISOString(),
        paystackAmountInKobo: data.amount,
        depositAmountInNaira: depositAmountInNaira
      });
      await transaction.save();
    } else {
      console.error('❌ Wallet not found for user:', transaction.userId);
      throw new Error('Wallet not found');
    }
  }

  private async processFailedCharge(data: any) {
    console.log('💥 Processing failed charge:', data.reference);
    
    const transaction = await Transaction.findOne({
      where: { reference: data.reference },
    });

    if (transaction) {
      await transaction.updateStatus(TransactionStatus.FAILED, data);
      console.log(`📝 Transaction ${transaction.id} marked as FAILED`);
    } else {
      console.log(`ℹ️ No transaction found for failed charge: ${data.reference}`);
    }
  }

  private async processTransferSuccess(data: any) {
    console.log('✅ Processing transfer success:', data.reference);
    
    // Look for a withdrawal transaction with this reference
    const transaction = await Transaction.findOne({
      where: { 
        reference: data.reference,
        type: TransactionType.WITHDRAWAL 
      },
    });

    if (transaction) {
      await transaction.updateStatus(TransactionStatus.SUCCESS, data);
      console.log(`📝 Withdrawal transaction ${transaction.id} marked as SUCCESS`);
    } else {
      console.log(`ℹ️ No withdrawal transaction found for reference: ${data.reference}`);
    }
  }

  private async processTransferFailed(data: any) {
    console.log('💥 Processing transfer failed:', data.reference);
    
    // Look for a withdrawal transaction with this reference
    const transaction = await Transaction.findOne({
      where: { 
        reference: data.reference,
        type: TransactionType.WITHDRAWAL 
      },
    });

    if (transaction) {
      await transaction.updateStatus(TransactionStatus.FAILED, data);
      
      // Refund wallet if transfer failed
      const wallet = await Wallet.findOne({
        where: { userId: transaction.userId },
      });

      if (wallet) {
        const oldBalance = parseFloat(wallet.balance.toString());
        wallet.balance = parseFloat((oldBalance + transaction.amount).toFixed(2));
        await wallet.save();
        
        console.log(`🔄 Wallet ${wallet.id} refunded:`, {
          amount: transaction.amount,
          oldBalance: oldBalance.toFixed(2),
          newBalance: wallet.balance.toFixed(2),
          reason: 'transfer_failed'
        });
      }
      
      console.log(`📝 Withdrawal transaction ${transaction.id} marked as FAILED and refunded`);
    } else {
      console.log(`ℹ️ No withdrawal transaction found for failed transfer: ${data.reference}`);
    }
  }

  private async processTransferReversed(data: any) {
    console.log('🔄 Processing transfer reversed:', data.reference);
    
    const transaction = await Transaction.findOne({
      where: { 
        reference: data.reference,
        type: TransactionType.WITHDRAWAL 
      },
    });

    if (transaction) {
      await transaction.updateStatus(TransactionStatus.REVERSED, data);
      
      // Refund wallet for reversed transfer
      const wallet = await Wallet.findOne({
        where: { userId: transaction.userId },
      });

      if (wallet) {
        const oldBalance = parseFloat(wallet.balance.toString());
        wallet.balance = parseFloat((oldBalance + transaction.amount).toFixed(2));
        await wallet.save();
        
        console.log(`🔄 Wallet ${wallet.id} refunded:`, {
          amount: transaction.amount,
          oldBalance: oldBalance.toFixed(2),
          newBalance: wallet.balance.toFixed(2),
          reason: 'transfer_reversed'
        });
      }
      
      console.log(`📝 Withdrawal transaction ${transaction.id} marked as REVERSED and refunded`);
    } else {
      console.log(`ℹ️ No withdrawal transaction found for reversed transfer: ${data.reference}`);
    }
  }

  // New method to manually trigger webhook for testing
  async triggerManualWebhook(reference: string, amount: number): Promise<{ success: boolean; message: string }> {
    const webhookPayload = {
      event: 'charge.success',
      data: {
        reference,
        amount: amount * 100, // Convert to kobo
        status: 'success',
        metadata: {
          manual_trigger: true,
          timestamp: new Date().toISOString()
        }
      }
    };
    
    const signature = `manual-trigger-${Date.now()}`;
    
    console.log('🧪 Manually triggering webhook for testing');
    return await this.handleWebhook(webhookPayload, signature);
  }
}

export default new PaystackService();