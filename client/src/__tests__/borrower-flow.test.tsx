import { screen, waitFor } from '@testing-library/react';
import { KycVerificationModal } from '../components/kyc/verification-modal';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render } from '../test/test-utils';
import { useMobile } from '../hooks/use-mobile';
import { http, HttpResponse } from 'msw';
import { server } from '../test/setup';

/**
 * Mock Hooks
 * These mocks simulate the behavior of our mobile detection and authentication hooks
 * to create controlled test environments for both mobile and desktop flows.
 */
vi.mock('../hooks/use-mobile', () => ({
  useMobile: vi.fn()
}));

vi.mock('../hooks/use-auth', () => ({
  useAuth: vi.fn().mockReturnValue({
    user: { id: 1 }
  })
}));

const mockUseMobile = useMobile as ReturnType<typeof vi.fn>;

/**
 * Borrower KYC Flow Test Suite
 * Tests the complete KYC verification process for borrowers, including:
 * - Mobile-specific flows and deep linking
 * - App installation prompts
 * - Retry mechanisms
 * - Desktop fallback behavior
 */
describe('Borrower KYC Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mockUseMobile.mockReturnValue(false); // Default to desktop
  });

  /**
   * Mobile KYC Flow Test
   * Verifies the complete mobile verification process including:
   * 1. Initial loading state
   * 2. Deep link generation
   * 3. Status polling
   * 4. Completion handling
   */
  it('should handle mobile KYC flow correctly', async () => {
    // Setup mobile device simulation
    mockUseMobile.mockReturnValue(true);
    vi.useFakeTimers();

    // Mock API responses for the test
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

    // Verify initial loading state
    expect(await screen.findByText(/preparing mobile verification/i)).toBeInTheDocument();

    // Test deep linking behavior
    await vi.advanceTimersByTimeAsync(2000);
    expect(window.location.href).toContain('didit://verify');

    // Simulate successful verification
    server.use(
      http.get('/api/kyc/status', () => {
        return HttpResponse.json({ status: 'COMPLETED' });
      })
    );

    // Verify completion callbacks
    await waitFor(() => {
      expect(onVerificationComplete).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  /**
   * App Installation Flow Test
   * Verifies the behavior when the Didit app is not installed:
   * 1. Initial deep link attempt
   * 2. Fallback to app store prompt
   * 3. Installation guidance display
   */
  it('should handle app installation prompt for mobile', async () => {
    mockUseMobile.mockReturnValue(true);
    vi.useFakeTimers();

    render(<KycVerificationModal isOpen={true} onClose={vi.fn()} />);

    // Wait for deep link attempts
    await vi.advanceTimersByTimeAsync(4000);

    // Verify app installation prompt
    expect(await screen.findByText(/didit app is required/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download app/i })).toBeInTheDocument();
  });

  /**
   * Retry Functionality Test
   * Verifies the retry mechanism when verification fails:
   * 1. Initial failure scenario
   * 2. Retry button functionality
   * 3. New session creation
   */
  it('should handle retry functionality', async () => {
    mockUseMobile.mockReturnValue(true);
    vi.useFakeTimers();

    const { rerender } = render(
      <KycVerificationModal isOpen={true} onClose={vi.fn()} />
    );

    // Wait for app install prompt
    await vi.advanceTimersByTimeAsync(4000);

    // Verify retry button
    const retryButton = screen.getByRole('button', { name: /try again/i });
    expect(retryButton).toBeInTheDocument();

    // Test retry mechanism
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

    // Verify return to loading state
    expect(await screen.findByText(/preparing mobile verification/i)).toBeInTheDocument();
  });

  /**
   * Desktop Flow Test
   * Verifies the desktop verification experience:
   * 1. Platform detection
   * 2. Desktop-specific UI elements
   * 3. Verification process initialization
   */
  it('should handle desktop KYC flow correctly', async () => {
    mockUseMobile.mockReturnValue(false);

    render(
      <KycVerificationModal
        isOpen={true}
        onClose={vi.fn()}
        onVerificationComplete={vi.fn()}
      />
    );

    // Verify desktop-specific content
    expect(await screen.findByText(/starting verification process/i)).toBeInTheDocument();
  });
});