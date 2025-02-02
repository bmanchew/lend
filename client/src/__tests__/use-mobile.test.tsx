import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useMobile } from '@/hooks/use-mobile';

describe('useMobile Hook', () => {
  const originalWindow = { ...window };
  const mockMatchMedia = vi.fn();

  beforeEach(() => {
    // Mock window properties
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      value: 1024
    });

    Object.defineProperty(window, 'navigator', {
      writable: true,
      value: {
        userAgent: '',
        platform: '',
        maxTouchPoints: 0
      }
    });

    window.matchMedia = mockMatchMedia;
  });

  afterEach(() => {
    // Restore window object
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      value: originalWindow.innerWidth
    });
    window.matchMedia = originalWindow.matchMedia;
  });

  it('should detect desktop device', () => {
    // Setup desktop environment
    window.innerWidth = 1024;
    window.navigator.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
    window.navigator.maxTouchPoints = 0;

    const { result } = renderHook(() => useMobile());
    expect(result.current).toBe(false);
  });

  it('should detect mobile device by user agent', () => {
    // Setup mobile environment
    window.innerWidth = 375;
    window.navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)';
    window.navigator.maxTouchPoints = 5;

    const { result } = renderHook(() => useMobile());
    expect(result.current).toBe(true);
  });

  it('should detect mobile device by screen size', () => {
    // Setup tablet environment
    window.innerWidth = 768;
    window.navigator.userAgent = 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)';
    window.navigator.maxTouchPoints = 5;

    const { result } = renderHook(() => useMobile());
    expect(result.current).toBe(true);
  });
});
