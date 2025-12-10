import { Router } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import { WalletController } from '../controllers/walletController';
import { apiLimiter, validateBodySize } from '../middleware/security';

const router = Router();

// Apply rate limiting and body size validation to all wallet endpoints
router.use(apiLimiter);
router.use(validateBodySize);

/**
 * @swagger
 * /wallet/deposit:
 *   post:
 *     summary: Initialize a deposit transaction
 *     description: Creates a Paystack payment link for depositing funds
 *     tags: [Wallet]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DepositRequest'
 *     responses:
 *       200:
 *         description: Deposit initialized successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DepositResponse'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.post(
  '/deposit',
  authenticate,
  requirePermission('deposit'),
  WalletController.deposit
);

/**
 * @swagger
 * /wallet/paystack/webhook:
 *   post:
 *     summary: Paystack webhook handler
 *     description: Receives and processes Paystack webhook events
 *     tags: [Wallet]
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       400:
 *         description: Invalid webhook signature
 *       500:
 *         description: Webhook processing failed
 */
router.post(
  '/paystack/webhook',
  WalletController.handleWebhook
);

/**
 * @swagger
 * /wallet/paystack/test-webhook:
 *   post:
 *     summary: Test Paystack webhook (for development)
 *     description: Manually trigger a webhook event for testing
 *     tags: [Wallet]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reference
 *               - event
 *               - amount
 *             properties:
 *               reference:
 *                 type: string
 *               event:
 *                 type: string
 *                 enum: [charge.success, charge.failed]
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Test webhook processed
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/paystack/test-webhook',
  authenticate,
  async (req, res) => {
    try {
      const { reference, event, amount } = req.body;
      
      if (!reference || !event || !amount) {
        return res.status(400).json({
          success: false,
          error: 'Reference, event, and amount are required'
        });
      }

      // Create test webhook payload
      const testPayload = {
        event,
        data: {
          reference,
          amount: amount * 100, // Convert to kobo
          status: event === 'charge.success' ? 'success' : 'failed',
          metadata: {
            test: true,
            userId: req.user?.id
          }
        }
      };

      // Generate a fake signature for testing
      const testSignature = `test_sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      console.log('🧪 Test webhook triggered:', {
        reference,
        event,
        amount,
        user: req.user?.id
      });

      // Call the actual webhook handler
      const result = await (WalletController as any).handleWebhook(
        { body: testPayload, headers: { 'x-paystack-signature': testSignature } } as any,
        res
      );

      // If handleWebhook already sent a response, return
      if (res.headersSent) return;

      res.json({
        success: true,
        message: 'Test webhook triggered',
        reference,
        event,
        amount,
        note: 'This only works if you have a pending transaction with this reference'
      });
    } catch (error: any) {
      console.error('Test webhook error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @swagger
 * /wallet/deposit/{reference}/status:
 *   get:
 *     summary: Check deposit status
 *     description: Checks the status of a deposit transaction (does not credit wallet)
 *     tags: [Wallet]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction reference
 *     responses:
 *       200:
 *         description: Transaction status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 reference:
 *                   type: string
 *                 status:
 *                   type: string
 *                 amount:
 *                   type: number
 *                 balance:
 *                   type: number
 *                 credited:
 *                   type: boolean
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: Transaction not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/deposit/:reference/status',
  authenticate,
  requirePermission('read'),
  WalletController.verifyDepositStatus
);

/**
 * @swagger
 * /wallet/balance:
 *   get:
 *     summary: Get wallet balance
 *     description: Returns the current balance of the user's wallet
 *     tags: [Wallet]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Wallet balance
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 balance:
 *                   type: number
 *                 currency:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/balance',
  authenticate,
  requirePermission('read'),
  WalletController.getBalance
);

/**
 * @swagger
 * /wallet/transfer:
 *   post:
 *     summary: Transfer funds to another wallet
 *     description: Transfers funds from the user's wallet to another user's wallet
 *     tags: [Wallet]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TransferRequest'
 *     responses:
 *       200:
 *         description: Transfer completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TransferResponse'
 *       400:
 *         description: Transfer failed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.post(
  '/transfer',
  authenticate,
  requirePermission('transfer'),
  WalletController.transfer
);

/**
 * @swagger
 * /wallet/transactions:
 *   get:
 *     summary: Get transaction history
 *     description: Returns the user's transaction history with pagination
 *     tags: [Wallet]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of items per page
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [deposit, transfer, withdrawal]
 *         description: Filter by transaction type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, success, failed, reversed]
 *         description: Filter by transaction status
 *     responses:
 *       200:
 *         description: Transaction history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 transactions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       type:
 *                         type: string
 *                       amount:
 *                         type: number
 *                       status:
 *                         type: string
 *                       reference:
 *                         type: string
 *                       recipient_wallet_number:
 *                         type: string
 *                       sender_wallet_number:
 *                         type: string
 *                       description:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: number
 *                     limit:
 *                       type: number
 *                     total:
 *                       type: number
 *                     pages:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/transactions',
  authenticate,
  requirePermission('read'),
  WalletController.getTransactions
);

/**
 * @swagger
 * /wallet/details:
 *   get:
 *     summary: Get wallet details
 *     description: Returns detailed information about the user's wallet
 *     tags: [Wallet]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Wallet details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 wallet:
 *                   type: object
 *                   properties:
 *                     wallet_number:
 *                       type: string
 *                     balance:
 *                       type: number
 *                     currency:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Wallet not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/details',
  authenticate,
  requirePermission('read'),
  WalletController.getWalletDetails
);

export default router;