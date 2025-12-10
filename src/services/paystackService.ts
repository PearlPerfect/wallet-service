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

      return response.data;
    } catch (error: any) {
      console.error('Paystack initialization error:', error.response?.data);
      throw new Error(error.response?.data?.message || 'Failed to initialize transaction');
    }
  }

  async verifyTransaction(reference: string): Promise<VerifyTransactionResponse> {
    try {
      const response = await axios.get(
        `${this.baseURL}/transaction/verify/${reference}`,
        { headers: this.getHeaders() }
      );

      return response.data;
    } catch (error: any) {
      console.error('Paystack verification error:', error.response?.data);
      throw new Error(error.response?.data?.message || 'Failed to verify transaction');
    }
  }

  async initiateTransfer(
    amount: number,
    recipientAccount: string,
    recipientBankCode: string,
    recipientName: string,
    reason?: string
  ): Promise<TransferResponse> {
    try {
      const reference = `transfer_${uuidv4()}`;
      
      const response = await axios.post(
        `${this.baseURL}/transfer`,
        {
          source: 'balance',
          amount: amount * 100,
          reference,
          recipient: recipientAccount,
          reason: reason || 'Wallet withdrawal',
          bank_code: recipientBankCode,
          name: recipientName,
        },
        { headers: this.getHeaders() }
      );

      return response.data;
    } catch (error: any) {
      console.error('Paystack transfer error:', error.response?.data);
      throw new Error(error.response?.data?.message || 'Failed to initiate transfer');
    }
  }

  async handleWebhook(
    body: any,
    signature: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Verify webhook signature
      const isValid = await this.verifySignature(body, signature);
      if (!isValid) {
        throw new Error('Invalid webhook signature');
      }

      const event = body.event;
      const data = body.data;

      console.log(`Processing Paystack webhook event: ${event}`);

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
          console.log(`Unhandled webhook event: ${event}`);
          return { success: true, message: 'Event not processed' };
      }
    } catch (error: any) {
      console.error('Webhook processing error:', error);
      return { success: false, message: error.message };
    }
  }

  private async verifySignature(body: any, signature: string): Promise<boolean> {
    // Create HMAC SHA512 hash
    const hash = crypto
      .createHmac('sha512', this.secretKey)
      .update(JSON.stringify(body))
      .digest('hex');
    
    return hash === signature;
  }

  private async processSuccessfulCharge(data: any) {
    console.log('Processing successful charge:', data.reference);
    
    const transaction = await Transaction.findOne({
      where: { reference: data.reference },
    });

    if (!transaction) {
      console.error('Transaction not found for reference:', data.reference);
      throw new Error('Transaction not found');
    }

    // Prevent double processing
    if (transaction.status === TransactionStatus.SUCCESS) {
      console.log('Transaction already processed:', data.reference);
      return;
    }

    // Update transaction status
    await transaction.updateStatus(TransactionStatus.SUCCESS, data);

    // Credit wallet
    const wallet = await Wallet.findOne({
      where: { userId: transaction.userId },
    });

    if (wallet) {
      await wallet.credit(transaction.amount);
      console.log(`Wallet ${wallet.id} credited with ${transaction.amount}`);
    } else {
      console.error('Wallet not found for user:', transaction.userId);
    }
  }

  private async processFailedCharge(data: any) {
    console.log('Processing failed charge:', data.reference);
    
    const transaction = await Transaction.findOne({
      where: { reference: data.reference },
    });

    if (transaction) {
      await transaction.updateStatus(TransactionStatus.FAILED, data);
      console.log(`Transaction ${transaction.id} marked as failed`);
    }
  }

  private async processTransferSuccess(data: any) {
    console.log('Processing transfer success:', data.reference);
    
    // Look for a withdrawal transaction with this reference
    const transaction = await Transaction.findOne({
      where: { 
        reference: data.reference,
        type: TransactionType.WITHDRAWAL 
      },
    });

    if (transaction) {
      await transaction.updateStatus(TransactionStatus.SUCCESS, data);
      console.log(`Withdrawal transaction ${transaction.id} marked as successful`);
    } else {
      console.log(`No withdrawal transaction found for reference: ${data.reference}`);
    }
  }

  private async processTransferFailed(data: any) {
    console.log('Processing transfer failed:', data.reference);
    
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
        await wallet.credit(transaction.amount);
        console.log(`Wallet ${wallet.id} refunded ${transaction.amount} due to transfer failure`);
      }
      
      console.log(`Withdrawal transaction ${transaction.id} marked as failed and refunded`);
    }
  }

  private async processTransferReversed(data: any) {
    console.log('Processing transfer reversed:', data.reference);
    
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
        await wallet.credit(transaction.amount);
        console.log(`Wallet ${wallet.id} refunded ${transaction.amount} due to transfer reversal`);
      }
      
      console.log(`Withdrawal transaction ${transaction.id} marked as reversed and refunded`);
    }
  }
}

export default new PaystackService();