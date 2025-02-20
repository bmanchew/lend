import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MerchantLogin from '../pages/auth/merchant-login';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockNavigate = vi.fn();
const mockToast = vi.fn();
const mockLoginMutation = {
  mutateAsync: vi.fn(),
  isPending: false
};

vi.mock('wouter', () => ({
  useNavigate: () => mockNavigate
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast })
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    loginMutation: mockLoginMutation,
    user: null
  })
}));

describe('MerchantLogin', () => {
  const queryClient = new QueryClient();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows validation errors for empty fields', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MerchantLogin />
      </QueryClientProvider>
    );

    const loginButton = screen.getByText(/login/i);
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(screen.getByText('Username is required')).toBeInTheDocument();
      expect(screen.getByText('Password is required')).toBeInTheDocument();
    });
  });

  it('handles successful merchant login', async () => {
    const mockResponse = {
      token: 'test-token',
      id: 1,
      role: 'merchant',
      name: 'Test Merchant',
      email: 'test@merchant.com'
    };

    mockLoginMutation.mutateAsync.mockResolvedValueOnce(mockResponse);

    render(
      <QueryClientProvider client={queryClient}>
        <MerchantLogin />
      </QueryClientProvider>
    );

    fireEvent.change(screen.getByLabelText(/username\/email/i), {
      target: { value: 'test@merchant.com' }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' }
    });

    const loginButton = screen.getByText(/login/i);
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(mockLoginMutation.mutateAsync).toHaveBeenCalledWith({
        username: 'test@merchant.com',
        password: 'password123',
        loginType: 'merchant'
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: 'Success',
        description: 'Successfully logged in'
      });

      expect(mockNavigate).toHaveBeenCalledWith('/merchant/dashboard');
      expect(localStorage.getItem('token')).toBe('test-token');
    });
  });

  it('handles login failure', async () => {
    const errorMessage = 'Invalid credentials';
    mockLoginMutation.mutateAsync.mockRejectedValueOnce({
      response: { data: { error: errorMessage } }
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MerchantLogin />
      </QueryClientProvider>
    );

    fireEvent.change(screen.getByLabelText(/username\/email/i), {
      target: { value: 'test@merchant.com' }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'wrongpassword' }
    });

    const loginButton = screen.getByText(/login/i);
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(mockLoginMutation.mutateAsync).toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Login Error',
        description: errorMessage,
        variant: 'destructive'
      });
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});