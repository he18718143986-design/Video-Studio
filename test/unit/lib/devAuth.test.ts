import { afterEach, describe, expect, it } from 'vitest';
import {
  isDevDirectRegisterAllowed,
  isLocalOrPrivateHost,
  normalizeHostname,
} from '@/lib/devAuth';

const PREVIOUS_NODE_ENV = process.env.NODE_ENV;
const PREVIOUS_DEV_AUTH_BYPASS = process.env.DEV_AUTH_BYPASS;

afterEach(() => {
  if (PREVIOUS_NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = PREVIOUS_NODE_ENV;
  }

  if (PREVIOUS_DEV_AUTH_BYPASS === undefined) {
    delete process.env.DEV_AUTH_BYPASS;
  } else {
    process.env.DEV_AUTH_BYPASS = PREVIOUS_DEV_AUTH_BYPASS;
  }
});

describe('devAuth', () => {
  it('normalizes hostnames with ports and IPv6 brackets', () => {
    expect(normalizeHostname('LOCALHOST:3000')).toBe('localhost');
    expect(normalizeHostname('[::1]:3000')).toBe('::1');
    expect(normalizeHostname('192.168.0.10:8080')).toBe('192.168.0.10');
  });

  it('detects local and private network hosts', () => {
    expect(isLocalOrPrivateHost('localhost')).toBe(true);
    expect(isLocalOrPrivateHost('127.0.0.1')).toBe(true);
    expect(isLocalOrPrivateHost('[::1]:3000')).toBe(true);
    expect(isLocalOrPrivateHost('192.168.1.22')).toBe(true);
    expect(isLocalOrPrivateHost('172.20.2.5')).toBe(true);
    expect(isLocalOrPrivateHost('10.0.0.15')).toBe(true);
    expect(isLocalOrPrivateHost('8.8.8.8')).toBe(false);
    expect(isLocalOrPrivateHost('example.com')).toBe(false);
  });

  it('allows dev direct register only in non-production by default', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DEV_AUTH_BYPASS;
    expect(isDevDirectRegisterAllowed('192.168.0.103:3000')).toBe(true);
    expect(isDevDirectRegisterAllowed('example.com')).toBe(false);

    process.env.NODE_ENV = 'production';
    expect(isDevDirectRegisterAllowed('192.168.0.103:3000')).toBe(false);
  });

  it('supports explicit bypass flags in non-production', () => {
    process.env.NODE_ENV = 'development';
    process.env.DEV_AUTH_BYPASS = '1';
    expect(isDevDirectRegisterAllowed('example.com')).toBe(true);

    process.env.DEV_AUTH_BYPASS = '0';
    expect(isDevDirectRegisterAllowed('localhost:3000')).toBe(false);
  });
});
