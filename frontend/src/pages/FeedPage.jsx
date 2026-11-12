import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import { PageLoader } from '../components/ui/Spinner';
import { EmptyState, ErrorState } from '../components/ui/feedback';
import PostCard from '../features/social/PostCard';
import PostComposer from '../features/social/PostComposer';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useT } from '../i18n';
import { postApi } from '../services/postApi';
import { SelectField } from '../components/ui/Field';
import { useCategories } from '../hooks/useCategories';
import { DISTRICTS } from '../utils/constants';

const TABS = [
  { id: 'feed', label: 'For you' },
  { id: 'recent', label: 'Newest' },
  { id: 'trending', label: 'Trending' },
  { id: 'saved', label: 'Saved' },
];

export default function FeedPage() {
  useDocumentTitle('Feed');
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const hashtag = params.get('hashtag') || undefined;
  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const district = params.get('district') || '';
  const { categories } = useCategories();
  const setFilter = (key, value) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next); };
  const [tab, setTab] = useState('feed');
  const [state, setState] = useState({ items: [], page: 1, hasMore: false, loading: true, error: null });

  const fetchPage = useCallback((page) => {
    const query = { page, limit: 10, ...(hashtag ? { hashtag } : {}), ...(q ? { q } : {}), ...(category ? { category } : {}), ...(district ? { district } : {}) };
    if (tab === 'feed' && !hashtag && !q && !category && !district) return postApi.feed(query);
    if (tab === 'saved') return postApi.saved(query);
    return postApi.discover({ ...query, sort: tab === 'trending' ? 'trending' : 'recent' });
  }, [tab, hashtag, q, category, district]);

  const load = useCallback(async (page, replace) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetchPage(page);
      const items = res.data ?? [];
      setState((s) => ({ items: replace ? items : [...s.items, ...items], page, hasMore: Boolean(res.meta && res.meta.page < res.meta.totalPages), loading: false, error: null }));
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error }));
    }
  }, [fetchPage]);

  useEffect(() => { load(1, true); }, [load]);

  const prepend = (data) => { const post = data.post ?? data; if (post?.id) setState((s) => ({ ...s, items: [post, ...s.items] })); };
  const removed = (id) => setState((s) => ({ ...s, items: s.items.filter((p) => p.id !== id) }));

  return (
    <>
      <PageHeader title={t('Feed')} description={t('Posts from the businesses, providers and people you follow, and what is new on Imbehe.')} />
      <div className="mx-auto max-w-2xl space-y-4">
        <PostComposer onPosted={prepend} />
        <form role="search" onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get('q').toString().trim(); const next = new URLSearchParams(params); if (v) next.set('q', v); else next.delete('q'); setParams(next); }} className="flex gap-2">
          <label htmlFor="feed-search" className="sr-only">{t('Search posts')}</label>
          <input id="feed-search" name="q" defaultValue={q} placeholder={t('Search posts or #hashtags')} className="input" />
          <Button type="submit" variant="outline">{t('Search')}</Button>
        </form>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Category" value={category} onChange={(e) => setFilter('category', e.target.value)} placeholder="All categories" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
          <SelectField label="Location" value={district} onChange={(e) => setFilter('district', e.target.value)} placeholder="Anywhere in Rwanda" options={DISTRICTS} />
        </div>
        {hashtag && <p className="text-sm text-ink-700">#{hashtag} · <button type="button" className="font-semibold text-teal-700 underline" onClick={() => setParams({})}>{t('Clear')}</button></p>}
        <div role="tablist" aria-label={t('Feed')} className="flex gap-1 overflow-x-auto border-b border-ink-100">
          {TABS.map((x) => (
            <button key={x.id} role="tab" type="button" aria-selected={tab === x.id} onClick={() => setTab(x.id)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${tab === x.id ? 'border-teal-600 text-teal-800' : 'border-transparent text-ink-700 hover:text-ink-950'}`}>{t(x.label)}</button>
          ))}
        </div>
        {state.error && <ErrorState error={state.error} onRetry={() => load(1, true)} />}
        {state.loading && state.items.length === 0 && <PageLoader label={t('Loading posts')} />}
        {!state.loading && !state.error && state.items.length === 0 && (
          <EmptyState title={tab === 'feed' ? t('Your feed is empty') : t('Nothing here yet')} description={tab === 'feed' ? t('Follow businesses and providers, or look at Newest to find someone to follow.') : t('Posts will show up here.')} action={tab === 'feed' ? <Button variant="outline" onClick={() => setTab('recent')}>{t('See newest posts')}</Button> : undefined} />
        )}
        <div className="space-y-4">{state.items.map((p) => <PostCard key={p.id} post={p} onRemoved={removed} />)}</div>
        {state.hasMore && <div className="text-center"><Button variant="outline" loading={state.loading} onClick={() => load(state.page + 1, false)}>{t('Load more')}</Button></div>}
      </div>
    </>
  );
}
