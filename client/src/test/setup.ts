
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

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
  global.fetch.mockClear();
  window.localStorage.getItem.mockClear();
  window.localStorage.setItem.mockClear();
});
