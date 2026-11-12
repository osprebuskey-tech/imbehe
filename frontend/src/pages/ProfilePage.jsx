import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Avatar from '../components/ui/Avatar';
import Button, { ButtonLink } from '../components/ui/Button';
import Rating from '../components/ui/Rating';
import VerifiedBadge from '../components/ui/VerifiedBadge';
import { PageLoader } from '../components/ui/Spinner';
import { EmptyState, ErrorState } from '../components/ui/feedback';
import { useAuth } from '../context/AuthContext';
import MarketCard from '../features/market/MarketCard';
import ReportButton from '../features/moderation/ReportButton';
import MessageButton from '../features/messages/MessageButton';
import PostCard from '../features/social/PostCard';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useT } from '../i18n';
import { marketApi } from '../services/marketApi';
import { postApi } from '../services/postApi';
import { profileApi } from '../services/profileApi';
import { errorMessage } from '../utils/errors';
import { formatDate } from '../utils/format';

const TYPE_LABEL = { business: 'Business', provider: 'Provider', customer: 'Member' };

/** A paged list of someone's posts or listings. */
function Items({ fetchPage, render, empty }) {
  const { t } = useT();
  const [state, setState] = useState({ items: [], page: 1, hasMore: false, loading: true, error: null });
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

  if (state.error) return <ErrorState error={state.error} onRetry={() => load(1, true)} />;
  if (state.loading && !state.items.length) return <PageLoader />;
  if (!state.items.length) return <EmptyState title={empty} />;
  return (
    <>
      {state.items.map(render)}
      {state.hasMore && <div className="text-center"><Button variant="outline" loading={state.loading} onClick={() => load(state.page + 1, false)}>{t('Load more')}</Button></div>}
    </>
  );
}

