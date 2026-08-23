/**
 * Single source of truth for environment configuration.
 *
 * Every secret used to be read inline with a hardcoded `|| 'dev-…'` fallback,
 * in six different places and — for JWT_SECRET — with TWO different fallback
 * strings, so a missing var didn't fail: it silently signed tokens with one
 * secret and verified them in the WebSocket with another. Reading them here
 * once means a missing secret is a startup error in production instead of a
 * quiet downgrade to a public-knowledge default.
 *
 * In production (NODE_ENV=production) this is strict: a missing required var,
 * or one still holding a dev placeholder, throws at import time. In local dev
 * it warns and substitutes an obviously-fake value so someone touching only
 * the UI can still boot the server.
 */
import 'dotenv/config'; // loads .env locally; on Render the vars are injected
                        // into the process, so this is a no-op there.

const isProd = process.env.NODE_ENV === 'production';

// The placeholders that used to be the fallbacks. If any of these reaches
// production it is as good as no secret at all — they are in the git history.
const DEV_FORBIDDEN = new Set<string>([
    'dev-secret-key-change-in-prod',
    'dev-secret-change-in-production',
    'dev-api-key-change-in-production',
]);

// Required in production. Missing locally → dev placeholder + a warning.
const REQUIRED = [
    'DATABASE_URL',
    'JWT_SECRET',
    'UPLOAD_API_KEY',
    'POLYGON_API_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'RC_WEBHOOK_AUTH',
] as const;

type RequiredKey = typeof REQUIRED[number];

function readRequired(key: RequiredKey): string {
    const val = process.env[key];
    if (!val || val.trim() === '') {
        if (isProd) {
            throw new Error(`[env] Missing required variable ${key}. Set it in Render → Environment.`);
        }
        console.warn(`[env] ${key} is not set — using a DEV placeholder (never valid in production).`);
        return `dev-${key.toLowerCase()}-local-only`;
    }
    if (isProd && DEV_FORBIDDEN.has(val)) {
        throw new Error(`[env] ${key} still holds a DEVELOPMENT placeholder in production. Set a real secret.`);
    }
    return val;
}

export const env = {
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    isProd,
    PORT: process.env.PORT ?? '3001',

    // Required
    DATABASE_URL: readRequired('DATABASE_URL'),
    JWT_SECRET: readRequired('JWT_SECRET'),
    UPLOAD_API_KEY: readRequired('UPLOAD_API_KEY'),
    POLYGON_API_KEY: readRequired('POLYGON_API_KEY'),
    STRIPE_SECRET_KEY: readRequired('STRIPE_SECRET_KEY'),
    STRIPE_WEBHOOK_SECRET: readRequired('STRIPE_WEBHOOK_SECRET'),
    RC_WEBHOOK_AUTH: readRequired('RC_WEBHOOK_AUTH'),

    /** Clave SOLO para /api/external/ingest — la carga diaria de picks desde el
     *  script de R en la instancia de AWS.
     *
     *  Existe separada de UPLOAD_API_KEY a proposito. Una sola clave protegia a
     *  la vez la ingesta de datos y cosas de riesgo muy distinto: la config del
     *  bot de trading con dinero real, los endpoints de admin (incluido el
     *  borrado de un dia entero de recomendaciones) y el envio de push a todos
     *  los usuarios. Rotar esa clave por seguridad rompia la carga de picks, y
     *  no rotarla dejaba el bot expuesto. Separarlas quita esa disyuntiva.
     *
     *  Si no esta puesta, cae a UPLOAD_API_KEY para no romper nada al desplegar.
     *  Rotala cuando puedas tocar el ~/.Renviron de la instancia. */
    INGEST_API_KEY: process.env.INGEST_API_KEY || readRequired('UPLOAD_API_KEY'),

    // Optional — the features that use them degrade gracefully when unset.
    STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID ?? '',
    STRIPE_PAYMENT_LINK: process.env.STRIPE_PAYMENT_LINK ?? '',
    RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',
    EMAIL_FROM: process.env.EMAIL_FROM ?? '20Bids <noreply@20bids.com>',

    // Test-only override of the payment link. Forced to '' in production so a
    // var left behind after a live test can never charge a real customer the
    // test price (see activePaymentLink in routes/billing.ts).
    STRIPE_PAYMENT_LINK_TEST: isProd ? '' : (process.env.STRIPE_PAYMENT_LINK_TEST ?? ''),
} as const;

/**
 * Called from the server's listen callback. The validation itself already ran
 * at import time (the `readRequired` calls above), so this only reports it —
 * the point is a line in the Render log that says the boot was checked.
 */
export function assertEnv(): void {
    console.log(`[env] NODE_ENV=${env.NODE_ENV} — all required variables present.`);
}
