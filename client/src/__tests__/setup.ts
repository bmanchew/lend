import '@testing-library/jest-dom';
import { beforeAll, vi } from 'vitest';
import { server } from '../test/server';

beforeAll(() => server.listen());

// Mock IntersectionObserver
class IntersectionObserverMock {
  observe() { return null; }
  unobserve() { return null; }
  disconnect() { return null; }
}

window.IntersectionObserver = IntersectionObserverMock;

// Single localStorage mock
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn()
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

export { localStorageMock };