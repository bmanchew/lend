
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CustomerLogin from '../pages/auth/customer-login';
import { KycVerificationModal } from '../components/kyc/verification-modal';

// Mock hooks
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast })
}));

vi.mock('@/hooks/use-mobile', () => ({
  useMobile: () => true
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/login/customer', () => {}],
  useNavigate: () => () => {}
}));

describe('Borrower Flow Tests', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn()
      },
      writable: true
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('completes full borrower flow from OTP to KYC initiation', async () => {
    vi.useFakeTimers();
    
    // Mock successful OTP send
    mockFetch
      .mockImplementationOnce(() => 
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ 
            message: 'OTP sent successfully'
          })
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: 1,
            username: 'testuser',
            role: 'borrower',
            kycStatus: 'pending',
            phoneNumber: '+15555555555',
            lastOtpCode: '123456'
          })
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ 
            redirectUrl: 'https://verification.test.com',
            sessionId: 'test-session'
          })
        })
      );

    // Mock successful login
    mockFetch.mockImplementationOnce(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 1,
          username: 'testuser',
          role: 'borrower',
          kycStatus: 'pending'
        })
      })
    );

    // Mock KYC initialization
    mockFetch.mockImplementationOnce(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          redirectUrl: 'https://verification.didit.me/session/test',
          sessionId: 'test-session'
        })
      })
    );

    render(
      <QueryClientProvider client={queryClient}>
        <CustomerLogin />
      </QueryClientProvider>
    );

    // Enter phone number
    const phoneInput = screen.getByPlaceholderText(/phone/i);
    fireEvent.change(phoneInput, { target: { value: '5555555555' } });

    // Click send code
    const sendCodeBtn = screen.getByText(/send code/i);
    fireEvent.click(sendCodeBtn);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Code Sent',
        description: expect.any(String)
      });
    });

    // Enter OTP code
    const otpInputs = screen.getAllByRole('textbox');
    otpInputs.forEach((input, i) => {
      fireEvent.change(input, { target: { value: i.toString() } });
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/login', expect.any(Object));
    });

    // Verify KYC modal appears and starts verification
    render(
      <QueryClientProvider client={queryClient}>
        <KycVerificationModal isOpen={true} onClose={() => {}} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/kyc/start', expect.any(Object));
    });

    // Verify redirection to verification URL
    expect(mockToast).not.toHaveBeenCalledWith({
      title: 'Verification Error',
      variant: 'destructive'
    });
  });
});
