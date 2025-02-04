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
  });

  it('should handle mobile KYC flow correctly', async () => {
    // Mock mobile device
    mockUseMobile.mockReturnValue(true);

    const onClose = vi.fn();
    const onVerificationComplete = vi.fn();

    render(
      <KycVerificationModal
        isOpen={true}
        onClose={onClose}
        onVerificationComplete={onVerificationComplete}
      />
    );

    // Verify mobile-specific content is shown
    await waitFor(() => {
      expect(screen.getByText(/preparing mobile verification/i)).toBeInTheDocument();
    });

    // Verify app redirection attempt
    await waitFor(() => {
      expect(window.location.href).toContain('didit://verify');
    });

    // Test status polling with completed status
    server.use(
      http.get('/api/kyc/status', () => {
        return HttpResponse.json({ status: 'COMPLETED' });
      })
    );

    await waitFor(() => {
      expect(onVerificationComplete).toHaveBeenCalled();
    });
  });

  it('should handle mobile app installation prompt', async () => {
    mockUseMobile.mockReturnValue(true);
    vi.useFakeTimers();

    render(
      <KycVerificationModal isOpen={true} onClose={vi.fn()} />
    );

    // Fast-forward timers to trigger app store prompt
    await vi.advanceTimersByTimeAsync(4000);

    // Verify app installation prompt
    await waitFor(() => {
      expect(screen.getByText(/please install the didit app/i)).toBeInTheDocument();
    });

    vi.useRealTimers();
  });

  it('should handle desktop KYC flow correctly', async () => {
    // Mock desktop device
    mockUseMobile.mockReturnValue(false);

    render(
      <KycVerificationModal
        isOpen={true}
        onClose={vi.fn()}
        onVerificationComplete={vi.fn()}
      />
    );

    // Verify desktop-specific content is shown
    await waitFor(() => {
      expect(screen.getByText(/starting verification process/i)).toBeInTheDocument();
    });
  });
});