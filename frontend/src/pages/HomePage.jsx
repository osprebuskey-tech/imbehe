import { Link } from 'react-router-dom';
import SearchBar from '../components/SearchBar';
import Icon from '../components/Icon';

import PartnersStrip from '../components/PartnersStrip';
import AdvertsStrip from '../components/AdvertsStrip';
import ShowcasePanel from '../components/ShowcasePanel';
import { showcaseApi } from '../services/showcaseApi';
import { ButtonLink } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { PageLoader } from '../components/ui/Spinner';
import { useCategories } from '../hooks/useCategories';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { catalogApi } from '../services/catalogApi';
import { ROLES } from '../utils/constants';
import { useT } from '../i18n';

// A line icon for a trade, picked from its name. Anything else gets a briefcase.
function tradeIcon(name = '') {
  if (/photo|video|camera|film/i.test(name)) return 'camera';
  if (/electric|wiring|solar|power/i.test(name)) return 'bolt';
  if (/interior|furnitur|decor|carpent/i.test(name)) return 'sofa';
  if (/\bit\b|software|develop|network|computer|tech|graphic|web/i.test(name)) return 'terminal';
  return 'briefcase';
}

const CHECKS = [
  'National ID (or RDB certificate for a business)',
  'CV and experience for individual providers',
  'Profile: bio, categories and district',
  'Review by an administrator, then final approval',
];

const STEPS = [
  { title: 'Describe the job', text: 'Say what you need, where it is, when it has to happen and what you can pay.' },
  { title: 'Verified providers quote', text: 'Verified professionals send you quotations in Rwandan francs.' },
  { title: 'Accept and agree', text: 'Accept a quotation and both sides agree the contract before work starts.' },
  { title: 'Work happens, then closes', text: 'Track progress, rate each other, and raise a dispute if something goes wrong.' },
];

// What a signed-in person most likely came back to do, by role (the dashboard has the rest).
function quickLinks(hasRole) {
  const links = [];
  if (hasRole(ROLES.CUSTOMER, ROLES.BUSINESS)) links.push({ to: '/dashboard/requests/new', label: 'Request a quotation' }, { to: '/dashboard/requests', label: 'My requests' });
  if (hasRole(ROLES.PROVIDER)) links.push({ to: '/dashboard/provider/requests', label: 'Requests for you' }, { to: '/dashboard/provider/services', label: 'My services' });
  if (hasRole(ROLES.FINANCE)) links.push({ to: '/dashboard/admin/payments/follow-up', label: 'Payment follow-up' });
  if (hasRole(ROLES.SUPER_ADMIN)) links.push({ to: '/dashboard/super/activity', label: 'Activity report' });
  if (hasRole(ROLES.ADMIN)) links.push({ to: '/dashboard/admin/providers', label: 'Provider verification' });
  return links.slice(0, 3);
}

