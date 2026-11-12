import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import SaveButton from '../../features/market/SaveButton';
import ReportButton from '../../features/moderation/ReportButton';
import MessageButton from '../../features/messages/MessageButton';
import Button, { ButtonLink } from '../../components/ui/Button';
import Avatar from '../../components/ui/Avatar';
import { SelectField, TextField } from '../../components/ui/Field';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { PageLoader } from '../../components/ui/Spinner';
import { Alert, Badge, ErrorState } from '../../components/ui/feedback';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useT } from '../../i18n';
import { marketApi } from '../../services/marketApi';
import { errorMessage } from '../../utils/errors';
import { MARKET_STATUS_LABEL, marketPriceLabel } from '../../utils/format';
import { ROLES } from '../../utils/constants';

const STATUSES = ['active', 'inactive', 'sold', 'completed'];
const show = (d, t) => (typeof d.value === 'boolean' ? (d.value ? t('Yes') : t('No')) : String(d.value));

export default function MarketDetailPage() {
  const { id } = useParams();
  const { t } = useT();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, hasRole } = useAuth();
  const { data, loading, error, reload } = useAsync((signal) => marketApi.get(id, signal), [id]);
  const l = data?.listing;
  useDocumentTitle(l?.name ?? 'Listing');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState('');
  const isAdmin = hasRole(ROLES.ADMIN) || hasRole(ROLES.SUPER_ADMIN);

  const act = async (fn, done) => {
    setBusy(true); setProblem('');
    try { await fn(); if (done) toast.success(done); reload(); } catch (err) { setProblem(errorMessage(err)); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await marketApi.remove(id); toast.success(t('Listing deleted.')); navigate('/dashboard/market/mine'); } catch (err) { setProblem(errorMessage(err)); setDeleting(false); setBusy(false); }
  };

  return (
    <>
      <PageHeader title={l?.name ?? t('Listing')} actions={<Link to="/dashboard/market" className="font-semibold text-teal-700 underline">{t('Back to the marketplace')}</Link>} />
      {loading && <PageLoader label={t('Loading listings')} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {l && (
        <div className="mx-auto max-w-3xl space-y-5">
          {l.takenDown && <Alert tone="error" title={t('Hidden by an administrator')}>{l.takenDown.reason}</Alert>}
          {problem && <Alert tone="error">{problem}</Alert>}
          {l.media.length > 0 && (
            <div className={`grid gap-1.5 overflow-hidden rounded-xl ${l.media.length > 1 ? 'sm:grid-cols-2' : ''}`}>
              {l.media.map((m) => (m.kind === 'video' ? <video key={m.url} src={m.url} controls preload="metadata" playsInline className="max-h-96 w-full bg-black object-cover" /> : <img key={m.url} src={m.url} alt="" className="max-h-96 w-full object-cover" />))}
            </div>
          )}
          <section className="panel space-y-3 p-5">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-2xl font-bold text-teal-700">{t(marketPriceLabel(l))}</span>
              <Badge tone={l.status === 'active' ? 'success' : 'neutral'}>{t(MARKET_STATUS_LABEL[l.status])}</Badge>
              <Badge tone="neutral">{l.kind === 'product' ? t('Product') : t('Business')}</Badge>
              {!l.inStock && <Badge tone="warning">{t('Out of stock')}</Badge>}
            </p>
            <p className="whitespace-pre-line text-ink-800">{l.description}</p>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div><dt className="font-semibold">{t('Category')}</dt><dd>{l.category.name}</dd></div>
              <div><dt className="font-semibold">{t('District')}</dt><dd>{l.location.district}{l.location.sector ? `, ${l.location.sector}` : ''}</dd></div>
              {l.stock?.tracked && <div><dt className="font-semibold">{t('In stock')}</dt><dd>{l.stock.quantity}</dd></div>}
              {l.stock?.note && <div><dt className="font-semibold">{t('Availability')}</dt><dd>{l.stock.note}</dd></div>}
              {l.detailList.map((d) => <div key={d.key}><dt className="font-semibold">{d.label}</dt><dd>{show(d, t)}</dd></div>)}
              <div><dt className="font-semibold">{t('Contact')}</dt><dd>{l.contactMethods.join(', ')}</dd></div>
              <div><dt className="font-semibold">{t('Trade options')}</dt><dd>{l.transactionOptions.join(', ')}</dd></div>
            </dl>
          </section>
          <section className="panel flex items-center gap-3 p-4">
            <Avatar name={l.owner.fullName} src={l.owner.avatarUrl} />
            <div className="min-w-0 flex-1"><p className="font-semibold"><Link to={`/dashboard/people/${l.owner.id}`} className="hover:underline">{l.owner.fullName}</Link></p><p className="text-sm text-ink-600">{l.owner.verified ? t('Verified') : t('Not verified yet')}</p></div>
          </section>

          {l.mine && (
            <section className="panel space-y-4 p-5" aria-label={t('Manage this listing')}>
              <div className="flex flex-wrap items-end gap-3">
                <SelectField label={t('Status')} value={l.status} onChange={(e) => act(() => marketApi.setStatus(id, e.target.value), t('Status updated.'))} disabled={busy || Boolean(l.takenDown)} options={STATUSES.map((s) => ({ value: s, label: t(MARKET_STATUS_LABEL[s]) }))} />
                <ButtonLink to={`/dashboard/market/${id}/edit`} variant="outline">{t('Edit')}</ButtonLink>
                <Button variant="danger" onClick={() => setDeleting(true)}>{t('Delete')}</Button>
              </div>
            </section>
          )}
          {isAdmin && !l.mine && (
            <section className="panel space-y-3 p-5" aria-label={t('Moderation')}>
              {l.takenDown
                ? <Button variant="outline" loading={busy} onClick={() => act(() => marketApi.restore(id), t('Listing is visible again.'))}>{t('Show this listing again')}</Button>
                : hiding
                  ? <div className="space-y-3"><TextField label={t('Reason (the owner is told)')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /><div className="flex gap-2"><Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={() => act(async () => { await marketApi.takeDown(id, reason.trim()); setHiding(false); setReason(''); }, t('Listing hidden.'))}>{t('Hide listing')}</Button><Button variant="outline" onClick={() => setHiding(false)}>{t('Cancel')}</Button></div></div>
                  : <Button variant="danger" onClick={() => setHiding(true)}>{t('Hide this listing')}</Button>}
            </section>
          )}
          {!l.mine && user && <SaveButton listing={l} className="border border-ink-200" />}
          {!l.mine && user && <ReportButton targetType="listing" targetId={l.id} />}
          {!l.mine && user && l.status === 'active' && <MessageButton userId={l.owner.id} context={{ type: 'listing', id: l.id }} label={t('Ask a question')} />}
          {!l.mine && user && l.status === 'active' && <ButtonLink to={`/dashboard/requests/new?listing=${l.id}`}>{t('Request a quotation')}</ButtonLink>}
        </div>
      )}
      <ConfirmDialog open={deleting} onClose={() => setDeleting(false)} onConfirm={remove} loading={busy} title={t('Delete this listing?')} confirmLabel={t('Delete')} danger>
        <p>{t('The listing and its photos and videos will be deleted for good. To keep it but stop showing it, set it to Inactive instead.')}</p>
      </ConfirmDialog>
    </>
  );
}
