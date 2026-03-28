import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decrypt, encrypt, maskApiKey } from '@/lib/encryption';

const VALID_KEY = 'a'.repeat(64);
const PREVIOUS_KEY = process.env.ENCRYPTION_KEY;

describe('encryption', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = VALID_KEY;
  });

  afterEach(() => {
    if (PREVIOUS_KEY === undefined) {
      delete process.env.ENCRYPTION_KEY;
      return;
    }
    process.env.ENCRYPTION_KEY = PREVIOUS_KEY;
  });

  it('encrypts and decrypts API keys with AES-GCM', () => {
    const plaintext = 'sk-test-1234567890';
    const encrypted = encrypt(plaintext);
    const parts = encrypted.split(':');

    expect(parts).toHaveLength(3);
    expect(parts[0]).toHaveLength(32);
    expect(parts[1]).toHaveLength(32);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it('rejects malformed encrypted payloads', () => {
    expect(() => decrypt('bad-format')).toThrow('Invalid encrypted text format');
    expect(() => decrypt(`${'a'.repeat(10)}:${'b'.repeat(10)}:abcd`)).toThrow(
      'Invalid encrypted text components'
    );
  });

  it('masks short and long API keys safely', () => {
    expect(maskApiKey('12345678')).toBe('********');
    expect(maskApiKey('abcd1234wxyz9876')).toBe('abcd****9876');
  });
});
