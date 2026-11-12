import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './LoginPage';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../services/api';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../components/AnnouncementBar', () => ({ default: () => null }));

const login = vi.fn();
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<p>home page</p>} />
        <Route path="/dashboard" element={<p>dashboard page</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ login, notice: null, clearNotice: vi.fn(), user: null });
  });

  it('asks for both fields before calling the API', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByText('Enter your email address or phone number')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('logs in and lands on the dashboard, staying signed in by default', async () => {
    login.mockResolvedValue({ id: 'u1' });
    renderPage();
    await userEvent.type(screen.getByLabelText(/email or phone/i), 'customer@imbehe.test');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'ChangeMe123!');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(login).toHaveBeenCalledWith({ email: 'customer@imbehe.test', password: 'ChangeMe123!', remember: true });
    expect(await screen.findByText('dashboard page')).toBeInTheDocument();
  });

  it('can be told not to keep the session', async () => {
    login.mockResolvedValue({ id: 'u1' });
    renderPage();
    await userEvent.type(screen.getByLabelText(/email or phone/i), 'customer@imbehe.test');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'ChangeMe123!');
    await userEvent.click(screen.getByLabelText(/keep me signed in/i));
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(login).toHaveBeenCalledWith({ email: 'customer@imbehe.test', password: 'ChangeMe123!', remember: false });
  });

  it('signs in with a phone number', async () => {
    login.mockResolvedValue({ id: 'u1' });
    renderPage();
    await userEvent.type(screen.getByLabelText(/email or phone/i), '0788 123 456');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'ChangeMe123!');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(login).toHaveBeenCalledWith({ phone: '0788123456', password: 'ChangeMe123!', remember: true });
  });

  it('refuses something that is neither an email nor a phone number', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/email or phone/i), 'not-a-login');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'ChangeMe123!');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByText('Enter a valid email address or Rwandan mobile number')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('can show and hide the password', async () => {
    renderPage();
    const box = screen.getByLabelText(/^password$/i);
    expect(box).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(box).toHaveAttribute('type', 'text');
  });

  it('shows the API error when the credentials are wrong', async () => {
    login.mockRejectedValue(new ApiError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }));
    renderPage();
    await userEvent.type(screen.getByLabelText(/email or phone/i), 'x@y.rw');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'wrong-pass1');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });
});
