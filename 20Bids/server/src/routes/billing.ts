import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { stripe, STRIPE_PRICE_ID, STRIPE_WEBHOOK_SECRET, TRIAL_DAYS } from '../services/stripe';

const router = express.Router();
const prisma = new PrismaClient();

// Minimal local shapes for the webhook objects we actually read — avoids
// depending on the `Stripe.X` namespace types (not cleanly exported in v22).
type Ref = string | { id: string } | null | undefined;
const idOf = (r: Ref): string | undefined => (typeof r === 'string' ? r : r?.id);
interface SessionLike { client_reference_id?: string | null; customer?: Ref; subscription?: Ref; }
interface SubLike {
  id: string;
  customer: Ref;
  status: string;
  // Newer Stripe API versions (2025+/"dahlia") moved current_period_end off
  // the top-level subscription onto its items, so we check both places.
  current_period_end?: number;
  items?: { data?: Array<{ current_period_end?: number }> };
  // Set when the user cancels in the portal but keeps access until the
  // period end — the sub stays status=active with this flag raised.
  cancel_at_period_end?: boolean;
}

/** Safely derive the renewal date from a subscription across API versions.
 * Returns null (never an Invalid Date) so Prisma never throws on a bad value. */
function renewDate(sub: SubLike): Date | null {
  const ts = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  if (typeof ts === 'number' && isFinite(ts) && ts > 0) return new Date(ts * 1000);
  return null;
}

/** Public base URL for Stripe redirect targets. Stripe requires real
 * http(s) URLs for success/cancel — so we point them at our own /return
 * endpoint, which then deep-links back into the app via its scheme. */
function baseUrl(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  return `${proto}://${req.get('host')}`;
}

// Optional no-code Stripe Payment Link (buy.stripe.com/...). When set, we
// use it instead of creating a Checkout Session via the API. We MUST append
// client_reference_id so the webhook can map the payment back to our user
// (a payment link is the same URL for everyone). prefilled_email saves them
// a step. NOTE: the 7-day trial must be configured ON the payment link /
// price in the Stripe dashboard, since we can't set trial_period_days here.
//
// STRIPE_PAYMENT_LINK_TEST is a TEMPORARY override for live test charges:
// set it to a cheap test link to validate a real card payment, then DELETE
// the var to fall back to the real link. The production link
// (STRIPE_PAYMENT_LINK) is never overwritten, so there's no re-typing risk.
// ⚠️ If STRIPE_PAYMENT_LINK_TEST is left set in production, real customers
// pay the test price — delete it as soon as the test is done.
function activePaymentLink(): string {
  const testLink = process.env.STRIPE_PAYMENT_LINK_TEST;
  if (testLink) {
    console.warn('[billing] Using STRIPE_PAYMENT_LINK_TEST override — delete this env var after testing.');
    return testLink;
  }
  return process.env.STRIPE_PAYMENT_LINK || '';
}

// CREATE CHECKOUT — returns a hosted URL to pay. Prefers the no-code Payment
// Link if configured, otherwise builds a Checkout Session via the API.
// @ts-ignore (AuthRequest)
router.post('/checkout', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    if (user.plan === 'PRO') { res.status(400).json({ error: 'Already PRO' }); return; }

    // --- Path A: no-code Payment Link -----------------------------------
    const paymentLink = activePaymentLink();
    if (paymentLink) {
      const sep = paymentLink.includes('?') ? '&' : '?';
      const url = `${paymentLink}${sep}client_reference_id=${encodeURIComponent(userId)}`
        + `&prefilled_email=${encodeURIComponent(user.email)}`;
      res.json({ url });
      return;
    }

    // --- Path B: Checkout Session via API (fallback) --------------------
    if (!STRIPE_PRICE_ID) { res.status(500).json({ error: 'Billing not configured' }); return; }
    const base = baseUrl(req);
    const session = await stripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      client_reference_id: userId,
      ...(user.stripeCustomerId
        ? { customer: user.stripeCustomerId }
        : { customer_email: user.email }),
      subscription_data: { trial_period_days: TRIAL_DAYS },
      allow_promotion_codes: true,
      success_url: `${base}/api/billing/return?status=success`,
      cancel_url: `${base}/api/billing/return?status=cancel`,
    });
    res.json({ url: session.url });
  } catch (err: any) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: err?.message || 'Failed to create checkout' });
  }
});

