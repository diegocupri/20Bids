/**
 * Stripe client singleton.
 *
 * Env required in production (Render → Environment):
 *   STRIPE_SECRET_KEY      sk_live_... (or sk_test_... in test mode)
 *   STRIPE_WEBHOOK_SECRET  whsec_...   (from the webhook endpoint you create)
 *   STRIPE_PRICE_ID        price_...   (the €199/mo recurring price)
 *
 * We don't pin apiVersion — letting the SDK use its bundled default avoids
 * type mismatches when the package is upgraded. We also type the client via
 * InstanceType<> instead of the `Stripe` namespace, because the v22 typings
 * don't expose a usable default type alias under this tsconfig.
 */
import StripeLib from 'stripe';

export type StripeClient = InstanceType<typeof StripeLib>;

const key = process.env.STRIPE_SECRET_KEY;

let _stripe: StripeClient | null = null;
export function stripe(): StripeClient {
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  if (!_stripe) _stripe = new StripeLib(key);
  return _stripe;
}

export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || '';
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
/** 7-day free trial then the recurring price kicks in. */
export const TRIAL_DAYS = 7;
