
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import MerchantLogin from '../pages/auth/merchant-login';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  ...vi.importActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast })
}));

const mockLoginMutation = {
  mutateAsync: vi.fn(),
  isPending: false
};
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ loginMutation: mockLoginMutation })
}));

describe('MerchantLogin', () => {
  const queryClient = new QueryClient();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <MerchantLogin />
        </QueryClientProvider>
      </BrowserRouter>
    );
  };

  it('shows validation errors for empty fields', async () => {
    renderComponent();
    const loginButton = screen.getByRole('button', { name: /login/i });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(screen.getByText('Username is required')).toBeInTheDocument();
      expect(screen.getByText('Password is required')).toBeInTheDocument();
    });
  });

  it('handles successful login', async () => {
    mockLoginMutation.mutateAsync.mockResolvedValueOnce({ 
      role: 'merchant',
      id: 1 
    });

    renderComponent();

    fireEvent.change(screen.getByLabelText(/username/i), {
      target: { value: 'testmerchant' }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' }
    });

    const loginButton = screen.getByRole('button', { name: /login/i });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/merchant/dashboard', { replace: true });
    });
  });

  it('handles login failure', async () => {
    mockLoginMutation.mutateAsync.mockRejectedValueOnce(new Error('Invalid credentials'));

    renderComponent();

    fireEvent.change(screen.getByLabelText(/username/i), {
      target: { value: 'testmerchant' }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'wrongpassword' }
    });

    const loginButton = screen.getByRole('button', { name: /login/i });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Login failed',
        description: 'Invalid credentials',
        variant: 'destructive'
      });
    });
  });

  it('disables login button during submission', async () => {
    mockLoginMutation.isPending = true;
    renderComponent();

    const loginButton = screen.getByRole('button', { name: /login/i });
    expect(loginButton).toBeDisabled();
    expect(loginButton).toHaveTextContent('Logging in...');
  });

  it('validates username format', async () => {
    renderComponent();

    fireEvent.change(screen.getByLabelText(/username/i), {
      target: { value: 't' }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' }
    });

    const loginButton = screen.getByRole('button', { name: /login/i });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(screen.getByText('Username must be at least 3 characters')).toBeInTheDocument();
    });
  });
});
