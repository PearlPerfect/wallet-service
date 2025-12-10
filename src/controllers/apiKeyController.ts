import { Request, Response } from 'express';
import Joi from 'joi';
import apiKeyService from '../services/apiKeyService';
import { ApiKeyPermission } from '../models/ApiKey';

export class ApiKeyController {
  private static createApiKeySchema = Joi.object({
    name: Joi.string().required().min(1).max(100),
    permissions: Joi.array()
      .items(Joi.string().valid('read', 'deposit', 'transfer'))
      .required()
      .min(1),
    expiry: Joi.string()
      .pattern(/^(\d+)(m|h|d|w|M|y)$/i)
      .required()
      .messages({
        'string.pattern.base': 'Expiry must be in format: 30m, 1h, 1d, 1w, 1M, 1y'
      }),
  });

  private static rolloverApiKeySchema = Joi.object({
    expired_key_id: Joi.string().required(),
    expiry: Joi.string()
      .pattern(/^(\d+)(m|h|d|w|M|y)$/i)
      .required()
      .messages({
        'string.pattern.base': 'Expiry must be in format: 30m, 1h, 1d, 1w, 1M, 1y'
      }),
  });

  static async createApiKey(req: Request, res: Response) {
    try {
      const { error, value } = ApiKeyController.createApiKeySchema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          success: false,
          error: error.details[0].message 
        });
      }
      
      const result = await apiKeyService.createApiKey(
        req.user!.id,
        {
          name: value.name,
          permissions: value.permissions as ApiKeyPermission[],
          expiry: value.expiry,
        }
      );

      res.status(201).json({
        success: true,
        api_key: result.plainKey,
        name: result.apiKey.name,
        permissions: result.apiKey.permissions,
        expires_at: result.apiKey.expiresAt.toISOString(),
        created_at: result.apiKey.createdAt,
        warning: 'Save this API key now. It will not be shown again.',
      });
    } catch (error: any) {
      res.status(400).json({ 
        success: false,
        error: error.message 
      });
    }
  }

  static async rolloverApiKey(req: Request, res: Response) {
    try {
      const { error, value } = ApiKeyController.rolloverApiKeySchema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          success: false,
          error: error.details[0].message 
        });
      }

      const result = await apiKeyService.rolloverApiKey(
        req.user!.id,
        value.expired_key_id,
        value.expiry
      );

      res.status(201).json({
        success: true,
        api_key: result.plainKey,
        name: result.apiKey.name,
        permissions: result.apiKey.permissions,
        expires_at: result.apiKey.expiresAt.toISOString(),
        created_at: result.apiKey.createdAt,
        warning: 'Save this API key now. It will not be shown again.',
      });
    } catch (error: any) {
      res.status(400).json({ 
        success: false,
        error: error.message 
      });
    }
  }

  static async getUserApiKeys(req: Request, res: Response) {
    try {
      const apiKeys = await apiKeyService.getUserApiKeys(req.user!.id);
      
      res.json({
        success: true,
        api_keys: apiKeys.map(key => ({
          id: key.id,
          name: key.name,
          key_prefix: key.keyPrefix,
          permissions: key.permissions,
          expires_at: key.expiresAt,
          is_active: key.isActive,
          is_expired: key.isExpired(), // This will be true if expired
          created_at: key.createdAt,
          revoked_at: key.revokedAt,
          last_used_at: key.lastUsedAt,
        })),
      });
    } catch (error: any) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }

  static async revokeApiKey(req: Request, res: Response) {
    try {
      const { keyId } = req.params;
      
      await apiKeyService.revokeApiKey(req.user!.id, keyId);

      res.json({ 
        success: true,
        message: 'API key revoked successfully' 
      });
    } catch (error: any) {
      res.status(400).json({ 
        success: false,
        error: error.message 
      });
    }
  }
}