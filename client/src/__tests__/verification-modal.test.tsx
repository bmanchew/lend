
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { KycVerificationModal } from '../components/kyc/verification-modal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock hooks
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
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true
    });
  });

  it('initiates KYC verification on mobile automatically', async () => {
    // Mock fetch responses
    global.fetch = vi.fn()
      .mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'not_started' })
      }))
      .mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ redirectUrl: 'https://verification.url' })
      }));

    render(
      <QueryClientProvider client={queryClient}>
        <KycVerificationModal
          isOpen={true}
          onClose={() => {}}
          onVerificationComplete={() => {}}
        />
      </QueryClientProvider>
    );

    // Wait for useEffect and API calls
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Verify KYC status check
    expect(global.fetch).toHaveBeenCalledWith('/api/kyc/status?userId=123');
    
    // Verify start verification call
    const secondCall = (global.fetch as any).mock.calls[1];
    expect(secondCall[0]).toBe('/api/kyc/start');
    expect(JSON.parse(secondCall[1].body)).toEqual({
      userId: '123',
      platform: 'mobile',
      userAgent: navigator.userAgent
    });

    // Verify redirect
    expect(window.location.href).toBe('https://verification.url');
  });
});
