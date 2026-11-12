import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PostCard from './PostCard';
import { postApi } from '../../services/postApi';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-me', fullName: 'Me' } }) }));
vi.mock('../../services/postApi', () => ({
  postApi: { like: vi.fn(), unlike: vi.fn(), save: vi.fn(), unsave: vi.fn(), follow: vi.fn(), unfollow: vi.fn(), share: vi.fn(), comments: vi.fn(), addComment: vi.fn(), removeComment: vi.fn(), remove: vi.fn() },
}));

const post = {
  id: 'p1', caption: 'Fresh bread today #bakery', hashtags: ['bakery'], media: [], createdAt: '2026-11-01T10:00:00Z',
  likeCount: 2, commentCount: 0, saveCount: 0, shareCount: 0, likedByMe: false, savedByMe: false, followingAuthor: false, mine: false,
  author: { id: 'u-other', fullName: 'Kigali Bakery', type: 'business' },
};
const setup = (over = {}) => render(<MemoryRouter><PostCard post={{ ...post, ...over }} /></MemoryRouter>);

describe('PostCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the author, text and hashtag link', () => {
    setup();
    expect(screen.getByText('Kigali Bakery')).toBeInTheDocument();
    expect(screen.getByText('Fresh bread today #bakery')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '#bakery' })).toHaveAttribute('href', '/dashboard/feed?hashtag=bakery');
  });

  it('likes at once and calls the API', async () => {
    postApi.like.mockResolvedValue({});
    setup();
    await userEvent.click(screen.getByRole('button', { name: /like/i }));
    expect(screen.getByRole('button', { name: /like/i })).toHaveAttribute('aria-pressed', 'true');
    expect(postApi.like).toHaveBeenCalledWith('p1');
    expect(screen.getByRole('button', { name: /like/i })).toHaveTextContent('3');
  });

  it('puts the like back when the server refuses', async () => {
    postApi.like.mockRejectedValue(new Error('nope'));
    setup();
    await userEvent.click(screen.getByRole('button', { name: /like/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /like/i })).toHaveAttribute('aria-pressed', 'false'));
    expect(screen.getByRole('button', { name: /like/i })).toHaveTextContent('2');
  });

  it('follows the author, but not on your own post', async () => {
    postApi.follow.mockResolvedValue({});
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Follow' }));
    expect(postApi.follow).toHaveBeenCalledWith('u-other');
    expect(screen.getByRole('button', { name: 'Following' })).toBeInTheDocument();
  });

  it('hides Follow and offers Delete on your own post', () => {
    setup({ mine: true, author: { id: 'u-me', fullName: 'Me', type: 'customer' } });
    expect(screen.queryByRole('button', { name: 'Follow' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('offers to view a promoted listing and to ask for a quotation on it', () => {
    setup({ listing: { id: 'l1', name: 'Fresh avocados', kind: 'product' } });
    expect(screen.getByText('Fresh avocados')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View product' })).toHaveAttribute('href', '/dashboard/market/l1');
    expect(screen.getByRole('link', { name: 'Request a quotation' })).toHaveAttribute('href', '/dashboard/requests/new?listing=l1');
  });

  it('asks for a quotation from the post itself when no listing is attached', () => {
    setup();
    expect(screen.getByRole('link', { name: 'Request a quotation' })).toHaveAttribute('href', '/dashboard/requests/new?post=p1');
  });
});
