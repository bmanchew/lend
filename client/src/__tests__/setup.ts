import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock window object
const windowMock = {
  location: { href: '' },
  navigator: {
    userAgent: 'iPhone',
    platform: 'iOS',
    vendor: 'Apple'
  }
};

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  clear: vi.fn()
};

// Setup before each test
beforeEach(() => {
  // Setup localStorage
  global.localStorage = localStorageMock;
  global.localStorage.getItem.mockReturnValue('123');
  
  // Setup window location
  Object.defineProperty(window, 'location', {
    value: windowMock.location,
    writable: true
  });
  
  // Setup navigator
  Object.defineProperty(window, 'navigator', {
    value: windowMock.navigator,
    writable: true
  });
});

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
