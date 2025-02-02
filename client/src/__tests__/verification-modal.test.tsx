
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { KycVerificationModal } from '../components/kyc/verification-modal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock useToast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}));

// Mock useMobile hook
vi.mock('@/hooks/use-mobile', () => ({
  useMobile: () => true
}));

describe('KycVerificationModal', () => {
  const queryClient = new QueryClient();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('temp_user_id', '123');
  });

  it('initiates KYC verification on mobile automatically', async () => {
    const mockStartVerification = vi.fn();
    const mockOnClose = vi.fn();
    const mockOnVerificationComplete = vi.fn();

    // Mock fetch response
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
          onClose={mockOnClose}
          onVerificationComplete={mockOnVerificationComplete}
        />
      </QueryClientProvider>
    );

    // Wait for async operations
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Verify API calls
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const calls = (global.fetch as any).mock.calls;
    expect(calls[0][0]).toContain('/api/kyc/status');
    expect(calls[1][0]).toContain('/api/kyc/start');
  });
});
