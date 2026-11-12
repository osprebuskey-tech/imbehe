import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from './ui/Button';
import { DISTRICTS } from '../utils/constants';
import { useT } from '../i18n';

/** The marketplace search box: keyword + district. Sends people to /search with the filters in the URL. */
export default function SearchBar({ initialQ = '', initialDistrict = '', type = 'services' }) {
  const { t } = useT();
  const navigate = useNavigate();
  const [q, setQ] = useState(initialQ);
  const [district, setDistrict] = useState(initialDistrict);
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const term = q.trim();
    if (term.length === 1) { setError(t('Type at least 2 characters, or leave it empty to browse everything.')); return; }
    setError('');
    const params = new URLSearchParams();
    if (type !== 'services') params.set('type', type);
    if (term) params.set('q', term);
    if (district) params.set('district', district);
    navigate(`/search${params.toString() ? `?${params}` : ''}`);
  };

  return (
    <form onSubmit={submit} role="search" className="w-full text-ink-900">
      <div className="flex flex-col gap-2 rounded-xl bg-white p-2 shadow-lg sm:flex-row">
        <div className="flex-1">
          <label htmlFor="search-q" className="sr-only">{t('What do you need done?')}</label>
          <input id="search-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('What do you need done? e.g. laptop repair, logo, wiring')} className="input border-transparent" aria-describedby={error ? 'search-q-error' : undefined} aria-invalid={error ? 'true' : undefined} />
        </div>
      
        <Button type="submit" size="lg">{t('Search')}</Button>
      </div>
      {error && <p id="search-q-error" role="alert" className="mt-2 rounded bg-white/95 px-3 py-1.5 text-sm font-medium text-rose-700">{error}</p>}
    </form>
  );
}
