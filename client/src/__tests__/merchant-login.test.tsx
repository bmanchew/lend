import { render, screen, fireEvent, waitFor } from '@testing-library/react';
<<<<<<< HEAD
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MerchantLogin from '../pages/auth/merchant-login';
=======
import { describe, it, expect, vi } from 'vitest';
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import MerchantLogin from '../pages/auth/merchant-login';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  ...vi.importActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

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

<<<<<<< HEAD
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    loginMutation: mockLoginMutation,
    user: null
  })
=======
const mockLoginMutation = {
  mutateAsync: vi.fn(),
  isPending: false
};
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ loginMutation: mockLoginMutation })
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
}));

describe('MerchantLogin', () => {
  const queryClient = new QueryClient();

  beforeEach(() => {
    vi.clearAllMocks();
<<<<<<< HEAD
    localStorage.clear();
  });

  it('shows validation errors for empty fields', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MerchantLogin />
      </QueryClientProvider>
    );

    const loginButton = screen.getByText(/login/i);
=======
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
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(screen.getByText('Username is required')).toBeInTheDocument();
      expect(screen.getByText('Password is required')).toBeInTheDocument();
    });
  });

<<<<<<< HEAD
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
=======
  it('handles successful login', async () => {
    mockLoginMutation.mutateAsync.mockResolvedValueOnce({ 
      role: 'merchant',
      id: 1 
    });

    renderComponent();

    fireEvent.change(screen.getByLabelText(/username/i), {
      target: { value: 'testmerchant' }
    });
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' }
    });

<<<<<<< HEAD
    const loginButton = screen.getByText(/login/i);
=======
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
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(mockLoginMutation.mutateAsync).toHaveBeenCalledWith({
        username: 'test@merchant.com',
        password: 'password123',
        loginType: 'merchant'
      });

      expect(mockToast).toHaveBeenCalledWith({
<<<<<<< HEAD
        title: 'Success',
        description: 'Successfully logged in'
=======
        title: 'Login failed',
        description: 'Invalid credentials',
        variant: 'destructive'
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
      });

      expect(mockNavigate).toHaveBeenCalledWith('/merchant/dashboard');
      expect(localStorage.getItem('token')).toBe('test-token');
    });
  });

<<<<<<< HEAD
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
=======
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
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
