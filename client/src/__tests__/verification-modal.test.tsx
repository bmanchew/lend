
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
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

describe('KycVerificationModal Mobile Tests', () => {
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
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true
    });
  });

  it('initiates KYC verification on mobile and handles successful flow', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'not_started' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          redirectUrl: 'https://verification.url',
          platform: 'mobile'
        })
      });

    const onVerificationComplete = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <KycVerificationModal
          isOpen={true}
          onClose={() => {}}
          onVerificationComplete={onVerificationComplete}
        />
      </QueryClientProvider>
    );

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Verify API calls
    expect(global.fetch).toHaveBeenCalledTimes(2);
    
    // Check status API call
    const firstCall = global.fetch.mock.calls[0];
    expect(firstCall[0]).toBe('/api/kyc/status?userId=123');
    
    // Check start verification API call
    const secondCall = global.fetch.mock.calls[1];
    expect(secondCall[0]).toBe('/api/kyc/start');
    const requestBody = JSON.parse(secondCall[1].body);
    expect(requestBody).toEqual({
      userId: '123',
      platform: 'mobile',
      userAgent: navigator.userAgent
    });
    expect(secondCall[1].headers['X-Mobile-Client']).toBe('true');

    // Check redirect
    expect(window.location.href).toBe('https://verification.url');

    // Verify UI elements
    expect(screen.getByText(/Starting verification process/i)).toBeTruthy();
  });

  it('handles API errors gracefully', async () => {
    global.fetch.mockRejectedValueOnce(new Error('API Error'));

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

    expect(screen.getByText(/Please wait/i)).toBeTruthy();
  });
});
