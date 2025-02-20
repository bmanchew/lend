import '@testing-library/jest-dom';
import { beforeAll, afterEach, vi } from 'vitest';
import { server } from '../test/server';

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());

// Mock IntersectionObserver
class IntersectionObserverMock implements IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  disconnect() { return null; }
  observe() { return null; }
  unobserve() { return null; }
  takeRecords(): IntersectionObserverEntry[] { return []; }
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