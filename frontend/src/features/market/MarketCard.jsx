import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui/feedback';
import { MARKET_STATUS_LABEL, marketPriceLabel } from '../../utils/format';
import { useT } from '../../i18n';
import SaveButton from './SaveButton';

/** One listing in a grid. `compare` is { checked, onChange, disabled } to offer the "Compare" tick. */
export default function MarketCard({ listing: l, compare }) {
  const { t } = useT();
  const cover = l.media?.find((m) => m.kind === 'image');
  return (
    <li className="panel relative flex flex-col overflow-hidden">
      <SaveButton listing={l} className="absolute right-2 top-2 z-10" />
      <Link to={`/dashboard/market/${l.id}`} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
        {cover ? <img src={cover.url} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" /> : <div aria-hidden="true" className="aspect-[4/3] w-full bg-teal-50" />}
        <div className="p-4">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold">{l.name}</span>
            {l.status !== 'active' && <Badge tone="neutral">{t(MARKET_STATUS_LABEL[l.status])}</Badge>}
            {!l.inStock && l.status === 'active' && <Badge tone="warning">{t('Out of stock')}</Badge>}
          </p>
          <p className="mt-1 font-semibold text-teal-700">{t(marketPriceLabel(l))}</p>
          <p className="mt-1 text-sm text-ink-700">{l.category?.name} · {l.location?.district}</p>
          <p className="mt-1 text-sm text-ink-600">{l.owner?.fullName}{l.owner?.verified ? ` · ${t('Verified')}` : ''}</p>
        </div>
      </Link>
      {compare && (
        <label className="mt-auto flex items-center gap-2 border-t border-ink-100 px-4 py-2 text-sm font-medium text-ink-800">
          <input type="checkbox" checked={compare.checked} disabled={compare.disabled && !compare.checked} onChange={(e) => compare.onChange(e.target.checked)} className="h-4 w-4 accent-teal-600" />
          {t('Compare')}<span className="sr-only"> {l.name}</span>
        </label>
      )}
    </li>
  );
}