export default function HomePage() {
  useDocumentTitle();
  const { t } = useT();
  const { user, hasRole } = useAuth();
  const firstName = user?.fullName?.split(' ')[0];
  const { categories, loading: catsLoading } = useCategories();
  const services = useAsync((signal) => catalogApi.listServices({ limit: 6, sort: 'top' }, signal), []);
  // Posts from verified people for the middle panel. With none, the hero falls back to two columns instead of leaving a gap.
  const showcase = useAsync((signal) => (user ? Promise.resolve({ data: [] }) : showcaseApi.list(signal)), [Boolean(user)]);
  const showcasePosts = (showcase.data ?? []).filter((p) => p.media?.length);
  const providers = useAsync((signal) => catalogApi.listProviders({ limit: 3, sort: 'top' }, signal), []);

  return (
    <>
      <section className="relative overflow-hidden bg-white py-14 text-ink-950 sm:py-20">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-sun-300/40 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-1/4 h-96 w-96 rounded-full bg-sage-300/50 blur-3xl" />
        <div className={`container-page relative grid items-center gap-10 ${user ? '' : showcasePosts.length ? 'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.95fr)] lg:gap-10' : 'lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-16'}`}>
          <div>
            {user ? (
              <>
                <p className="text-sm font-semibold uppercase tracking-wider text-teal-700">{t('Welcome back')}</p>
                <h1 className="mt-2 max-w-3xl text-4xl font-bold leading-[1.05] text-ink-950 sm:text-6xl">{t('Hello,')} <span className="mark-accent">{firstName}.</span></h1>
                <p className="mt-5 max-w-xl text-lg text-ink-700">{t('You’re signed in. Find someone new, or pick up where you left off.')}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <ButtonLink to="/dashboard" variant="accent" size="lg">{t('Go to your dashboard')}</ButtonLink>
                  {quickLinks(hasRole).map((l) => <ButtonLink key={l.to} to={l.to} variant="outline" size="lg" className="!bg-transparent hover:!bg-ink-50">{t(l.label)}</ButtonLink>)}
                </div>
              </>
            ) : (
              <>
                <p className="flex items-center gap-2 text-sm font-bold text-teal-700"><Icon name="shield" className="h-5 w-5" />{t('Every provider is checked By Our Team before their services go live')}</p>
                <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-[1.05] text-ink-950 sm:text-6xl">{t('Hire a verified professional')} </h1>
               
                <div className="mt-8 flex flex-wrap gap-3">
                  <ButtonLink to="/search" variant="outline" size="lg" className="!bg-transparent hover:!bg-ink-50">{t('Hire a professional')}</ButtonLink>
                  <ButtonLink to="/register" variant="outline" size="lg" className="!bg-transparent hover:!bg-ink-50">{t('Offer your skills')}</ButtonLink>
                </div>
              </>
            )}
            <div className="mt-8 max-w-3xl"><SearchBar /></div>
          </div>

          {!user && showcasePosts.length > 0 && <ShowcasePanel posts={showcasePosts} />}

          {!user && (
            <aside aria-labelledby="checks-h" className={`rounded-3xl border border-ink-100 bg-teal-50 p-7 shadow-sm ${showcasePosts.length ? 'lg:self-end' : ''}`}>
              <h2 id="checks-h" className="text-xl font-bold text-ink-950">{t('What gets checked')}</h2>
              <ul className="mt-5 space-y-4">
                {CHECKS.map((c) => (
                  <li key={c} className="flex items-start gap-3 text-ink-800"><span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-rose-600" />{t(c)}</li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      </section>

      <AdvertsStrip />

      <section className="bg-paper py-14" aria-labelledby="browse-heading">
        <div className="container-page">
          <div className="mb-6 flex items-end justify-between gap-4">
            <h2 id="browse-heading" className="text-2xl font-bold sm:text-3xl">{t('Browse by trade')}</h2>
            <Link to="/categories" className="text-sm font-semibold text-teal-700 underline">{t('See all categories')}</Link>
          </div>
          {catsLoading ? <PageLoader label={t('Loading categories')} /> : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {categories.slice(0, 8).map((c) => (
                <li key={c.id} className="panel relative p-6 shadow-sm transition-shadow hover:shadow-md">
                  <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700"><Icon name={tradeIcon(c.name)} className="h-6 w-6" /></span>
                  <h3 className="mt-5 text-lg font-semibold"><Link to={`/search?category=${c.id}`} className="after:absolute after:inset-0 hover:underline">{c.name}</Link></h3>
                  <p className="mt-1.5 text-sm text-ink-700">{c.subcategories.slice(0, 4).map((s) => s.name).join(', ')}{c.subcategories.length > 4 ? '…' : ''}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="bg-white py-16" aria-labelledby="how-heading">
        <div className="container-page">
          <h2 id="how-heading" className="text-3xl font-bold sm:text-4xl">{t('How a job moves')}</h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span aria-hidden="true" className="font-display text-3xl font-bold text-rose-600">{i + 1}</span>
                <h3 className="mt-3 text-lg font-semibold">{t(s.title)}</h3>
                <p className="mt-2 text-ink-700">{t(s.text)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

  

      <PartnersStrip />


      {!user && (
        <section className="bg-paper py-16">
          <div className="container-page">
            <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-ink-100 bg-white px-6 py-10 shadow-sm sm:px-12">
              <div className="max-w-xl">
                <h2 className="text-2xl font-bold sm:text-3xl">{t('Do skilled work? Let clients find you.')}</h2>
                <p className="mt-2 text-ink-700">{t('Create a provider profile, show your portfolio and list your services.')}</p>
              </div>
              <ButtonLink to="/register" size="lg">{t('Offer your services')}</ButtonLink>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
