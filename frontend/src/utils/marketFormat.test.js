import { describe, expect, it } from 'vitest';
import { marketPriceLabel } from './format';

describe('marketPriceLabel', () => {
  it('formats a fixed price, a range and negotiable prices', () => {
    expect(marketPriceLabel({ priceType: 'fixed', priceMin: 25000 })).toBe('25,000 RWF');
    expect(marketPriceLabel({ priceType: 'range', priceMin: 500, priceMax: 1500 })).toBe('500 – 1,500 RWF');
    expect(marketPriceLabel({ priceType: 'negotiable', priceMin: 8000 })).toBe('Negotiable, from 8,000 RWF');
    expect(marketPriceLabel({ priceType: 'negotiable' })).toBe('Price negotiable');
  });
});
