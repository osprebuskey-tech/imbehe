import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ShowcasePanel from './ShowcasePanel';
import { showcaseApi } from '../services/showcaseApi';

vi.mock('../services/showcaseApi', () => ({ showcaseApi: { list: vi.fn() } }));

const posts = [
  { id: 'p1', caption: 'Our new shop is open', media: [{ url: 'http://x/a.png', kind: 'image' }], author: { id: 'u1', fullName: 'Kigali Bakery', verified: true } },
  { id: 'p2', caption: 'Quick demo', media: [{ url: 'http://x/b.mp4', kind: 'video' }], author: { id: 'u2', fullName: 'Aline Uwase', verified: true } },
];
const renderIt = () => render(<MemoryRouter><ShowcasePanel /></MemoryRouter>);

describe('ShowcasePanel', () => {
  it('shows a verified person’s picture with their name, and moves through the posts', async () => {
    showcaseApi.list.mockResolvedValue({ data: posts, meta: null });
    renderIt();
    expect(await screen.findByAltText('Our new shop is open')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Kigali Bakery/ })).toHaveAttribute('href', '/dashboard/people/u1');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('Quick demo').tagName).toBe('VIDEO');
    expect(screen.getByRole('link', { name: /Aline Uwase/ })).toBeInTheDocument();
  });

  it('renders nothing when there are no posts', async () => {
    showcaseApi.list.mockResolvedValue({ data: [], meta: null });
    const { container } = renderIt();
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
