import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Button, { ButtonLink } from '../../components/ui/Button';
import { SelectField, TextField } from '../../components/ui/Field';
import { PageLoader } from '../../components/ui/Spinner';
import { EmptyState, ErrorState } from '../../components/ui/feedback';
import MarketCard from '../../features/market/MarketCard';
import { useCategories } from '../../hooks/useCategories';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useT } from '../../i18n';
import { marketApi } from '../../services/marketApi';
import { DISTRICTS } from '../../utils/constants';

const EMPTY = { q: '', kind: '', category: '', district: '', minPrice: '', maxPrice: '', inStock: false, sort: 'newest', d: {} };

/** One filter for one of the chosen category's own fields. A number field gets a lowest and a highest value. */
function DetailFilter({ field: f, d, onChange }) {
  const { t } = useT();
  if (f.type === 'number') {
    return (
      <>
        <TextField label={`${f.label}: ${t('from')}`} inputMode="decimal" value={d[`${f.key}_min`] ?? ''} onChange={(e) => onChange(`${f.key}_min`, e.target.value)} />
        <TextField label={`${f.label}: ${t('to')}`} inputMode="decimal" value={d[`${f.key}_max`] ?? ''} onChange={(e) => onChange(`${f.key}_max`, e.target.value)} />
      </>
    );
  }
  if (f.type === 'select' || f.type === 'yes_no') {
    const options = f.type === 'select' ? f.options.map((o) => ({ value: o, label: o })) : [{ value: 'true', label: t('Yes') }, { value: 'false', label: t('No') }];
    return <SelectField label={f.label} value={d[f.key] ?? ''} onChange={(e) => onChange(f.key, e.target.value)} placeholder={t('Any')} options={options} />;
  }
  return <TextField label={f.label} value={d[f.key] ?? ''} onChange={(e) => onChange(f.key, e.target.value)} />;
}

export default function MarketPage() {
  useDocumentTitle('Marketplace');
  const { t } = useT();
  const navigate = useNavigate();
  const { categories } = useCategories();
  const [form, setForm] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [picked, setPicked] = useState([]);
  const [state, setState] = useState({ items: [], page: 1, hasMore: false, loading: true, error: null });

  const query = useCallback((page) => ({
    page, limit: 12, sort: applied.sort,
    ...(applied.q.trim().length >= 2 ? { q: applied.q.trim() } : {}),
    ...(applied.kind ? { kind: applied.kind } : {}),
    ...(applied.category ? { category: applied.category } : {}),
    ...(applied.district ? { district: applied.district } : {}),
    ...(/^\d+$/.test(applied.minPrice) ? { minPrice: applied.minPrice } : {}),
    ...(/^\d+$/.test(applied.maxPrice) ? { maxPrice: applied.maxPrice } : {}),
    ...(applied.inStock ? { inStock: 'true' } : {}),
    // The category's own fields, sent as d[size]=M. Empty answers are left out.
    ...Object.fromEntries(Object.entries(applied.d).filter(([, v]) => v !== '').map(([k, v]) => [`d[${k}]`, v])),
  }), [applied]);

  const load = useCallback(async (page, replace) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await marketApi.browse(query(page));
      setState((s) => ({ items: replace ? res.data : [...s.items, ...res.data], page, hasMore: Boolean(res.meta && res.meta.page < res.meta.totalPages), loading: false, error: null }));
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error }));
    }
  }, [query]);
  useEffect(() => { load(1, true); }, [load]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const shown = categories.filter((c) => (c.kind || 'service') !== 'service' && (!form.kind || c.kind === form.kind));
  const fields = categories.find((c) => c.id === form.category)?.requiredFields ?? [];
  const setDetail = (key, value) => setForm((f) => ({ ...f, d: { ...f.d, [key]: value } }));
  const toggle = (id, on) => setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));

  return (
    <>
      <PageHeader title={t('Marketplace')} description={t('Products, shops and businesses. Compare offers and ask for a quotation.')}
        actions={<><ButtonLink to="/dashboard/market/saved" variant="outline">{t('Saved')}</ButtonLink><ButtonLink to="/dashboard/market/mine" variant="outline">{t('My listings')}</ButtonLink><ButtonLink to="/dashboard/market/new">{t('New listing')}</ButtonLink></>} />
      <form role="search" onSubmit={(e) => { e.preventDefault(); setApplied(form); }} className="panel mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <TextField label={t('Search')} value={form.q} onChange={set('q')} placeholder={t('What are you looking for?')} />
        <SelectField label={t('Type')} value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value, category: '' }))} placeholder={t('Products and businesses')} options={[{ value: 'product', label: t('Products') }, { value: 'business', label: t('Businesses') }]} />
        <SelectField label={t('Category')} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value, d: {} }))} placeholder={t('All categories')} options={shown.map((c) => ({ value: c.id, label: c.name }))} />
        <SelectField label={t('District')} value={form.district} onChange={set('district')} placeholder={t('Anywhere in Rwanda')} options={DISTRICTS} />
        <TextField label={t('Lowest price (RWF)')} inputMode="numeric" value={form.minPrice} onChange={set('minPrice')} />
        <TextField label={t('Highest price (RWF)')} inputMode="numeric" value={form.maxPrice} onChange={set('maxPrice')} />
        <SelectField label={t('Sort by')} value={form.sort} onChange={set('sort')} options={[{ value: 'newest', label: t('Newest') }, { value: 'price_asc', label: t('Price: low to high') }, { value: 'price_desc', label: t('Price: high to low') }]} />
        {fields.map((f) => <DetailFilter key={f.key} field={f} d={form.d} onChange={setDetail} />)}
        <div className="flex items-end justify-between gap-3">
          <label className="flex items-center gap-2 pb-2 text-sm font-medium"><input type="checkbox" checked={form.inStock} onChange={(e) => setForm((f) => ({ ...f, inStock: e.target.checked }))} className="h-4 w-4 accent-teal-600" />{t('In stock only')}</label>
          <Button type="submit">{t('Search')}</Button>
        </div>
      </form>

      {picked.length > 0 && (
        <div role="status" className="sticky top-2 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm">
          <span>{t('{count} selected to compare', { count: picked.length })}</span>
          <span className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPicked([])}>{t('Clear')}</Button>
            <Button size="sm" disabled={picked.length < 2} onClick={() => navigate(`/dashboard/market/compare?ids=${picked.join(',')}`)}>{t('Compare')}</Button>
          </span>
        </div>
      )}

      {state.error && <ErrorState error={state.error} onRetry={() => load(1, true)} />}
      {state.loading && state.items.length === 0 && <PageLoader label={t('Loading listings')} />}
      {!state.loading && !state.error && state.items.length === 0 && <EmptyState title={t('No listings found')} description={t('Try other words, or a wider price range or area.')} />}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {state.items.map((l) => <MarketCard key={l.id} listing={l} compare={{ checked: picked.includes(l.id), disabled: picked.length >= 4, onChange: (on) => toggle(l.id, on) }} />)}
      </ul>
      {state.hasMore && <div className="mt-6 text-center"><Button variant="outline" loading={state.loading} onClick={() => load(state.page + 1, false)}>{t('Load more')}</Button></div>}
    </>
  );
}
