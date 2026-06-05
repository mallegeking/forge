import crypto from "node:crypto";

// Single-user passcode gate. The session cookie holds a stateless token derived
// from APP_PASSCODE via HMAC, so there's nothing to store server-side and
// changing the passcode invalidates every existing cookie.

export const AUTH_COOKIE = "mp_session";

function passcode(): string {
  return process.env.APP_PASSCODE ?? "";
}

/** The token we store in the cookie and re-derive to validate requests. */
export function sessionToken(): string {
  return crypto
    .createHmac("sha256", "multipee-session-v1")
    .update(passcode())
    .digest("hex");
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Length check first; timingSafeEqual throws on length mismatch.
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/** Does the typed passcode match the configured one? */
export function checkPasscode(input: string): boolean {
  const expected = passcode();
  if (!expected) return false;
  return timingSafeEqual(input, expected);
}

/** Is a request cookie value a currently-valid session token? */
export function isValidSessionValue(value: string | undefined): boolean {
  if (!value) return false;
  return timingSafeEqual(value, sessionToken());
}
