import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import NotificationBell from './NotificationBell';
import { useUnreadCounts } from '../hooks/useUnreadCount';

vi.mock('../hooks/useUnreadCount', () => ({ useUnreadCounts: vi.fn() }));

const renderBell = () => render(<MemoryRouter><NotificationBell /></MemoryRouter>);

describe('NotificationBell', () => {
  it('shows messages, quotations and other notifications as three separate links with their own counts', () => {
    useUnreadCounts.mockReturnValue({ total: 8, message: 5, quotation: 2, general: 1 });
    renderBell();
    expect(screen.getByRole('link', { name: 'Messages, 5 unread' })).toHaveAttribute('href', '/dashboard/messages');
    expect(screen.getByRole('link', { name: 'Quotations, 2 unread' })).toHaveAttribute('href', '/dashboard/notifications?tab=quotations');
    expect(screen.getByRole('link', { name: 'Notifications, 1 unread' })).toHaveAttribute('href', '/dashboard/notifications?tab=other');
  });

  it('shows no badge for a kind with nothing unread', () => {
    useUnreadCounts.mockReturnValue({ total: 2, message: 0, quotation: 2, general: 0 });
    renderBell();
    expect(screen.getByRole('link', { name: 'Messages' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quotations, 2 unread' })).toBeInTheDocument();
  });
});
