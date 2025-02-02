
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { KycVerificationModal } from '../components/kyc/verification-modal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock hooks
vi.mock('../hooks/use-mobile', () => ({
  useMobile: () => true
}));

vi.mock('../hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}));

describe('KycVerificationModal', () => {
  const queryClient = new QueryClient();
  const mockStartVerification = vi.fn();

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    localStorage.setItem('temp_user_id', '123');
  });

  it('automatically initiates KYC verification on mobile', async () => {
    // Mock fetch for KYC status
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/kyc/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'not_started' })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ redirectUrl: 'https://verification.url' })
      });
    });

    // Mock window.location
    const mockLocation = new URL('https://test.com');
    delete window.location;
    window.location = mockLocation;

    render(
      <QueryClientProvider client={queryClient}>
        <KycVerificationModal
          isOpen={true}
          onClose={() => {}}
          onVerificationComplete={() => {}}
        />
      </QueryClientProvider>
    );

    // Wait for effects to run
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Verify KYC was initiated
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/kyc/status'));
    expect(window.location).toBeDefined();

    // Clean up
    vi.restoreAllMocks();
  });
});
