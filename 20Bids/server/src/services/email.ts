/**
 * Email delivery via Resend.
 *
 * Configure in production:
 *   RESEND_API_KEY  — generated at https://resend.com/api-keys
 *   EMAIL_FROM      — verified sender, e.g. "20Bids <noreply@20bids.com>"
 *
 * In dev (no key), all send* functions just log the message to console — so
 * you can still test the flow locally without burning quota or needing a
 * verified domain on every PR branch.
 */

import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.EMAIL_FROM || '20Bids <noreply@20bids.com>';

// Lazy-init the client so importing this file in tests doesn't require the
// env var (only the first send() call does).
let _client: Resend | null = null;
function client(): Resend {
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not set — cannot send email.');
  }
  if (!_client) _client = new Resend(apiKey);
  return _client;
}

/**
 * Send the password reset code to a user. Code is the literal 6-digit
 * string (we already store its hash in the DB). The email never contains
 * the raw email-to-DB linkage — the caller validates the code against the
 * user's row using the email separately.
 *
 * Returns silently on success. Throws on network / API errors so the
 * caller can decide whether to retry or fail the request.
 */
export async function sendPasswordResetEmail(to: string, code: string): Promise<void> {
  // Dev fallback: in CI / local without a key, just log so devs can grab
  // the code from server logs and continue testing.
  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY not set — would have sent code ${code} to ${to}`);
    return;
  }

  const subject = 'Your 20Bids password reset code';
  const html = renderPasswordResetEmail(code);
  const text = `Your 20Bids password reset code is: ${code}\n\nThis code expires in 60 minutes. If you didn't request a password reset, you can safely ignore this email.\n\n— 20Bids`;

  const { error } = await client().emails.send({
    from: fromAddress,
    to: [to],
    subject,
    html,
    text,
  });

  if (error) {
    console.error('[email] Resend API error:', error);
    throw new Error(`Failed to send email: ${error.message || JSON.stringify(error)}`);
  }
}

/**
 * Inline HTML template for the password reset email. Self-contained (no
 * external CSS), inline styles only — every email client supports them.
 * Visual style mirrors the app: white background, ink text, semibold
 * heading, a dark "code pill" in the middle that draws the eye.
 */
function renderPasswordResetEmail(code: string): string {
  return `<!doctype html>
<html>
<body style="margin:0;padding:32px 16px;background-color:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
  <table cellpadding="0" cellspacing="0" border="0" style="max-width:480px;margin:0 auto;background-color:#ffffff;border:1px solid #ececec;border-radius:16px;overflow:hidden;">
    <tr>
      <td style="padding:32px 32px 16px 32px;">
        <div style="font-size:13px;font-weight:600;letter-spacing:0.8px;color:#9a9a9a;text-transform:uppercase;">20Bids</div>
        <h1 style="font-size:24px;font-weight:600;letter-spacing:-0.3px;margin:8px 0 0 0;color:#1a1a1a;">Reset your password</h1>
        <p style="font-size:15px;line-height:22px;color:#6b6b6b;margin:16px 0 0 0;">
          Use the code below in the 20Bids app to set a new password. The code expires in 60 minutes.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 32px 24px 32px;">
        <div style="background-color:#1a1a1a;color:#ffffff;font-family:'SF Mono',Menlo,Monaco,Consolas,monospace;font-size:30px;font-weight:600;letter-spacing:8px;text-align:center;padding:20px 0;border-radius:12px;">
          ${code}
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 32px 32px;">
        <p style="font-size:13px;line-height:20px;color:#9a9a9a;margin:0;">
          If you didn't request a password reset, you can safely ignore this email — your password won't change unless someone enters this code in the app.
        </p>
        <p style="font-size:13px;line-height:20px;color:#9a9a9a;margin:16px 0 0 0;">
          — The 20Bids team
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
