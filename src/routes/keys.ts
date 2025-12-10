import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { ApiKeyController } from '../controllers/apiKeyController';
import { apiLimiter } from '../middleware/security';

const router = Router();

// Apply rate limiting
router.use(apiLimiter);

/**
 * @swagger
 * /keys/create:
 *   post:
 *     summary: Create a new API key
 *     description: Creates a new API key with specified permissions and expiry
 *     tags: [API Keys]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ApiKeyRequest'
 *     responses:
 *       201:
 *         description: API key created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiKeyResponse'
 *       400:
 *         description: Invalid request or maximum keys reached
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/create',
  authenticate,
  ApiKeyController.createApiKey
);

/**
 * @swagger
 * /keys/rollover:
 *   post:
 *     summary: Rollover an expired API key
 *     description: Creates a new API key using the same permissions as an expired key
 *     tags: [API Keys]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - expired_key_id
 *               - expiry
 *             properties:
 *               expired_key_id:
 *                 type: string
 *                 example: "FGH2485K6KK79GKG9GKGK"
 *               expiry:
 *                 type: string
 *                 pattern: "^(\\d+)(m|h|d|w|M|y)$"
 *                 example: "1M"
 *     responses:
 *       201:
 *         description: API key rolled over successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 api_key:
 *                   type: string
 *                 name:
 *                   type: string
 *                 permissions:
 *                   type: array
 *                   items:
 *                     type: string
 *                 expires_at:
 *                   type: string
 *                   format: date-time
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                 warning:
 *                   type: string
 *       400:
 *         description: Invalid request or key not expired
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/rollover',
  authenticate,
  ApiKeyController.rolloverApiKey
);

/**
 * @swagger
 * /keys:
 *   get:
 *     summary: Get user's API keys
 *     description: Returns a list of all API keys for the authenticated user
 *     tags: [API Keys]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of API keys
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 api_keys:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       key_prefix:
 *                         type: string
 *                       permissions:
 *                         type: array
 *                         items:
 *                           type: string
 *                       expires_at:
 *                         type: string
 *                         format: date-time
 *                       is_active:
 *                         type: boolean
 *                       is_expired:
 *                         type: boolean
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       revoked_at:
 *                         type: string
 *                         format: date-time
 *                       last_used_at:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/',
  authenticate,
  ApiKeyController.getUserApiKeys
);

/**
 * @swagger
 * /keys/{keyId}/revoke:
 *   post:
 *     summary: Revoke an API key
 *     description: Revokes an existing API key
 *     tags: [API Keys]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the API key to revoke
 *     responses:
 *       200:
 *         description: API key revoked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/:keyId/revoke',
  authenticate,
  ApiKeyController.revokeApiKey
);

export default router;