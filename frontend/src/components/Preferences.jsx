import { LANGUAGES, useT } from '../i18n';
import { useTheme } from '../theme/ThemeContext';
import Icon from './Icon';

// Language picker and light/dark switch. One compact control used in the public header, the dashboard header and the auth pages.
export default function Preferences({ className = '' }) {
  const { lang, setLang, t } = useT();
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <label className="relative flex items-center">
        <span className="sr-only">{t('Language')}</span>
        <Icon name="globe" className="pointer-events-none absolute left-2 h-4 w-4 text-ink-600" />
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="h-9 rounded-lg border border-ink-200 bg-transparent py-0 pl-8 pr-2 text-sm font-medium text-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={toggleTheme}
        aria-pressed={dark}
        aria-label={dark ? t('Switch to light mode') : t('Switch to dark mode')}
        title={dark ? t('Light mode') : t('Dark mode')}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ink-200 text-ink-800 hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
      >
        <Icon name={dark ? 'sun' : 'moon'} className="h-4 w-4" />
      </button>
    </div>
  );
}
