import ApiKey, { ApiKeyPermission } from '../models/ApiKey';
import User from '../models/User';
import crypto from 'crypto';
import { Op } from 'sequelize';

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
    // Validate expiry format
    const expiryRegex = /^(\d+)(m|h|d|w|M|y)$/i;
    if (!expiryRegex.test(dto.expiry)) {
      throw new Error('Invalid expiry format. Use: 30m, 1h, 1d, 1w, 1M, 1y');
    }

    // Check active key count - ONLY count keys that are active AND not expired
    const activeKeysCount = await ApiKey.count({
      where: {
        userId,
        isActive: true,
        expiresAt: {
          [Op.gt]: new Date() // Only count keys that haven't expired
        }
      },
    });

    
    if (activeKeysCount >= 5) {
      throw new Error('Maximum of 5 active API keys allowed per user. Please revoke or wait for some keys to expire.');
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
    
    // Generate hash manually
    const keyHash = ApiKey.hashString(plainKey);
    const keyPrefix = plainKey.substring(0, 8);

    
    try {
      // Create and save API key
      const apiKey = await ApiKey.create({
        userId,
        name: dto.name,
        permissions: dto.permissions,
        expiresAt,
        isActive: true,
        keyHash,
        keyPrefix,
        lastUsedAt: null,
        revokedAt: null,
      });

      
      return { apiKey, plainKey };
    } catch (error: any) {
      throw error;
    }
  }

  async validateApiKey(key: string): Promise<ApiKey | null> {
    const keyHash = ApiKey.hashString(key);
    
    const apiKey = await ApiKey.findOne({
      where: { keyHash },
      include: [{ model: User }],
    });

    if (!apiKey) {
      return null;
    }

    // Check if key is expired
    if (apiKey.isExpired()) {
      // Auto-deactivate expired keys
      if (apiKey.isActive) {
        apiKey.isActive = false;
        await apiKey.save();
      }
      return null;
    }
    
    // Check if key is active
    if (!apiKey.isActive) {
      return null;
    }

    // Update last used timestamp
    await apiKey.updateLastUsed();
    return apiKey;
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

    if (!expiredKey.isExpired() && expiredKey.isActive) {
      throw new Error('Key must be expired to rollover');
    }

    // Check active key count before creating new one
    const activeKeysCount = await ApiKey.count({
      where: {
        userId,
        isActive: true,
        expiresAt: {
          [Op.gt]: new Date()
        }
      },
    });

    if (activeKeysCount >= 5) {
      throw new Error('Maximum of 5 active API keys allowed per user. Please revoke some keys first.');
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

    // Deactivate the old key (if not already deactivated)
    if (expiredKey.isActive) {
      expiredKey.isActive = false;
      expiredKey.revokedAt = new Date();
      await expiredKey.save();
    }

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
    // First, auto-deactivate any expired keys
    const expiredKeys = await ApiKey.findAll({
      where: {
        userId,
        isActive: true,
        expiresAt: { [Op.lt]: new Date() },
      },
    });

    for (const key of expiredKeys) {
      key.isActive = false;
      await key.save();
    }

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
          expiresAt: { [Op.lt]: new Date() },
          isActive: true,
        },
      }
    );
    
    return affectedRows;
  }

  // New method to check if user can create more keys
  async canCreateMoreKeys(userId: string): Promise<boolean> {
    const activeKeysCount = await ApiKey.count({
      where: {
        userId,
        isActive: true,
        expiresAt: {
          [Op.gt]: new Date()
        }
      },
    });

    return activeKeysCount < 5;
  }
}

export default new ApiKeyService();