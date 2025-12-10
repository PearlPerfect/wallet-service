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
    status: 'success' | 'failed' | 'pending';
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

  constructor() {
    this.baseURL = process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co';
    this.secretKey = process.env.PAYSTACK_SECRET_KEY || '';
    
    console.log('💰 Paystack Service initialized');
    console.log('📊 Base URL:', this.baseURL);
    console.log('🔑 Secret Key configured:', this.secretKey ? 'Yes' : 'No');
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
      
      const response = await axios.post(
        `${this.baseURL}/transaction/initialize`,
        {
          email: dto.email,
          amount: dto.amount * 100, // Convert to kobo
          reference,
          callback_url: dto.callback_url,
          metadata: {
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
        authorization_url: response.data.data.authorization_url.substring(0, 50) + '...'
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
      console.log('🔄 Processing webhook...');
      console.log('📧 Event:', body.event);
      console.log('🔗 Reference:', body.data?.reference);
      console.log('💰 Amount:', body.data?.amount);
      console.log('🏦 Status:', body.data?.status);
      
      // For manual testing, skip signature verification
      const isTest = signature.startsWith('test_sig_') || signature.startsWith('manual-trigger-');
      
      if (!isTest) {
        // Verify webhook signature
        const isValid = await this.verifySignature(body, signature);
        if (!isValid) {
          console.error('❌ Invalid webhook signature');
          throw new Error('Invalid webhook signature');
        }
      } else {
        console.log('🧪 Test signature detected, skipping verification');
      }

      const event = body.event;
      const data = body.data;

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
      console.error('🔥 Webhook processing error:', error);
      return { success: false, message: error.message };
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
      amount: data.amount / 100,
      status: data.status
    });
    
    const transaction = await Transaction.findOne({
      where: { reference: data.reference },
    });

    if (!transaction) {
      console.error('❌ Transaction not found for reference:', data.reference);
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

    // Credit wallet
    const wallet = await Wallet.findOne({
      where: { userId: transaction.userId },
    });

    if (wallet) {
      const oldBalance = wallet.balance;
      await wallet.credit(transaction.amount);
      const newBalance = wallet.balance;
      
      console.log(`✅ Wallet ${wallet.id} credited:`, {
        amount: transaction.amount,
        oldBalance,
        newBalance,
        difference: newBalance - oldBalance
      });
    } else {
      console.error('❌ Wallet not found for user:', transaction.userId);
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
        const oldBalance = wallet.balance;
        await wallet.credit(transaction.amount);
        const newBalance = wallet.balance;
        
        console.log(`🔄 Wallet ${wallet.id} refunded:`, {
          amount: transaction.amount,
          oldBalance,
          newBalance,
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
        const oldBalance = wallet.balance;
        await wallet.credit(transaction.amount);
        const newBalance = wallet.balance;
        
        console.log(`🔄 Wallet ${wallet.id} refunded:`, {
          amount: transaction.amount,
          oldBalance,
          newBalance,
          reason: 'transfer_reversed'
        });
      }
      
      console.log(`📝 Withdrawal transaction ${transaction.id} marked as REVERSED and refunded`);
    } else {
      console.log(`ℹ️ No withdrawal transaction found for reversed transfer: ${data.reference}`);
    }
  }
}

export default new PaystackService();