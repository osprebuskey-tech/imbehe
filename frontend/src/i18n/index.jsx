import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import fr from './fr';
import rw from './rw';

// English text is the key: t('Sign in') returns 'Se connecter' in French. A missing entry falls back to the English text itself,
// so an untranslated string is never blank. {name} placeholders are filled from the second argument: t('Hello, {name}.', { name }).
export const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'fr', label: 'Français', short: 'FR' },
  { code: 'rw', label: 'Kinyarwanda', short: 'RW' },
];
const DICTIONARIES = { en: {}, fr, rw };
const KEY = 'imbehe.lang';

export const translate = (lang, text, vars) => {
  const raw = DICTIONARIES[lang]?.[text] ?? text;
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k]))) : raw;
};

const read = () => {
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGUAGES.some((l) => l.code === saved)) return saved;
  } catch { /* ignore */ }
  const nav = typeof navigator !== 'undefined' ? (navigator.language || '').slice(0, 2) : 'en';
  return LANGUAGES.some((l) => l.code === nav) ? nav : 'en';
};

const I18nContext = createContext({ lang: 'en', setLang: () => {}, t: (text, vars) => translate('en', text, vars) });

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(read);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((next) => {
    setLangState(next);
    try { localStorage.setItem(KEY, next); } catch { /* not persisted, still applied */ }
  }, []);
  const t = useCallback((text, vars) => translate(lang, text, vars), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useT = () => useContext(I18nContext);

/** Translates a value only when it is plain text, so shared components can accept text or markup for the same prop. */
export function useTr() {
  const { t } = useT();
  return (value) => (typeof value === 'string' ? t(value) : value);
}
