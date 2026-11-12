import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, translate, useT } from './index';
import { ThemeProvider } from '../theme/ThemeContext';
import Preferences from '../components/Preferences';
import fr from './fr';
import rw from './rw';

function Probe() {
  const { t } = useT();
  return <p>{t('Sign in')}</p>;
}

describe('translate', () => {
  it('returns French and Kinyarwanda text, and falls back to English when a key is missing', () => {
    expect(translate('fr', 'Sign in')).toBe('Se connecter');
    expect(translate('rw', 'Sign in')).toBe('Injira');
    expect(translate('fr', 'A sentence nobody translated')).toBe('A sentence nobody translated');
  });

  it('fills {placeholders}', () => {
    expect(translate('fr', 'Page {page} of {total}', { page: 2, total: 5 })).toBe('Page 2 sur 5');
    expect(translate('en', 'Page {page} of {total}', { page: 2, total: 5 })).toBe('Page 2 of 5');
  });

  it('keeps the same placeholders in every language', () => {
    const holes = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    for (const dict of [fr, rw]) for (const [en, text] of Object.entries(dict)) expect(holes(text), en).toBe(holes(en));
  });

  it('has the same keys in French and Kinyarwanda', () => {
    expect(Object.keys(rw)).toEqual(Object.keys(fr));
  });
});

describe('Preferences', () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.className = ''; document.documentElement.lang = 'en'; });

  const setup = () => render(<ThemeProvider><I18nProvider><Preferences /><Probe /></I18nProvider></ThemeProvider>);

  it('switches the language, remembers it and updates <html lang>', async () => {
    setup();
    expect(screen.getByText('Sign in')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Language'), 'fr');
    expect(screen.getByText('Se connecter')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fr');
    expect(localStorage.getItem('imbehe.lang')).toBe('fr');
  });

  it('toggles dark mode on <html> and remembers it', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('imbehe.theme')).toBe('dark');
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
