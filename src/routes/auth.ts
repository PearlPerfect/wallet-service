import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/security';
import jwtService from '../utils/jwt';

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
 * /auth/refresh:
 *   post:
 *     summary: Refresh JWT token
 *     description: Generates a new JWT token using the old token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 token:
 *                   type: string
 *       400:
 *         description: Invalid or expired token
 */
router.post('/refresh', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ 
        success: false,
        error: 'Token is required' 
      });
    }

    const newToken = jwtService.refreshToken(token);
    
    if (!newToken) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid or expired token' 
      });
    }

    res.json({
      success: true,
      token: newToken,
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

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

/**
 * @swagger
 * /auth/success:
 *   get:
 *     summary: OAuth success callback
 *     description: Handles successful OAuth authentication redirect
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *         description: JWT token
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 */
router.get('/success', (req, res) => {
    try {
        const { token, userId } = req.query;
        
        if (!token || !userId) {
            return res.status(400).json({
                success: false,
                error: 'Missing token or userId'
            });
        }
        
        res.json({
            success: true,
            message: 'Google authentication successful',
            token: token,
            userId: userId,
            note: 'Use this token in Authorization header as Bearer <token>'
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @swagger
 * /auth/error:
 *   get:
 *     summary: OAuth error callback
 *     description: Handles OAuth authentication errors
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: message
 *         schema:
 *           type: string
 *         description: Error message
 *     responses:
 *       400:
 *         description: Authentication failed
 */
router.get('/error', (req, res) => {
    const { message } = req.query;
    
    res.status(400).json({
        success: false,
        error: message || 'Authentication failed'
    });
});

export default router;