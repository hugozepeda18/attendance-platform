import { createHash, randomBytes, timingSafeEqual } from 'crypto';

// Bearer tokens are stored only as sha256 hashes; the plaintext is shown once at creation.
// sha256 (not a slow KDF) is fine here because tokens are 256-bit random, not user-chosen.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

export function safeEqual(a: string, b: string): boolean {
  const ha = Buffer.from(hashToken(a));
  const hb = Buffer.from(hashToken(b));
  return timingSafeEqual(ha, hb);
}
