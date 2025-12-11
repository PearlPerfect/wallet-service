import Wallet from '../models/Wallet';
import Transaction, { TransactionType, TransactionStatus } from '../models/Transaction';
import User from '../models/User';
import { Op } from 'sequelize';

class WalletService {
  async getWalletBalance(userId: string): Promise<number> {
    const wallet = await Wallet.findOne({ where: { userId } });
    return wallet ? parseFloat(wallet.balance.toString()) : 0;
  }

  async getWalletByNumber(walletNumber: string): Promise<Wallet | null> {
    return await Wallet.findOne({ 
      where: { walletNumber },
      include: [{ model: User, attributes: ['id', 'email', 'fullName'] }]
    });
  }

  async getWalletByUserId(userId: string): Promise<Wallet | null> {
    return await Wallet.findOne({ where: { userId } });
  }

  async createDepositTransaction(
    userId: string,
    amount: number,
    reference: string
  ): Promise<Transaction> {
    return await Transaction.create({
      userId,
      type: TransactionType.DEPOSIT,
      amount,
      status: TransactionStatus.PENDING,
      reference,
      description: 'Wallet deposit via Paystack',
    });
  }

  async createWithdrawalTransaction(
    userId: string,
    amount: number,
    reference: string,
    bankDetails: any
  ): Promise<Transaction> {
    return await Transaction.create({
      userId,
      type: TransactionType.WITHDRAWAL,
      amount,
      status: TransactionStatus.PENDING,
      reference,
      metadata: JSON.stringify(bankDetails),
      description: 'Withdrawal to bank account',
    });
  }

  async transferFunds(
    senderId: string,
    recipientWalletNumber: string,
    amount: number,
    description?: string
  ): Promise<{ success: boolean; message: string; transactionId?: string }> {
    // Start a database transaction
    const sequelize = Wallet.sequelize!;
    const t = await sequelize.transaction();

    try {
      // Get sender wallet with lock
      const senderWallet = await Wallet.findOne({
        where: { userId: senderId },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      if (!senderWallet) {
        throw new Error('Sender wallet not found');
      }

      // Check sufficient balance with proper decimal handling
      const senderBalance = parseFloat(senderWallet.balance.toString());
      if (senderBalance < amount) {
        throw new Error('Insufficient balance');
      }

      // Get recipient wallet with lock
      const recipientWallet = await Wallet.findOne({
        where: { walletNumber: recipientWalletNumber },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      if (!recipientWallet) {
        throw new Error('Recipient wallet not found');
      }

      if (recipientWallet.userId === senderId) {
        throw new Error('Cannot transfer to yourself');
      }

      // Perform transfer with proper decimal handling
      const newSenderBalance = parseFloat((senderBalance - amount).toFixed(2));
      senderWallet.balance = newSenderBalance;
      await senderWallet.save({ transaction: t });

      const recipientBalance = parseFloat(recipientWallet.balance.toString());
      const newRecipientBalance = parseFloat((recipientBalance + amount).toFixed(2));
      recipientWallet.balance = newRecipientBalance;
      await recipientWallet.save({ transaction: t });

      // Create transaction records for both sender and recipient
      const senderTransaction = await Transaction.create(
        {
          userId: senderId,
          type: TransactionType.TRANSFER,
          amount,
          status: TransactionStatus.SUCCESS,
          senderWalletNumber: senderWallet.walletNumber,
          recipientWalletNumber: recipientWallet.walletNumber,
          description: description || `Transfer to ${recipientWalletNumber}`,
          metadata: JSON.stringify({
            senderBalanceBefore: senderBalance,
            senderBalanceAfter: newSenderBalance,
            recipientBalanceBefore: recipientBalance,
            recipientBalanceAfter: newRecipientBalance
          })
        },
        { transaction: t }
      );

      await Transaction.create(
        {
          userId: recipientWallet.userId,
          type: TransactionType.TRANSFER,
          amount,
          status: TransactionStatus.SUCCESS,
          senderWalletNumber: senderWallet.walletNumber,
          recipientWalletNumber: recipientWallet.walletNumber,
          description: `Transfer from ${senderWallet.walletNumber}`,
          metadata: JSON.stringify({
            recipientBalanceBefore: recipientBalance,
            recipientBalanceAfter: newRecipientBalance
          })
        },
        { transaction: t }
      );

      // Commit transaction
      await t.commit();

      return { 
        success: true, 
        message: 'Transfer completed successfully',
        transactionId: senderTransaction.id
      };
    } catch (error: any) {
      // Rollback transaction on error
      await t.rollback();
      return { success: false, message: error.message };
    }
  }

  async getTransactionHistory(
    userId: string,
    page = 1,
    limit = 20,
    type?: TransactionType,
    status?: TransactionStatus,
    startDate?: Date,
    endDate?: Date
  ): Promise<{ transactions: Transaction[]; total: number; pages: number }> {
    const offset = (page - 1) * limit;
    
    const whereClause: any = { userId };
    
    if (type) whereClause.type = type;
    if (status) whereClause.status = status;
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt[Op.gte] = startDate;
      if (endDate) whereClause.createdAt[Op.lte] = endDate;
    }

    const { count, rows } = await Transaction.findAndCountAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      include: [
        {
          model: User,
          attributes: ['id', 'email', 'fullName'],
        }
      ],
    });

    return {
      transactions: rows,
      total: count,
      pages: Math.ceil(count / limit),
    };
  }

  async updateTransactionStatus(
    reference: string,
    status: TransactionStatus,
    metadata?: any
  ): Promise<void> {
    const transaction = await Transaction.findOne({
      where: { reference },
    });

    if (transaction) {
      await transaction.updateStatus(status, metadata);
    }
  }

  async debitWallet(userId: string, amount: number, description: string): Promise<void> {
    const wallet = await this.getWalletByUserId(userId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    const balance = parseFloat(wallet.balance.toString());
    if (balance < amount) {
      throw new Error('Insufficient balance');
    }
    
    wallet.balance = parseFloat((balance - amount).toFixed(2));
    await wallet.save();
    
    await Transaction.create({
      userId,
      type: TransactionType.WITHDRAWAL,
      amount,
      status: TransactionStatus.SUCCESS,
      description,
      metadata: JSON.stringify({
        balanceBefore: balance,
        balanceAfter: wallet.balance
      })
    });
  }

  async creditWallet(userId: string, amount: number, description: string): Promise<void> {
    const wallet = await this.getWalletByUserId(userId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    const balance = parseFloat(wallet.balance.toString());
    wallet.balance = parseFloat((balance + amount).toFixed(2));
    await wallet.save();
    
    await Transaction.create({
      userId,
      type: TransactionType.DEPOSIT,
      amount,
      status: TransactionStatus.SUCCESS,
      description,
      metadata: JSON.stringify({
        balanceBefore: balance,
        balanceAfter: wallet.balance
      })
    });
  }
}

export default new WalletService();