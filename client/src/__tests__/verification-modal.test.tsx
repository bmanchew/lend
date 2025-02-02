import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { KycVerificationModal } from '../components/kyc/verification-modal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Create mockToast before mocking the hook
const mockToast = vi.fn();
const mockGetItem = vi.fn();

// Mock useToast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast
  })
}));

// Mock useMobile hook
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

  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Setup fetch mock
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // Setup localStorage mock
    mockGetItem.mockReturnValue('123');
    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: mockGetItem,
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn()
      },
      writable: true
    });

    // Setup window.location mock
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('initiates KYC verification on mobile and handles successful flow', async () => {
    mockFetch
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

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    // Check status API call
    expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/kyc/status?userId=123', expect.any(Object));

    // Check start verification API call
    const [url, config] = mockFetch.mock.calls[1];
    expect(url).toBe('/api/kyc/start');
    expect(JSON.parse(config.body)).toEqual({
      userId: '123',
      platform: 'mobile',
      userAgent: expect.any(String)
    });
    expect(config.headers['X-Mobile-Client']).toBe('true');

    // Check redirect
    expect(window.location.href).toBe('https://verification.url');

    // Verify UI elements
    expect(screen.getByText(/Starting verification process/i)).toBeTruthy();
  });

  it('handles pending KYC status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'pending' })
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

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText(/Please wait/i)).toBeTruthy();
  });

  it('handles API errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('API Error'));

    render(
      <QueryClientProvider client={queryClient}>
        <KycVerificationModal
          isOpen={true}
          onClose={() => {}}
          onVerificationComplete={() => {}}
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockToast).toHaveBeenCalledWith({
        title: "Verification Error",
        description: "Failed to start verification. Please try again.",
        variant: "destructive"
      });
    });
  });

  it('handles successful KYC completion', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'Approved' })
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

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(onVerificationComplete).toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith({
        title: "Verification Complete",
        description: "Your identity has been verified successfully."
      });
    });
  });
});