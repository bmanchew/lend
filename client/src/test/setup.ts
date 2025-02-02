
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

// Mock fetch
global.fetch = vi.fn();

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock QueryClient
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: '',
    assign: vi.fn(),
    replace: vi.fn()
  },
  writable: true
});
