import ApiKey, { ApiKeyPermission } from '../models/ApiKey';
import User from '../models/User';
import crypto from 'crypto';

interface CreateApiKeyDto {
  name: string;
  permissions: ApiKeyPermission[];
  expiry: string;
}

class ApiKeyService {
  private generateKey(): string {
    const prefix = process.env.API_KEY_PREFIX || 'sk_live_';
    const randomPart = crypto.randomBytes(32).toString('hex');
    return `${prefix}${randomPart}`;
  }

  private calculateExpiry(expiryString: string): Date {
    const now = new Date();
    const unit = expiryString.slice(-1).toLowerCase();
    const value = parseInt(expiryString.slice(0, -1));

    if (isNaN(value) || value <= 0) {
      throw new Error('Invalid expiry value');
    }

    switch (unit) {
      case 'm': // Minutes
        now.setMinutes(now.getMinutes() + value);
        break;
      case 'h': // Hours
        now.setHours(now.getHours() + value);
        break;
      case 'd': // Days
        now.setDate(now.getDate() + value);
        break;
      case 'w': // Weeks
        now.setDate(now.getDate() + (value * 7));
        break;
      case 'M': // Months
        now.setMonth(now.getMonth() + value);
        break;
      case 'y': // Years
        now.setFullYear(now.getFullYear() + value);
        break;
      default:
        throw new Error('Invalid expiry format. Use: 30m, 1h, 1d, 1w, 1M, 1y');
    }

    return now;
  }

  async createApiKey(
    userId: string,
    dto: CreateApiKeyDto
  ): Promise<{ apiKey: ApiKey; plainKey: string }> {
    console.log('Starting createApiKey for user:', userId);
    
    // Validate expiry format
    const expiryRegex = /^(\d+)(m|h|d|w|M|y)$/i;
    if (!expiryRegex.test(dto.expiry)) {
      throw new Error('Invalid expiry format. Use: 30m, 1h, 1d, 1w, 1M, 1y');
    }

    // Check active key count
    const activeKeysCount = await ApiKey.count({
      where: {
        userId,
        isActive: true,
      },
    });

    console.log('Active keys count:', activeKeysCount);
    
    if (activeKeysCount >= 5) {
      throw new Error('Maximum of 5 active API keys allowed per user');
    }

    // Validate permissions
    const validPermissions = Object.values(ApiKeyPermission);
    const invalidPermissions = dto.permissions.filter(
      p => !validPermissions.includes(p)
    );

    if (invalidPermissions.length > 0) {
      throw new Error(`Invalid permissions: ${invalidPermissions.join(', ')}`);
    }

    const expiresAt = this.calculateExpiry(dto.expiry);
    const plainKey = this.generateKey();
    
    console.log('Generated plain key:', plainKey.substring(0, 20) + '...');
    console.log('Expires at:', expiresAt);
    
    // Generate hash manually
    const keyHash = ApiKey.hashString(plainKey);
    console.log('Generated key hash:', keyHash.substring(0, 20) + '...');
    
    const keyPrefix = plainKey.substring(0, 8);
    console.log('Key prefix:', keyPrefix);

    try {
      // Create and save API key - use raw creation without hooks
      const apiKey = await ApiKey.create({
        userId,
        name: dto.name,
        permissions: dto.permissions,
        expiresAt,
        isActive: true,
        keyHash,  // This MUST be set
        keyPrefix, // This MUST be set
        lastUsedAt: null,
        revokedAt: null,
      });

      console.log('API key created successfully with ID:', apiKey.id);
      
      return { apiKey, plainKey };
    } catch (error: any) {
      console.error('Error in ApiKey.create():', error.message);
      console.error('Error details:', error.errors);
      throw error;
    }
  }

  async validateApiKey(key: string): Promise<ApiKey | null> {
    const keyHash = ApiKey.hashString(key);
    
    const apiKey = await ApiKey.findOne({
      where: { keyHash },
      include: [{ model: User }],
    });

    if (apiKey && apiKey.isValid()) {
      await apiKey.updateLastUsed();
      return apiKey;
    }

    return null;
  }

  async rolloverApiKey(
    userId: string,
    expiredKeyId: string,
    expiry: string
  ): Promise<{ apiKey: ApiKey; plainKey: string }> {
    const expiredKey = await ApiKey.findOne({
      where: {
        id: expiredKeyId,
        userId,
      },
    });

    if (!expiredKey) {
      throw new Error('API key not found');
    }

    if (!expiredKey.isExpired()) {
      throw new Error('Key must be expired to rollover');
    }

    const expiresAt = this.calculateExpiry(expiry);
    const plainKey = this.generateKey();
    const keyHash = ApiKey.hashString(plainKey);
    const keyPrefix = plainKey.substring(0, 8);

    const newApiKey = await ApiKey.create({
      userId,
      name: expiredKey.name,
      permissions: expiredKey.permissions,
      expiresAt,
      isActive: true,
      keyHash,
      keyPrefix,
      lastUsedAt: null,
      revokedAt: null,
    });

    // Deactivate the old key
    expiredKey.isActive = false;
    expiredKey.revokedAt = new Date();
    await expiredKey.save();

    return { apiKey: newApiKey, plainKey };
  }

  async revokeApiKey(userId: string, keyId: string): Promise<void> {
    const key = await ApiKey.findOne({
      where: {
        id: keyId,
        userId,
      },
    });

    if (!key) {
      throw new Error('API key not found');
    }

    key.isActive = false;
    key.revokedAt = new Date();
    await key.save();
  }

  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    return await ApiKey.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });
  }

  async cleanupExpiredKeys(): Promise<number> {
    const [affectedRows] = await ApiKey.update(
      { isActive: false },
      {
        where: {
          expiresAt: { $lt: new Date() },
          isActive: true,
        },
      }
    );
    
    return affectedRows;
  }
}

export default new ApiKeyService();