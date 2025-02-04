import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { KycVerificationModal } from '../components/kyc/verification-modal';
import { AuthProvider } from '../hooks/use-auth';
import { useMobile } from '../hooks/use-mobile';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the hooks
vi.mock('../hooks/use-mobile', () => ({
  useMobile: vi.fn()
}));

const mockUseMobile = useMobile as ReturnType<typeof vi.fn>;

describe('Borrower KYC Flow', () => {
  const queryClient = new QueryClient();

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Mock fetch globally
    global.fetch = vi.fn();

    // Mock browser APIs
    Object.defineProperty(global, 'screen', {
      value: {
        width: 375,
        height: 812,
        orientation: {
          type: 'portrait-primary'
        }
      }
    });

    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        platform: 'iPhone',
        vendor: 'Apple Computer, Inc.',
        maxTouchPoints: 5,
        hardwareConcurrency: 6,
        deviceMemory: undefined,
      },
      writable: true
    });

    // Mock window location and other properties
    Object.defineProperty(window, 'location', {
      value: {
        href: 'http://localhost',
        protocol: 'http:',
        host: 'localhost',
        hostname: 'localhost',
        pathname: '/',
        search: '',
        hash: ''
      },
      writable: true
    });

    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
      writable: true
    });
  });

  it('should handle mobile KYC flow correctly', async () => {
    // Mock mobile device
    mockUseMobile.mockReturnValue(true);

    const mockUser = {
      id: 1,
      role: 'borrower',
      kycStatus: 'pending'
    };

    const onClose = vi.fn();
    const onVerificationComplete = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <KycVerificationModal
            isOpen={true}
            onClose={onClose}
            onVerificationComplete={onVerificationComplete}
          />
        </AuthProvider>
      </QueryClientProvider>
    );

    // Verify mobile-specific content is shown
    await waitFor(() => {
      expect(screen.getByText(/preparing mobile verification/i)).toBeInTheDocument();
    });

    // Verify API calls
    expect(fetch).toHaveBeenCalledWith('/api/kyc/status?userId=1', expect.any(Object));
    expect(fetch).toHaveBeenCalledWith('/api/kyc/start', expect.any(Object));
  });

  it('should handle desktop KYC flow correctly', async () => {
    // Mock desktop device
    mockUseMobile.mockReturnValue(false);

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <KycVerificationModal
            isOpen={true}
            onClose={vi.fn()}
            onVerificationComplete={vi.fn()}
          />
        </AuthProvider>
      </QueryClientProvider>
    );

    // Verify desktop-specific content is shown
    await waitFor(() => {
      expect(screen.getByText(/starting verification process/i)).toBeInTheDocument();
    });
  });
});