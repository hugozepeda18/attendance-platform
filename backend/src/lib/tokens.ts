import { createHash, randomBytes, scrypt, timingSafeEqual } from 'crypto';

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

// Passwords are user-chosen, so they get a slow salted KDF (Node's built-in scrypt), not sha256.
const SCRYPT_KEYLEN = 64;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, SCRYPT_KEYLEN, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split(':');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = await scryptAsync(password, Buffer.from(saltHex, 'hex'));
  return timingSafeEqual(key, Buffer.from(keyHex, 'hex'));
}
