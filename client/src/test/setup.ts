import '@testing-library/jest-dom';
import { vi, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { QueryClient } from '@tanstack/react-query';

// Mock Service Worker setup
export const handlers = [
  http.post('/api/kyc/start', () => {
    return HttpResponse.json({
      sessionId: 'test-session',
      redirectUrl: 'didit://verify?session=test-session'
    });
  }),
  http.get('/api/kyc/status', () => {
    return HttpResponse.json({ status: 'pending' });
  }),
];

export const server = setupServer(...handlers);

// Start server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});

// Mock window features
Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock window.screen
Object.defineProperty(window, 'screen', {
  writable: true,
  value: {
    width: 375,
    height: 812,
    orientation: {
      type: 'portrait-primary',
      angle: 0
    }
  }
});

// Mock navigator
Object.defineProperty(window, 'navigator', {
  writable: true,
  value: {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
    platform: 'iPhone',
    vendor: 'Apple Computer, Inc.',
    maxTouchPoints: 5,
    hardwareConcurrency: 6,
    deviceMemory: undefined,
    connection: {
      effectiveType: '4g'
    }
  }
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn()
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

beforeEach(() => {
  // Reset all mocks
  vi.clearAllMocks();
  Object.values(localStorageMock).forEach(mockFn => 
    vi.isMockFunction(mockFn) && mockFn.mockClear()
  );

  // Reset window.location
  Object.defineProperty(window, 'location', {
    value: {
      href: 'http://localhost',
      pathname: '/',
      search: '',
      hash: '',
      assign: vi.fn(),
      replace: vi.fn(),
      reload: vi.fn(),
    },
    writable: true
  });

  // Reset document.hidden
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => false
  });
});