// BILLING PORTAL — manage / cancel the subscription.
// @ts-ignore (AuthRequest)
router.post('/portal', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.stripeCustomerId) { res.status(400).json({ error: 'No billing account yet' }); return; }

    const portal = await stripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${baseUrl(req)}/api/billing/return?status=portal`,
    });
    res.json({ url: portal.url });
  } catch (err: any) {
    console.error('Portal error:', err);
    res.status(500).json({ error: err?.message || 'Failed to open portal' });
  }
});

// RETURN PAGE — Stripe redirects here (https), we bounce into the app via
// its custom scheme so WebBrowser.openAuthSessionAsync auto-closes.
router.get('/return', (req: Request, res: Response) => {
  const status = (req.query.status as string) || 'success';
  const deepLink = `twentybids://billing?status=${encodeURIComponent(status)}`;
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=${deepLink}">
<style>body{font-family:-apple-system,sans-serif;background:#fafafa;color:#1a1a1a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}a{color:#2563eb}</style>
</head><body><script>window.location.replace(${JSON.stringify(deepLink)});</script>
<div><p>Returning to 20Bids…</p><p><a href="${deepLink}">Tap here if it doesn't open.</a></p></div>
</body></html>`);
});

/**
 * Stripe webhook. Mounted in index.ts with express.raw() BEFORE the global
 * express.json() so the signature verifies against the untouched body.
 *
 * Events handled:
 *   checkout.session.completed   → mark PRO, store customer + sub ids
 *   customer.subscription.updated → keep planRenewsAt / status in sync
 *   customer.subscription.deleted → back to FREE
 */
export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const sig = req.headers['stripe-signature'] as string | undefined;
  if (!sig || !STRIPE_WEBHOOK_SECRET) { res.status(400).send('Missing signature'); return; }

  let event: { type: string; data: { object: unknown } };
  try {
    event = stripe().webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET) as any;
  } catch (err: any) {
    console.error('Webhook signature failed:', err?.message);
    res.status(400).send(`Webhook Error: ${err?.message}`);
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as SessionLike;
        const userId = s.client_reference_id ?? undefined;
        const customerId = idOf(s.customer);
        const subId = idOf(s.subscription);
        if (userId) {
          // Trial counts as PRO from day 1. period end → planRenewsAt.
          let renewsAt: Date | null = null;
          if (subId) {
            try {
              const sub = await stripe().subscriptions.retrieve(subId) as unknown as SubLike;
              renewsAt = renewDate(sub);
            } catch { /* ignore */ }
          }
          // updateMany (not update) so a non-matching id can't throw P2025
          // and 500 the webhook — we log the count instead.
          const r = await prisma.user.updateMany({
            where: { id: userId },
            data: {
              plan: 'PRO',
              planRenewsAt: renewsAt,
              stripeCustomerId: customerId ?? undefined,
              stripeSubscriptionId: subId ?? undefined,
              planCancelAtPeriodEnd: false, // fresh subscription
            },
          });
          console.log(`[billing] checkout.session.completed → marked ${r.count} user(s) PRO (id=${userId})`);
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as SubLike;
        const customerId = idOf(sub.customer);
        if (!customerId) break;
        // active OR trialing = PRO; anything else (past_due, canceled, unpaid) = FREE.
        const isActive = sub.status === 'active' || sub.status === 'trialing';
        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            plan: isActive ? 'PRO' : 'FREE',
            planRenewsAt: isActive ? renewDate(sub) : null,
            stripeSubscriptionId: isActive ? sub.id : null,
            // Cancel-at-period-end keeps status=active until the date hits —
            // surface it so the app can show "Canceled · access until X".
            planCancelAtPeriodEnd: isActive ? (sub.cancel_at_period_end ?? false) : false,
          },
        });
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as SubLike;
        const customerId = idOf(sub.customer);
        if (!customerId) break;
        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: { plan: 'FREE', planRenewsAt: null, stripeSubscriptionId: null, planCancelAtPeriodEnd: false },
        });
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (err: any) {
    console.error('Webhook handler error:', err);
    res.status(500).send('Webhook handler failed');
  }
}

export default router;
