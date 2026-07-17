import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Login from './Login';
import * as AuthContext from '../context/AuthContext';

// Mock the AuthContext
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('Login Component', () => {
  it('renders login form correctly', () => {
    // Setup mock return value
    AuthContext.useAuth.mockReturnValue({
      login: vi.fn(),
      register: vi.fn(),
      loginWithGoogle: vi.fn(),
    });

    render(<Login />);

    expect(screen.getByText('Euler Master ERP')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('nicolas o email@euler.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Iniciar Sesión/i })).toBeInTheDocument();
  });

  it('switches to register mode when clicking "Crea una cuenta base"', () => {
    AuthContext.useAuth.mockReturnValue({
      login: vi.fn(),
      register: vi.fn(),
      loginWithGoogle: vi.fn(),
    });

    render(<Login />);
    
    const registerButton = screen.getByText('Crea una cuenta base');
    fireEvent.click(registerButton);

    expect(screen.getByRole('button', { name: /Registrarse/i })).toBeInTheDocument();
  });
});
