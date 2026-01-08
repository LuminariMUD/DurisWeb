import { Router } from 'express'
import type { Request, Response, Router as RouterType } from 'express'
import { body, validationResult } from 'express-validator'
import pushService from '../services/pushNotificationService.js'

interface AuthenticatedRequest extends Request {
  accountName?: string
}

const router: RouterType = Router()

// get vapid public key
router.get('/vapid-public-key', (_req: Request, res: Response) => {
  const publicKey = pushService.getVapidPublicKey()

  if (!publicKey) {
    res.status(503).json({
      error: 'push notifications not configured',
      enabled: false,
    })
    return
  }

  res.json({
    publicKey,
    enabled: true,
  })
})

// subscribe to push notifications
router.post(
  '/subscribe',
  [
    body('subscription').isObject().withMessage('subscription object required'),
    body('subscription.endpoint').isURL().withMessage('valid endpoint url required'),
    body('subscription.keys.p256dh').isString().notEmpty().withMessage('p256dh key required'),
    body('subscription.keys.auth').isString().notEmpty().withMessage('auth key required'),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    const accountName = req.accountName
    if (!accountName) {
      res.status(401).json({ error: 'authentication required' })
      return
    }

    try {
      const { subscription } = req.body
      const userAgent = req.get('user-agent')

      const id = await pushService.saveSubscription(accountName, subscription, userAgent)

      res.json({
        success: true,
        subscriptionId: id,
        message: 'push subscription saved',
      })
    } catch (error) {
      console.error('[Push] subscribe error:', error)
      res.status(500).json({ error: 'failed to save subscription' })
    }
  }
)

// unsubscribe from push notifications
router.post(
  '/unsubscribe',
  [body('endpoint').isURL().withMessage('valid endpoint url required')],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    const accountName = req.accountName
    if (!accountName) {
      res.status(401).json({ error: 'authentication required' })
      return
    }

    try {
      const { endpoint } = req.body
      const removed = await pushService.removeSubscription(accountName, endpoint)

      res.json({
        success: removed,
        message: removed ? 'subscription removed' : 'subscription not found',
      })
    } catch (error) {
      console.error('[Push] unsubscribe error:', error)
      res.status(500).json({ error: 'failed to remove subscription' })
    }
  }
)

// get subscription status
router.get('/status', async (req: AuthenticatedRequest, res: Response) => {
  const accountName = req.accountName
  if (!accountName) {
    res.status(401).json({ error: 'authentication required' })
    return
  }

  try {
    const subscriptions = await pushService.getSubscriptions(accountName)

    res.json({
      enabled: pushService.isPushEnabled(),
      subscriptionCount: subscriptions.length,
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
        userAgent: s.userAgent,
      })),
    })
  } catch (error) {
    console.error('[Push] status error:', error)
    res.status(500).json({ error: 'failed to get subscription status' })
  }
})

// remove all subscriptions for current user
router.delete('/subscriptions', async (req: AuthenticatedRequest, res: Response) => {
  const accountName = req.accountName
  if (!accountName) {
    res.status(401).json({ error: 'authentication required' })
    return
  }

  try {
    const removed = await pushService.removeAllSubscriptions(accountName)

    res.json({
      success: true,
      removedCount: removed,
      message: `removed ${removed} subscription(s)`,
    })
  } catch (error) {
    console.error('[Push] remove all error:', error)
    res.status(500).json({ error: 'failed to remove subscriptions' })
  }
})

export default router
