import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  clear: vi.fn(),
  removeItem: vi.fn()
};

// Mock fetch
global.fetch = vi.fn();

// Mock window properties
Object.defineProperty(window, 'localStorage', { value: localStorageMock });
Object.defineProperty(window, 'location', { 
  value: { href: '', pathname: '', search: '' },
  writable: true
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Setup before each test
beforeEach(() => {
  // Setup localStorage

  // Setup window location

  // Setup navigator
  vi.clearAllMocks();
  fetch.mockClear();
});

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});