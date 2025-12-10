import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/security';

const router = Router();

// Apply rate limiting to auth endpoints
router.use(authLimiter);

/**
 * @swagger
 * /auth/google:
 *   get:
 *     summary: Initiate Google OAuth login
 *     description: Redirects to Google OAuth consent screen
 *     tags: [Authentication]
 *     responses:
 *       302:
 *         description: Redirect to Google OAuth
 */
router.get('/google', AuthController.googleAuth);

/**
 * @swagger
 * /auth/google/callback:
 *   get:
 *     summary: Google OAuth callback
 *     description: Handles Google OAuth callback and returns JWT token
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Authorization code from Google
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.get('/google/callback', AuthController.googleCallback);

/**
 * @swagger
 * /auth/test-login:
 *   post:
 *     summary: Test login (for development)
 *     description: Creates a test user and returns JWT token without Google OAuth
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Test login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post('/test-login', AuthController.testLogin);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user info
 *     description: Returns information about the currently authenticated user
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: User information
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserResponse'
 *       401:
 *         description: Unauthorized
 */
router.get('/me', authenticate, AuthController.getCurrentUser);

export default router;