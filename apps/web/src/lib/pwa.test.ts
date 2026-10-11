import { describe, expect, it } from 'vitest';
import { isIosDevice } from './pwa';

describe('isIosDevice', () => {
  it('recognises iPhones and iPads', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1')).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) Safari/604.1')).toBe(true);
  });

  it('recognises an iPad that says it is a Mac, but not a real Mac', () => {
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15';
    expect(isIosDevice(mac, 5)).toBe(true);
    expect(isIosDevice(mac, 0)).toBe(false);
  });

  it('is false for Android and desktop browsers', () => {
    expect(isIosDevice('Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/120.0 Mobile Safari/537.36', 5)).toBe(false);
    expect(isIosDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36')).toBe(false);
  });
});
