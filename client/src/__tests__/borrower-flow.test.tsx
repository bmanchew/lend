import { screen, waitFor } from '@testing-library/react';
import { KycVerificationModal } from '../components/kyc/verification-modal';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render } from '../test/test-utils';
import { useMobile } from '../hooks/use-mobile';
import { http, HttpResponse } from 'msw';
import { server } from '../test/setup';

// Mock the hooks
vi.mock('../hooks/use-mobile', () => ({
  useMobile: vi.fn()
}));

vi.mock('../hooks/use-auth', () => ({
  useAuth: vi.fn().mockReturnValue({
    user: { id: 1 }
  })
}));

const mockUseMobile = useMobile as ReturnType<typeof vi.fn>;

describe('Borrower KYC Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mockUseMobile.mockReturnValue(false); // Default to desktop
  });

  it('should handle mobile KYC flow correctly', async () => {
    // Setup mobile device simulation
    mockUseMobile.mockReturnValue(true);
    vi.useFakeTimers();

    // Mock handlers for the test
    server.use(
      http.post('/api/kyc/start', () => {
        return HttpResponse.json({
          sessionId: 'test-session',
          redirectUrl: 'didit://verify?session=test-session'
        });
      }),
      http.get('/api/kyc/status', () => {
        return HttpResponse.json({ status: 'pending' });
      })
    );

    const onClose = vi.fn();
    const onVerificationComplete = vi.fn();

    render(
      <KycVerificationModal
        isOpen={true}
        onClose={onClose}
        onVerificationComplete={onVerificationComplete}
      />
    );

    // Check initial loading state
    expect(await screen.findByText(/preparing mobile verification/i)).toBeInTheDocument();

    // Advance timers to trigger app check
    await vi.advanceTimersByTimeAsync(2000);
    expect(window.location.href).toContain('didit://verify');

    // Simulate completion
    server.use(
      http.get('/api/kyc/status', () => {
        return HttpResponse.json({ status: 'COMPLETED' });
      })
    );

    await waitFor(() => {
      expect(onVerificationComplete).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('should handle app installation prompt for mobile', async () => {
    mockUseMobile.mockReturnValue(true);
    vi.useFakeTimers();

    render(<KycVerificationModal isOpen={true} onClose={vi.fn()} />);

    // Wait for initial redirect attempts
    await vi.advanceTimersByTimeAsync(4000);

    // Should show app installation prompt
    expect(await screen.findByText(/didit app is required/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download app/i })).toBeInTheDocument();
  });

  it('should handle retry functionality', async () => {
    mockUseMobile.mockReturnValue(true);
    vi.useFakeTimers();

    const { rerender } = render(
      <KycVerificationModal isOpen={true} onClose={vi.fn()} />
    );

    // Wait for app install prompt
    await vi.advanceTimersByTimeAsync(4000);

    // Click retry button
    const retryButton = screen.getByRole('button', { name: /try again/i });
    expect(retryButton).toBeInTheDocument();

    // Reset mocks and rerender to test retry
    server.use(
      http.post('/api/kyc/start', () => {
        return HttpResponse.json({
          sessionId: 'new-session',
          redirectUrl: 'didit://verify?session=new-session'
        });
      })
    );

    retryButton.click();
    rerender(<KycVerificationModal isOpen={true} onClose={vi.fn()} />);

    // Should show loading state again
    expect(await screen.findByText(/preparing mobile verification/i)).toBeInTheDocument();
  });

  it('should handle desktop KYC flow correctly', async () => {
    mockUseMobile.mockReturnValue(false);

    render(
      <KycVerificationModal
        isOpen={true}
        onClose={vi.fn()}
        onVerificationComplete={vi.fn()}
      />
    );

    // Should show desktop-specific content
    expect(await screen.findByText(/starting verification process/i)).toBeInTheDocument();
  });
});