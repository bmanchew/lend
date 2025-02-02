
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
    // Reset window.location
    const location = window.location;
    delete (window as any).location;
    window.location = { ...location, href: '' };
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

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Verify API calls were made
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith('/api/kyc/status?userId=123');
    expect(global.fetch).toHaveBeenCalledWith('/api/kyc/start');
    
    // Verify redirect happened
    expect(window.location.href).toBe('https://verification.url');
  });
});