function About({ p }) {
  const { t } = useT();
  const pr = p.provider;
  const b = p.business;
  if (!pr && !b) return <EmptyState title={t('This member has not added details yet.')} />;
  return (
    <div className="space-y-6">
      {b && (
        <section className="panel space-y-2 p-5">
          <h2 className="text-lg font-semibold">{b.companyName}</h2>
          {b.industry && <p className="text-sm text-ink-700">{b.industry}</p>}
          {b.description && <p className="whitespace-pre-line text-ink-800">{b.description}</p>}
          {(b.district || b.sector) && <p className="text-sm text-ink-700">{[b.sector, b.district].filter(Boolean).join(', ')}</p>}
          {b.website && /^https?:\/\//i.test(b.website) && <a href={b.website} target="_blank" rel="noreferrer noopener" className="text-sm font-semibold text-teal-800 underline">{b.website}</a>}
        </section>
      )}
      {pr && (
        <section className="panel space-y-3 p-5">
          {pr.bio && <p className="whitespace-pre-line text-ink-800">{pr.bio}</p>}
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {pr.categories.length > 0 && <div><dt className="text-ink-600">{t('Services')}</dt><dd className="font-medium">{pr.categories.map((c) => c.name).join(', ')}</dd></div>}
            {pr.experienceYears != null && <div><dt className="text-ink-600">{t('Experience')}</dt><dd className="font-medium">{t('{count} years', { count: pr.experienceYears })}</dd></div>}
            {pr.location?.district && <div><dt className="text-ink-600">{t('Based in')}</dt><dd className="font-medium">{[pr.location.sector, pr.location.district].filter(Boolean).join(', ')}</dd></div>}
            <div><dt className="text-ink-600">{t('Completed jobs')}</dt><dd className="font-medium">{pr.completedJobs}</dd></div>
          </dl>
          {pr.skills.length > 0 && <ul className="flex flex-wrap gap-2">{pr.skills.map((s) => <li key={s} className="rounded-full bg-ink-100 px-3 py-1 text-xs font-medium">{s}</li>)}</ul>}
          {pr.portfolio.length > 0 && (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {pr.portfolio.map((i) => <li key={i.id}><img src={i.imageUrl} alt={i.title} loading="lazy" className="aspect-square w-full rounded-lg object-cover" /><p className="mt-1 text-xs">{i.title}</p></li>)}
            </ul>
          )}
          <Link to={`/providers/${pr.id}`} className="text-sm font-semibold text-teal-800 underline">{t('Open the full provider page and reviews')}</Link>
        </section>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { t } = useT();
  const { id } = useParams();
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsync((signal) => profileApi.get(id, signal), [id]);
  const [tab, setTab] = useState('posts');
  const [following, setFollowing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [followError, setFollowError] = useState('');
  const p = data?.profile;
  useDocumentTitle(p?.fullName ?? 'Profile');

  const fetchPosts = useCallback((page) => postApi.discover({ author: id, page, limit: 10 }), [id]);
  const fetchListings = useCallback((page) => marketApi.browse({ owner: id, page, limit: 12 }), [id]);

  if (loading) return <PageLoader />;
  if (error?.status === 404) return <EmptyState title={t('This profile is not available.')} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const state = following ?? { followedByMe: p.followedByMe, followers: p.followers };
  const toggleFollow = async () => {
    setBusy(true);
    setFollowError('');
    try {
      const res = await (state.followedByMe ? postApi.unfollow(p.id) : postApi.follow(p.id));
      setFollowing({ followedByMe: res.data.followedByMe, followers: res.data.followers });
    } catch (err) {
      setFollowError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const tabs = [{ id: 'posts', label: `${t('Posts')} (${p.counts.posts})` }, { id: 'listings', label: `${t('Listings')} (${p.counts.listings})` }, { id: 'about', label: t('About') }];
  return (
    <div className="space-y-5">
      <header className="panel overflow-hidden">
        {p.coverUrl ? <img src={p.coverUrl} alt="" className="h-32 w-full object-cover sm:h-48" /> : <div aria-hidden="true" className="h-32 w-full bg-gradient-to-r from-teal-100 via-sage-200 to-sun-100 sm:h-48" />}
        <div className="flex flex-wrap items-center gap-4 p-5">
        <Avatar name={p.fullName} src={p.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">{p.business?.companyName || p.fullName} {p.verified && <VerifiedBadge />}</h1>
          <p className="text-sm text-ink-700">{t(TYPE_LABEL[p.type])} · {t('Member since {date}', { date: formatDate(p.memberSince) })}</p>
          {p.district && <p className="text-sm text-ink-700">{p.district}</p>}
          {p.bio && <p className="mt-1 max-w-prose whitespace-pre-line text-sm text-ink-800">{p.bio}</p>}
          {p.provider && <Rating value={p.provider.ratingAvg} count={p.provider.ratingCount} />}
          <p className="mt-1 text-sm"><strong>{state.followers}</strong> {t('followers')} · <strong>{p.following}</strong> {t('following')}</p>
        </div>
        {user && !p.isMe && (
          <div className="flex flex-wrap gap-2">
            <Button variant={state.followedByMe ? 'outline' : 'primary'} aria-pressed={state.followedByMe} loading={busy} onClick={toggleFollow}>{state.followedByMe ? t('Following') : t('Follow')}</Button>
            <MessageButton userId={p.id} />
            <ReportButton targetType="user" targetId={p.id} />
          </div>
        )}
        {p.isMe && <ButtonLink to={p.type === 'provider' ? '/dashboard/provider/profile' : '/dashboard/settings'} variant="outline">{t('Edit my profile')}</ButtonLink>}
        {!user && <ButtonLink to="/login">{t('Sign in to follow or message')}</ButtonLink>}
        {followError && <p role="alert" className="w-full text-sm text-rose-700">{followError}</p>}
        </div>
      </header>

      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-ink-100">
        {tabs.map((x) => <button key={x.id} role="tab" type="button" aria-selected={tab === x.id} onClick={() => setTab(x.id)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${tab === x.id ? 'border-teal-600 text-teal-800' : 'border-transparent text-ink-700 hover:text-ink-950'}`}>{x.label}</button>)}
      </div>

      {tab === 'posts' && <div className="space-y-4"><Items key="posts" fetchPage={fetchPosts} empty={t('No posts yet.')} render={(post) => <PostCard key={post.id} post={post} />} /></div>}
      {tab === 'listings' && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Items key="listings" fetchPage={fetchListings} empty={t('No listings yet.')} render={(l) => <MarketCard key={l.id} listing={l} />} /></div>}
      {tab === 'about' && <About p={p} />}
    </div>
  );
}
