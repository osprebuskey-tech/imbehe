import { Link } from 'react-router-dom';
import Avatar from '../components/ui/Avatar';
import Rating from '../components/ui/Rating';
import VerifiedBadge from '../components/ui/VerifiedBadge';
import PageHeader from '../components/ui/PageHeader';
import { PageLoader } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/feedback';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useT } from '../i18n';
import { discoverApi } from '../services/discoverApi';
import { budgetLabel, marketPriceLabel } from '../utils/format';

function Section({ title, description, children, empty }) {
  const { t } = useT();
  const items = Array.isArray(children) ? children : [children];
  return (
    <section className="space-y-3" aria-label={t(title)}>
      <div>
        <h2 className="text-xl font-semibold">{t(title)}</h2>
        {description && <p className="text-sm text-ink-700">{t(description)}</p>}
      </div>
      {items.filter(Boolean).length === 0 ? <p className="panel p-4 text-sm text-ink-700">{t(empty)}</p> : <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</ul>}
    </section>
  );
}

/** Where to find what is popular: products people are saving, businesses people follow, the best-rated providers and, for verified providers, new requests. */
export default function DiscoverPage() {
  useDocumentTitle('Discover');
  const { t } = useT();
  const { data, loading, error, reload } = useAsync((signal) => discoverApi.all(signal), []);
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const d = data;
  return (
    <div className="space-y-8">
      <PageHeader title="Discover" description="Trending products, popular businesses and top-rated providers on Imbehe." />

      <Section title="Trending products and businesses" description="What people have been saving lately." empty="Nothing is trending yet.">
        {d.trendingListings.map((l) => (
          <li key={l.id} className="panel overflow-hidden">
            <Link to={`/dashboard/market/${l.id}`} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
              {l.imageUrl ? <img src={l.imageUrl} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" /> : <div aria-hidden="true" className="aspect-[4/3] w-full bg-teal-50" />}
              <div className="p-3"><p className="font-semibold">{l.name}</p><p className="text-sm font-semibold text-teal-700">{t(marketPriceLabel(l))}</p>{l.district && <p className="text-xs text-ink-600">{l.district}</p>}</div>
            </Link>
          </li>
        ))}
      </Section>

      <Section title="Popular businesses" description="The businesses with the most followers." empty="No businesses to show yet.">
        {d.popularBusinesses.map((b) => (
          <li key={b.id} className="panel flex items-center gap-3 p-3">
            <Avatar name={b.fullName} src={b.avatarUrl} />
            <div className="min-w-0"><Link to={`/dashboard/people/${b.id}`} className="flex items-center gap-1.5 font-semibold hover:underline"><span className="truncate">{b.fullName}</span>{b.verified && <VerifiedBadge />}</Link><p className="text-xs text-ink-600">{t('{count} followers', { count: b.followers })}{b.district ? ` · ${b.district}` : ''}</p></div>
          </li>
        ))}
      </Section>

      <Section title="Top-rated providers" description="Verified providers with the best reviews." empty="No rated providers yet.">
        {d.topProviders.map((p) => (
          <li key={p.id} className="panel flex items-center gap-3 p-3">
            <Avatar name={p.displayName} src={p.avatarUrl} />
            <div className="min-w-0"><Link to={`/providers/${p.id}`} className="block truncate font-semibold hover:underline">{p.displayName}</Link><Rating value={p.ratingAvg} count={p.ratingCount} /></div>
          </li>
        ))}
      </Section>

      {d.recentRequests.length > 0 && (
        <Section title="Recent requests for you" description="Open requests that match your services." empty="">
          {d.recentRequests.map((r) => (
            <li key={r.id} className="panel p-3">
              <Link to={`/dashboard/requests/${r.id}`} className="font-semibold hover:underline">{r.title}</Link>
              <p className="text-xs text-ink-600">{r.category?.name} · {r.location?.district}</p>
              <p className="text-sm text-teal-700">{budgetLabel(r)}</p>
            </li>
          ))}
        </Section>
      )}
    </div>
  );
}
