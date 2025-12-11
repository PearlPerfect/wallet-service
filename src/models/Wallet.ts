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

@Table({
  tableName: 'wallets',
  timestamps: true,
})
class Wallet extends Model {
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
    type: DataType.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00,
    validate: {
      min: 0,
    },
  })
  balance!: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    unique: true,
    field: 'wallet_number',
  })
  walletNumber!: string;

  @BelongsTo(() => User)
  user!: User;

  // Helper method to check if balance is sufficient
  async hasSufficientBalance(amount: number): Promise<boolean> {
    const wallet = await Wallet.findByPk(this.id);
    const balance = parseFloat(wallet?.balance.toString() || '0');
    return balance >= amount;
  }

  // Helper method to debit wallet
  async debit(amount: number): Promise<void> {
    const balance = parseFloat(this.balance.toString());
    if (balance < amount) {
      throw new Error('Insufficient balance');
    }
    
    this.balance = parseFloat((balance - amount).toFixed(2));
    await this.save();
  }

  // Helper method to credit wallet
  async credit(amount: number): Promise<void> {
    const balance = parseFloat(this.balance.toString());
    this.balance = parseFloat((balance + amount).toFixed(2));
    await this.save();
  }

  // Static method to get wallet by number
  static async findByNumber(walletNumber: string): Promise<Wallet | null> {
    return await Wallet.findOne({ where: { walletNumber } });
  }
}

export default Wallet;