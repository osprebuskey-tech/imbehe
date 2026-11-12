import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Button, { ButtonLink } from '../../components/ui/Button';
import { PageLoader } from '../../components/ui/Spinner';
import { Alert, Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import { ConfirmDialog } from '../../components/ui/Dialog';
import QuotationCard from '../../features/requests/QuotationCard';
import QuotationForm from '../../features/requests/QuotationForm';
import MessageButton from '../../features/messages/MessageButton';
import { MediaGallery } from '../../features/media/MediaPicker';
import ImageManager from '../../features/listings/ImageManager';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { quotationApi } from '../../services/quotationApi';
import { requestApi } from '../../services/requestApi';
import { REQUEST_STATUS } from '../../utils/constants';
import { errorMessage } from '../../utils/errors';
import { budgetLabel, formatDate, plural } from '../../utils/format';
import Tx from '../../components/Tx';

function Photos({ images }) {
  if (!images.length) return null;
  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {images.map((img, i) => <li key={img.id}><a href={img.url} target="_blank" rel="noreferrer"><img src={img.url} alt={`Photo ${i + 1} of the job`} className="aspect-[4/3] w-full rounded-lg object-cover" loading="lazy" /></a></li>)}
    </ul>
  );
}

/** What the customer sees: every quotation, sortable, with accept and decline. */
function OwnerQuotations({ request, quotations, onChanged }) {
  const toast = useToast();
  const [sort, setSort] = useState('price');
  const [deciding, setDeciding] = useState(null); // { quotation, action }
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(() => {
    const rank = { accepted: 0, pending: 1, expired: 2, rejected: 3, withdrawn: 4 };
    const by = {
      price: (a, b) => a.price - b.price,
      rating: (a, b) => (b.provider.ratingAvg || 0) - (a.provider.ratingAvg || 0),
      speed: (a, b) => (a.durationDays ?? Infinity) - (b.durationDays ?? Infinity),
      newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    }[sort];
    return [...quotations].sort((a, b) => rank[a.status] - rank[b.status] || by(a, b));
  }, [quotations, sort]);

  const decide = async () => {
    setBusy(true);
    try {
      await (deciding.action === 'accept' ? quotationApi.accept(deciding.quotation.id) : quotationApi.reject(deciding.quotation.id));
      toast.success(deciding.action === 'accept' ? 'Quotation accepted. The provider has been told.' : 'Quotation declined.');
      setDeciding(null);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
      setDeciding(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  if (quotations.length === 0) {
    return <EmptyState title="No quotations yet" description={request.status === 'open' ? 'Providers have been told about your request. Replies will show up here and in your notifications.' : 'No provider sent a quotation.'} />;
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-end gap-2">
        <label htmlFor="q-sort" className="text-sm font-medium"><Tx>Sort by</Tx></label>
        <select id="q-sort" value={sort} onChange={(e) => setSort(e.target.value)} className="input !w-auto !py-1.5">
          <option value="price"><Tx>Lowest price</Tx></option><option value="rating"><Tx>Highest rated</Tx></option><option value="speed"><Tx>Fastest</Tx></option><option value="newest"><Tx>Newest</Tx></option>
        </select>
      </div>
      <div className="space-y-4">
        {sorted.map((q) => (
          <QuotationCard
            key={q.id}
            quotation={q}
            actions={(q.status === 'pending' || q.status === 'accepted') ? (
              <>
                {request.status === 'open' && q.status === 'pending' && (
                  <>
                    <Button onClick={() => setDeciding({ quotation: q, action: 'accept' })}><Tx>Accept</Tx><span className="sr-only"> quotation from {q.provider.displayName}</span></Button>
                    <Button variant="outline" onClick={() => setDeciding({ quotation: q, action: 'reject' })}><Tx>Decline</Tx><span className="sr-only"> quotation from {q.provider.displayName}</span></Button>
                  </>
                )}
                {q.provider.userId && <MessageButton userId={q.provider.userId} context={{ type: 'request', id: request.id }} label="Ask a question or negotiate" />}
              </>
            ) : null}
          />
        ))}
      </div>
      <ConfirmDialog
        open={Boolean(deciding)}
        onClose={() => setDeciding(null)}
        onConfirm={decide}
        loading={busy}
        title={deciding?.action === 'accept' ? 'Accept this quotation?' : 'Decline this quotation?'}
        confirmLabel={deciding?.action === 'accept' ? 'Accept quotation' : 'Decline'}
        danger={deciding?.action !== 'accept'}
      >
        {deciding?.action === 'accept'
          ? <p><Tx>You’re choosing</Tx> <strong>{deciding.quotation.provider.displayName}</strong> at {deciding.quotation.price.toLocaleString('en-US')} RWF. {request.allowMultiple ? 'Your request stays open so you can accept more offers. Close it when you have enough.' : 'Your request will close and the other providers will be told.'} This can’t be undone here.</p>
          : <p>{deciding?.quotation.provider.displayName} will be told you declined. Other providers can still quote.</p>}
      </ConfirmDialog>
    </>
  );
}

/** What a provider sees: their own quotation, or a form to send one. */
function ProviderQuotePanel({ request, quotations, onChanged }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const mine = quotations[0];

  const create = async (body) => {
    await quotationApi.create(request.id, body);
    toast.success('Quotation sent. The customer has been told.');
    onChanged();
  };
  const edit = async (body) => {
    await quotationApi.update(mine.id, body);
    toast.success('Quotation updated.');
    setEditing(false);
    onChanged();
  };
  const withdraw = async () => {
    setBusy(true);
    try {
      await quotationApi.withdraw(mine.id);
      toast.success('Quotation withdrawn.');
      setWithdrawing(false);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
      setWithdrawing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  if (!mine) {
    if (request.status !== 'open') return <Alert tone="info"><Tx>This request is closed, so it no longer takes quotations.</Tx></Alert>;
    return <div className="panel p-6"><h2 className="mb-4 text-xl font-semibold"><Tx>Send your quotation</Tx></h2><QuotationForm onSubmit={create} /></div>;
  }

  const editable = request.status === 'open' && (mine.status === 'pending' || mine.status === 'expired');
  if (editing) return <div className="panel p-6"><h2 className="mb-4 text-xl font-semibold"><Tx>Edit your quotation</Tx></h2><QuotationForm quotation={mine} onSubmit={edit} onCancel={() => setEditing(false)} submitLabel="Save changes" /></div>;

  return (
    <>
      <QuotationCard
        quotation={mine}
        showProvider={false}
        actions={editable ? (
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>{mine.status === 'expired' ? 'Renew or edit' : 'Edit'}</Button>
            <Button variant="danger" onClick={() => setWithdrawing(true)}><Tx>Withdraw</Tx></Button>
          </>
        ) : null}
      />
      {mine.status === 'accepted' && (
        <Alert tone="success" title="The customer accepted your quotation" className="mt-4" action={request.bookingId ? <ButtonLink to={`/dashboard/bookings/${request.bookingId}`} size="sm"><Tx>Open the job</Tx></ButtonLink> : null}>
          <Tx>A job has been created. Start it when you begin work.</Tx>
        </Alert>
      )}
      <ConfirmDialog open={withdrawing} onClose={() => setWithdrawing(false)} onConfirm={withdraw} loading={busy} title="Withdraw this quotation?" confirmLabel="Withdraw" danger>
        <p><Tx>The customer will be told. You can’t send another quotation for this request afterwards.</Tx></p>
      </ConfirmDialog>
    </>
  );
}

export default function RequestDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const request = useAsync((signal) => requestApi.get(id, signal), [id]);
  const quotes = useAsync((signal) => quotationApi.listForRequest(id, signal), [id]);
  const [cancelling, setCancelling] = useState(false);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState(null);
  const r = request.data?.request;
  useDocumentTitle(r?.title ?? 'Request');

  if (request.loading) return <PageLoader label="Loading request" />;
  if (request.error?.status === 404) {
    return <EmptyState title="Request not found" description="It may have been cancelled, or it isn’t one you can see." action={<ButtonLink to="/dashboard"><Tx>Back to your dashboard</Tx></ButtonLink>} />;
  }
  if (request.error) return <ErrorState error={request.error} onRetry={request.reload} />;

  const reloadAll = () => { request.reload(); quotes.reload(); };
  const quotations = quotes.data?.quotations ?? [];
  const st = REQUEST_STATUS[r.status];
  const canEdit = r.isOwner && r.status === 'open' && r.quotationCount === 0;
  const isAdminView = !r.isOwner && r.myQuotation === undefined;

  const closeRequest = async () => {
    setBusy(true);
    try {
      await requestApi.close(id);
      toast.success('Request closed. Providers still waiting have been told.');
      setClosing(false);
      reloadAll();
    } catch (err) {
      toast.error(errorMessage(err));
      setClosing(false);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await requestApi.cancel(id);
      toast.success('Request cancelled.');
      setCancelling(false);
      reloadAll();
    } catch (err) {
      toast.error(errorMessage(err));
      setCancelling(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-700">
        <Link to={r.isOwner ? '/dashboard/requests' : '/dashboard/provider/requests'} className="underline">{r.isOwner ? 'My requests' : 'Requests for you'}</Link> / {r.title}
      </nav>
      <PageHeader
        title={r.title}
        description={`${r.category.name} · posted ${formatDate(r.createdAt)}`}
        actions={r.isOwner && r.status === 'open' ? (
          <>
            {canEdit && <ButtonLink to={`/dashboard/requests/${r.id}/edit`} variant="outline"><Tx>Edit</Tx></ButtonLink>}
            {r.allowMultiple && r.acceptedCount > 0 && <Button variant="outline" onClick={() => setClosing(true)}><Tx>Close request</Tx></Button>}
            {r.acceptedCount === 0 && <Button variant="danger" onClick={() => setCancelling(true)}><Tx>Cancel request</Tx></Button>}
          </>
        ) : null}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge tone={st.tone}>{st.label}</Badge>
        {r.directed && r.isOwner && <Badge tone="info"><Tx>Sent to one provider</Tx></Badge>}
        {r.directed && !r.isOwner && !isAdminView && <Badge tone="info"><Tx>Sent to you</Tx></Badge>}
        {r.allowMultiple && <Badge tone="info"><Tx>Several offers allowed</Tx></Badge>}
        {r.isOwner && <Badge tone={r.quotationCount > 0 ? 'warning' : 'neutral'}>{plural(r.quotationCount, 'quotation')}</Badge>}
      </div>

      {r.bookingIds?.length > 1
        ? (
          <Alert tone="success" title={`This request became ${r.bookingIds.length} jobs`} className="mb-6">
            <span className="flex flex-wrap gap-2">{r.bookingIds.map((b, i) => <ButtonLink key={b} to={`/dashboard/bookings/${b}`} size="sm" variant="outline">Open job {i + 1}</ButtonLink>)}</span>
          </Alert>
        )
        : r.bookingId && (
          <Alert tone="success" title="This request became a job" className="mb-6" action={<ButtonLink to={`/dashboard/bookings/${r.bookingId}`} size="sm"><Tx>Open the job</Tx></ButtonLink>}>
            <Tx>Track progress, start and finish the work from the job page.</Tx>
          </Alert>
        )}

      <section className="panel mb-8 space-y-5 p-6" aria-labelledby="job-details">
        <h2 id="job-details" className="text-xl font-semibold"><Tx>The job</Tx></h2>
        <p className="max-w-prose whitespace-pre-line text-ink-800">{r.description}</p>
        <MediaGallery media={r.media} />
        <dl className="grid gap-4 sm:grid-cols-2">
          <div><dt className="text-sm text-ink-600"><Tx>Where</Tx></dt><dd className="font-medium">{[r.location.sector, r.location.district].filter(Boolean).join(', ')}</dd></div>
          <div><dt className="text-sm text-ink-600"><Tx>Budget</Tx></dt><dd className="font-medium">{budgetLabel(r)}</dd></div>
          <div><dt className="text-sm text-ink-600"><Tx>Preferred date</Tx></dt><dd className="font-medium">{r.preferredDate ? formatDate(r.preferredDate) : 'Flexible'}</dd></div>
          <div><dt className="text-sm text-ink-600"><Tx>Requested by</Tx></dt><dd className="font-medium">{r.customer.name}{r.company?.name ? `, ${r.company.name}` : ''}</dd></div>
        </dl>
        {!(r.isOwner && r.status === 'open') && <Photos images={r.attachments} />}
      </section>

      {r.isOwner && r.status === 'open' && (
        <div className="mb-8">
          <ImageManager
            title="Photos of the job"
            hint="Photos help providers quote accurately. Up to 5."
            max={5}
            images={photos ?? r.attachments}
            onChange={setPhotos}
            upload={async (file) => (await requestApi.addAttachment(id, file)).data.attachments}
            remove={(attachmentId) => requestApi.removeAttachment(id, attachmentId)}
          />
        </div>
      )}

      <section aria-labelledby="quotes-h">
        <h2 id="quotes-h" className="mb-4 text-2xl font-bold">{r.isOwner || isAdminView ? 'Quotations' : 'Your quotation'}</h2>
        {quotes.loading && <PageLoader label="Loading quotations" />}
        {quotes.error && <ErrorState error={quotes.error} onRetry={quotes.reload} />}
        {!quotes.loading && !quotes.error && (r.isOwner
          ? <OwnerQuotations request={r} quotations={quotations} onChanged={reloadAll} />
          : isAdminView
            ? (quotations.length ? <div className="space-y-4">{quotations.map((q) => <QuotationCard key={q.id} quotation={q} />)}</div> : <EmptyState title="No quotations" />)
            : <ProviderQuotePanel request={r} quotations={quotations} onChanged={reloadAll} />)}
      </section>

      <ConfirmDialog open={closing} onClose={() => setClosing(false)} onConfirm={closeRequest} loading={busy} title="Close this request?" confirmLabel="Close request">
        <p><Tx>No more quotations will be accepted. Providers whose offers are still waiting will be told they were not selected. Jobs you already accepted carry on.</Tx></p>
      </ConfirmDialog>
      <ConfirmDialog open={cancelling} onClose={() => setCancelling(false)} onConfirm={cancel} loading={busy} title="Cancel this request?" confirmLabel="Cancel request" danger>
        <p><Tx>Providers who sent quotations will be told, and their quotations will close. You can post a new request any time.</Tx></p>
      </ConfirmDialog>
    </>
  );
}
