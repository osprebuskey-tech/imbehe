import PageHeader from '../../components/ui/PageHeader';
import { ButtonLink } from '../../components/ui/Button';
import { PageLoader } from '../../components/ui/Spinner';
import { EmptyState, ErrorState } from '../../components/ui/feedback';
import MarketCard from '../../features/market/MarketCard';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useT } from '../../i18n';
import { marketApi } from '../../services/marketApi';

export default function MyListingsPage() {
  useDocumentTitle('My listings');
  const { t } = useT();
  const { data, loading, error, reload } = useAsync((signal) => marketApi.mine({ limit: 50 }, signal), []);
  return (
    <>
      <PageHeader title={t('My listings')} actions={<ButtonLink to="/dashboard/market/new">{t('New listing')}</ButtonLink>} />
      {loading && <PageLoader label={t('Loading listings')} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data?.length === 0 && <EmptyState title={t('You have no listings yet')} description={t('Publish a product or your business so people can find it.')} action={<ButtonLink to="/dashboard/market/new">{t('New listing')}</ButtonLink>} />}
      {data?.length > 0 && <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.map((l) => <MarketCard key={l.id} listing={l} />)}</ul>}
    </>
  );
}
