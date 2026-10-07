import { hashPassword, verifyPassword, hashToken, generateToken } from '../../src/lib/tokens';

describe('password hashing', () => {
  it('verifies the right password and rejects others', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(stored).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('wrong', stored)).toBe(false);
  });

  it('salts: same password hashes differently', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('rejects malformed stored hashes', async () => {
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });
});

describe('tokens', () => {
  it('generates prefixed random tokens with stable hashes', () => {
    const t = generateToken('st');
    expect(t).toMatch(/^st_[A-Za-z0-9_-]{43}$/);
    expect(generateToken('st')).not.toBe(t);
    expect(hashToken(t)).toBe(hashToken(t));
  });
});
