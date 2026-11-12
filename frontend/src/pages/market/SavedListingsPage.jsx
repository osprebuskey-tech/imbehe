import PageHeader from '../../components/ui/PageHeader';
import { ButtonLink } from '../../components/ui/Button';
import { PageLoader } from '../../components/ui/Spinner';
import { EmptyState, ErrorState } from '../../components/ui/feedback';
import MarketCard from '../../features/market/MarketCard';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useT } from '../../i18n';
import { marketApi } from '../../services/marketApi';

export default function SavedListingsPage() {
  useDocumentTitle('Saved listings');
  const { t } = useT();
  const { data, loading, error, reload } = useAsync((signal) => marketApi.saved({ limit: 50 }, signal), []);
  return (
    <>
      <PageHeader title={t('Saved listings')} description={t('Listings you saved to come back to.')} actions={<ButtonLink to="/dashboard/market" variant="outline">{t('Marketplace')}</ButtonLink>} />
      {loading && <PageLoader label={t('Loading listings')} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data?.length === 0 && <EmptyState title={t('Nothing saved yet')} description={t('Tap the heart on a listing to keep it here.')} action={<ButtonLink to="/dashboard/market">{t('Browse the marketplace')}</ButtonLink>} />}
      {data?.length > 0 && <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.map((l) => <MarketCard key={l.id} listing={l} />)}</ul>}
    </>
  );
}
