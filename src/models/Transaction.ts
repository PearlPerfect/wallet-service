import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import User from './User';

export enum TransactionType {
  DEPOSIT = 'deposit',
  TRANSFER = 'transfer',
  WITHDRAWAL = 'withdrawal',
}

export enum TransactionStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  REVERSED = 'reversed',
}

@Table({
  tableName: 'transactions',
  timestamps: true,
})
class Transaction extends Model {
  @PrimaryKey
  @Default(() => uuidv4())
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'user_id',
  })
  userId!: string;

  @Column({
    type: DataType.ENUM(...Object.values(TransactionType)),
    allowNull: false,
  })
  type!: TransactionType;

  @Column({
    type: DataType.DECIMAL(20, 2),
    allowNull: false,
    validate: {
      min: 0.01,
    },
  })
  amount!: number;

  @Column({
    type: DataType.ENUM(...Object.values(TransactionStatus)),
    allowNull: false,
    defaultValue: TransactionStatus.PENDING,
  })
  status!: TransactionStatus;

  @Column({
    type: DataType.STRING,
    allowNull: true,
    unique: true,
  })
  reference?: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
    field: 'recipient_wallet_number',
  })
  recipientWalletNumber?: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
    field: 'sender_wallet_number',
  })
  senderWalletNumber?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  metadata?: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  description?: string;

  @BelongsTo(() => User)
  user!: User;

  // Helper method to update status
  async updateStatus(status: TransactionStatus, metadata?: any): Promise<void> {
    this.status = status;
    if (metadata) {
      this.metadata = JSON.stringify(metadata);
    }
    await this.save();
  }

  // Check if transaction is successful
  isSuccessful(): boolean {
    return this.status === TransactionStatus.SUCCESS;
  }

  // Check if transaction is pending
  isPending(): boolean {
    return this.status === TransactionStatus.PENDING;
  }
}

export default Transaction;