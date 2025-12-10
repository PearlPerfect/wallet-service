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
import crypto from 'crypto';

export enum ApiKeyPermission {
  READ = 'read',
  DEPOSIT = 'deposit',
  TRANSFER = 'transfer',
}

@Table({
  tableName: 'api_keys',
  timestamps: true,
})
class ApiKey extends Model {
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
    type: DataType.STRING,
    allowNull: false,
  })
  name!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    unique: true,
    field: 'key_hash',
  })
  keyHash!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    field: 'key_prefix',
  })
  keyPrefix!: string;

  @Column({
    type: DataType.ARRAY(DataType.ENUM(...Object.values(ApiKeyPermission))),
    allowNull: false,
    defaultValue: [],
  })
  permissions!: ApiKeyPermission[];

  @Column({
    type: DataType.DATE,
    allowNull: false,
    field: 'expires_at',
  })
  expiresAt!: Date;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active',
  })
  isActive!: boolean;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    field: 'revoked_at',
  })
  revokedAt?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    field: 'last_used_at',
  })
  lastUsedAt?: Date;

  @BelongsTo(() => User)
  user!: User;

  // Static method to hash a string
  static hashString(str: string): string {
    const secret = process.env.API_KEY_HASH_SECRET || 'default-secret-change-in-production';
    return crypto
      .createHmac('sha256', secret)
      .update(str)
      .digest('hex');
  }

  // Verify a key against the hash
  verifyKey(key: string): boolean {
    const hash = ApiKey.hashString(key);
    return this.keyHash === hash;
  }

  // Check if API key is expired
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  // Check if API key is valid (active and not expired)
  isValid(): boolean {
    return this.isActive && !this.isExpired();
  }

  // Check if API key has specific permission
  hasPermission(permission: ApiKeyPermission): boolean {
    return this.permissions.includes(permission);
  }

  // Update last used timestamp
  async updateLastUsed(): Promise<void> {
    this.lastUsedAt = new Date();
    await this.save();
  }
}

export default ApiKey;