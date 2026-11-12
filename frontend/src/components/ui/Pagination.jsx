import Button from './Button';
import { useT } from '../../i18n';

/** meta: { page, totalPages, total } from the API. */
export default function Pagination({ meta, onPage }) {
  const { t } = useT();
  if (!meta || meta.totalPages <= 1) return null;
  const { page, totalPages } = meta;
  return (
    <nav className="mt-8 flex items-center justify-between gap-4" aria-label={t('Pagination')}>
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t('Previous')}</Button>
      <p className="text-sm text-ink-700">{t('Page {page} of {total}', { page, total: totalPages })}</p>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>{t('Next')}</Button>
    </nav>
  );
}
