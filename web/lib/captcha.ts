import "server-only";

/**
 * Cloudflare Turnstile guards the endpoints that create accounts or send email
 * (sign-up and password-reset requests). It is off unless both keys are set;
 * one without the other is a misconfiguration and fails with an error rather than
 * silently running unprotected.
 */
const siteKey = process.env.TURNSTILE_SITE_KEY?.trim() || null;
const secretKey = process.env.TURNSTILE_SECRET_KEY?.trim() || null;

if (Boolean(siteKey) !== Boolean(secretKey)) {
  throw new Error("Set both TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY to enable the sign-up CAPTCHA, or neither.");
}

export const captchaSiteKey: string | null = siteKey;
export const captchaSecretKey: string | null = secretKey;
export const CAPTCHA_ENDPOINTS = ["/sign-up/email", "/request-password-reset"];
