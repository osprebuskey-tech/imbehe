import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AdvertsStrip from './AdvertsStrip';
import { advertApi } from '../services/advertApi';

vi.mock('../services/advertApi', () => ({ advertApi: { list: vi.fn() } }));

describe('AdvertsStrip', () => {
  it('shows each advert with its title, an Advert label and a safe external link', async () => {
    advertApi.list.mockResolvedValue({ data: [{ id: 'a1', title: 'Back to school', text: '20% off', imageUrl: 'http://x/a.png', linkUrl: 'https://example.com/offer' }, { id: 'a2', title: 'No link advert', imageUrl: 'http://x/b.png' }], meta: null });
    render(<AdvertsStrip />);
    const link = await screen.findByRole('link', { name: /Back to school/ });
    expect(link).toHaveAttribute('href', 'https://example.com/offer');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByText('No link advert')).toBeInTheDocument();
    expect(screen.getAllByText('Advert')).toHaveLength(2);
  });

  it('renders nothing when there are no adverts', async () => {
    advertApi.list.mockResolvedValue({ data: [], meta: null });
    const { container } = render(<AdvertsStrip />);
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
