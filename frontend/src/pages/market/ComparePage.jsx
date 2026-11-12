import { Link, useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import { PageLoader } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/feedback';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useT } from '../../i18n';
import { marketApi } from '../../services/marketApi';
import { marketPriceLabel } from '../../utils/format';

export default function ComparePage() {
  useDocumentTitle('Compare');
  const { t } = useT();
  const [params] = useSearchParams();
  const ids = (params.get('ids') || '').split(',').filter(Boolean);
  const { data, loading, error, reload } = useAsync((signal) => marketApi.compare(ids, signal), [params.get('ids')]);
  const labels = [...new Set((data || []).flatMap((l) => l.detailList.map((d) => d.label)))];
  const detail = (l, label) => { const d = l.detailList.find((x) => x.label === label); return d ? (typeof d.value === 'boolean' ? (d.value ? t('Yes') : t('No')) : String(d.value)) : '—'; };
  const rows = [
    [t('Price'), (l) => t(marketPriceLabel(l))],
    [t('Seller'), (l) => `${l.owner.fullName}${l.owner.verified ? ` (${t('Verified')})` : ''}`],
    [t('Type'), (l) => l.kind === 'product' ? t('Product') : t('Business')],
    [t('Category'), (l) => l.category.name],
    [t('District'), (l) => l.location.district],
    [t('In stock'), (l) => (l.inStock ? (l.stock?.tracked ? String(l.stock.quantity) : t('Yes')) : t('No'))],
    [t('Trade options'), (l) => l.transactionOptions.join(', ')],
    ...labels.map((label) => [label, (l) => detail(l, label)]),
  ];
  return (
    <>
      <PageHeader title={t('Compare listings')} actions={<Link to="/dashboard/market" className="font-semibold text-teal-700 underline">{t('Back to the marketplace')}</Link>} />
      {loading && <PageLoader label={t('Loading listings')} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead><tr><th scope="col" className="p-3"><span className="sr-only">{t('Detail')}</span></th>{data.map((l) => <th key={l.id} scope="col" className="p-3 align-bottom"><Link to={`/dashboard/market/${l.id}`} className="font-semibold text-teal-700 underline">{l.name}</Link></th>)}</tr></thead>
            <tbody>
              {rows.map(([label, fn]) => (
                <tr key={label} className="border-t border-ink-100"><th scope="row" className="p-3 font-semibold text-ink-800">{label}</th>{data.map((l) => <td key={l.id} className="p-3 text-ink-800">{fn(l)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
