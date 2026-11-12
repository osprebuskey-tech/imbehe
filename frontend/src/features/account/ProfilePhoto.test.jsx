import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfilePhoto from './ProfilePhoto';
import { ToastProvider } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/authApi';

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../services/authApi', () => ({ authApi: { uploadAvatar: vi.fn(), removeAvatar: vi.fn() } }));

const setCurrentUser = vi.fn();
const renderIt = (user) => {
  useAuth.mockReturnValue({ user, setCurrentUser });
  return render(<ToastProvider><ProfilePhoto /></ToastProvider>);
};

beforeEach(() => vi.clearAllMocks());

describe('ProfilePhoto', () => {
  it('lets anyone add a photo and updates the signed-in user', async () => {
    authApi.uploadAvatar.mockResolvedValue({ data: { user: { id: 'u1', fullName: 'Aline', avatarUrl: 'http://x/a.png' } } });
    const { container } = renderIt({ id: 'u1', fullName: 'Aline', roles: ['customer'] });
    expect(screen.getByText('Add a photo')).toBeInTheDocument();
    await userEvent.upload(container.querySelector('input[type=file]'), new File(['x'], 'me.png', { type: 'image/png' }));
    await waitFor(() => expect(setCurrentUser).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: 'http://x/a.png' })));
  });

  it('refuses a file that is not a photo', async () => {
    const { container } = renderIt({ id: 'u1', fullName: 'Aline', roles: ['customer'] });
    await userEvent.upload(container.querySelector('input[type=file]'), new File(['x'], 'doc.pdf', { type: 'application/pdf' }), { applyAccept: false });
    expect(await screen.findByRole('alert')).toHaveTextContent(/JPEG, PNG or WebP/);
    expect(authApi.uploadAvatar).not.toHaveBeenCalled();
  });

  it('can change and remove an existing photo', async () => {
    authApi.removeAvatar.mockResolvedValue({ data: { user: { id: 'u1', fullName: 'Aline' } } });
    renderIt({ id: 'u1', fullName: 'Aline', roles: ['customer'], avatarUrl: 'http://x/a.png' });
    expect(screen.getByText('Change photo')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    await waitFor(() => expect(setCurrentUser).toHaveBeenCalledWith({ id: 'u1', fullName: 'Aline' }));
  });
});
