import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { KycVerificationModal } from '../components/kyc/verification-modal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}));

vi.mock('@/hooks/use-mobile', () => ({
  useMobile: () => true
}));

describe('KycVerificationModal', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('temp_user_id', '123');
    global.fetch = vi.fn();
    global.window = Object.create(window);
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true
    });
  });

  it('initiates KYC verification on mobile automatically', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'not_started' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ redirectUrl: 'https://verification.url' })
      });

    render(
      <QueryClientProvider client={queryClient}>
        <KycVerificationModal
          isOpen={true}
          onClose={() => {}}
          onVerificationComplete={() => {}}
        />
      </QueryClientProvider>
    );

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/kyc/status?userId=123');
    expect(window.location.href).toBe('https://verification.url');
  });
});