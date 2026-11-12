import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import DiscoverPage from './DiscoverPage';
import { discoverApi } from '../services/discoverApi';

vi.mock('../services/discoverApi', () => ({ discoverApi: { all: vi.fn() } }));

const base = {
  trendingListings: [{ id: 'l1', name: 'Fresh avocados', kind: 'product', priceType: 'fixed', priceMin: 5000, district: 'Musanze' }],
  popularBusinesses: [{ id: 'b1', fullName: 'Kigali Bakery', verified: true, followers: 12 }],
  topProviders: [{ id: 'p1', displayName: 'Aline Uwase', ratingAvg: 4.9, ratingCount: 12 }],
  recentRequests: [],
};
const renderIt = () => render(<MemoryRouter><DiscoverPage /></MemoryRouter>);

describe('DiscoverPage', () => {
  it('shows trending products, popular businesses and top-rated providers with links', async () => {
    discoverApi.all.mockResolvedValue({ data: base });
    renderIt();
    expect(await screen.findByRole('link', { name: /Fresh avocados/ })).toHaveAttribute('href', '/dashboard/market/l1');
    expect(screen.getByRole('link', { name: /Kigali Bakery/ })).toHaveAttribute('href', '/dashboard/people/b1');
    expect(screen.getByRole('link', { name: 'Aline Uwase' })).toHaveAttribute('href', '/providers/p1');
    expect(screen.queryByText('Recent requests for you')).not.toBeInTheDocument();
  });

  it('adds recent requests when the server sends some (verified providers)', async () => {
    discoverApi.all.mockResolvedValue({ data: { ...base, recentRequests: [{ id: 'r1', title: 'Fix my network', category: { name: 'Tech' }, location: { district: 'Gasabo' }, budgetNegotiable: true }] } });
    renderIt();
    expect(await screen.findByRole('link', { name: 'Fix my network' })).toHaveAttribute('href', '/dashboard/requests/r1');
  });

  it('says so when nothing is trending yet', async () => {
    discoverApi.all.mockResolvedValue({ data: { ...base, trendingListings: [] } });
    renderIt();
    expect(await screen.findByText('Nothing is trending yet.')).toBeInTheDocument();
  });
});
