import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  HasOne,
  HasMany,
  BeforeCreate,
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import Wallet from './Wallet';
import ApiKey from './ApiKey';
import Transaction from './Transaction';

@Table({
  tableName: 'users',
  timestamps: true,
})
class User extends Model {
  @PrimaryKey
  @Default(() => uuidv4())
  @Column(DataType.UUID)
  id!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  })
  email!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  fullName!: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
    unique: true,
    field: 'google_id',
  })
  googleId?: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  profilePicture?: string;

  @HasOne(() => Wallet)
  wallet!: Wallet;

  @HasMany(() => ApiKey)
  apiKeys!: ApiKey[];

  @HasMany(() => Transaction)
  transactions!: Transaction[];

  @BeforeCreate
  static async createWallet(user: User) {
    // This will be handled by the controller
  }
}

export default User;