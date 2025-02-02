import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

// Mock fetch globally
global.fetch = vi.fn();

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: '',
    assign: vi.fn(),
    replace: vi.fn()
  },
  writable: true
});

// QueryClient for tests
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

// Setup before each test
beforeEach(() => {
  vi.clearAllMocks();
  if (global.fetch && typeof global.fetch.mockClear === 'function') {
    global.fetch.mockClear();
  }

  // Mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
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

  // Reset localStorage mocks
  const storage = {};
  window.localStorage.getItem = vi.fn(key => storage[key]);
  window.localStorage.setItem = vi.fn((key, value) => storage[key] = value);
  window.localStorage.clear = vi.fn(() => Object.keys(storage).forEach(key => delete storage[key]));

  // Mock ResizeObserver
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  // Mock window.location
  Object.defineProperty(window, 'location', {
    value: {
      href: 'http://localhost',
      pathname: '/',
      assign: vi.fn(),
      replace: vi.fn()
    },
    writable: true
  });
});

// Cleanup after each test
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});