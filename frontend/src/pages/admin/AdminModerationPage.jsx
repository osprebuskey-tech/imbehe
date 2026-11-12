import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import { PageLoader } from '../../components/ui/Spinner';
import { Alert, Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import { REPORT_REASONS } from '../../features/moderation/ReportButton';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { reportApi } from '../../services/reportApi';
import { errorMessage } from '../../utils/errors';
import { formatDate } from '../../utils/format';
import Tx from '../../components/Tx';

const FILTERS = [{ value: 'open', label: 'Waiting' }, { value: 'actioned', label: 'Action taken' }, { value: 'dismissed', label: 'Dismissed' }];
const REASON = Object.fromEntries(REPORT_REASONS);
const TYPE = { post: 'Post', comment: 'Comment', listing: 'Listing', message: 'Private message', user: 'Account' };
const ACTION = { dismiss: 'Dismissed', warn: 'Warned', remove: 'Removed' };

function Decision({ report, onDone }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const decide = async (action) => {
    setBusy(true);
    setError('');
    try {
      await reportApi.resolve(report.id, { action, ...(note.trim() ? { note: note.trim() } : {}) });
      toast.success('Done. The people involved have been told.');
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const needsNote = note.trim().length < 3;
  return (
    <div className="mt-4 space-y-3 border-t border-ink-100 pt-4">
      <label className="block text-sm font-semibold" htmlFor={`note-${report.id}`}><Tx>Note to the person (needed to warn or remove)</Tx></label>
      <textarea id={`note-${report.id}`} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="input" />
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" loading={busy} onClick={() => decide('dismiss')}><Tx>Dismiss</Tx></Button>
        <Button variant="outline" loading={busy} disabled={needsNote} onClick={() => decide('warn')}><Tx>Warn the owner</Tx></Button>
        {report.targetType !== 'user' && <Button variant="danger" loading={busy} disabled={needsNote} onClick={() => decide('remove')}><Tx>Remove it</Tx></Button>}
      </div>
      {report.targetType === 'user' && <p className="text-xs text-ink-600"><Tx>To suspend an account, use the Users page.</Tx></p>}
    </div>
  );
}

function Tile({ label, value, tone }) {
  return (
    <div className={`panel p-4 ${tone === 'alert' ? 'border-amber-400' : ''}`}>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm text-ink-700">{label}</p>
    </div>
  );
}

/** What is waiting, how fast reports get handled, and who is reported most. */
function Summary() {
  const { data, loading, error, reload } = useAsync((signal) => reportApi.summary(signal), []);
  if (loading) return null;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const s = data.summary;
  const hours = s.last30Days.averageHoursToHandle;
  return (
    <section aria-label="Moderation at a glance" className="mb-6 space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Waiting for you" value={s.open} />
        <Tile label="Waiting over a day" value={s.openOverOneDay} tone={s.openOverOneDay > 0 ? 'alert' : undefined} />
        <Tile label="Oldest waiting since" value={s.oldestOpenAt ? formatDate(s.oldestOpenAt) : 'None'} />
        <Tile label="Handled in 30 days" value={s.last30Days.handled} />
        <Tile label="Average time to handle" value={hours === null ? 'No data yet' : hours < 1 ? 'Under an hour' : `${hours} hours`} />
      </div>
      {Object.keys(s.openByType).length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-sm">Waiting by type: {Object.entries(s.openByType).map(([type, n]) => <Badge key={type} tone="neutral">{TYPE[type]}: {n}</Badge>)}</p>
      )}
      {s.mostReported.length > 0 && (
        <div className="panel p-4">
          <h2 className="text-base font-semibold"><Tx>Most reported members (last 90 days)</Tx></h2>
          <ol className="mt-2 divide-y divide-ink-100 text-sm">
            {s.mostReported.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link to={`/dashboard/people/${m.id}`} className="font-semibold text-teal-800 underline">{m.fullName}</Link>
                <span className="text-ink-700">{m.reports} report{m.reports === 1 ? '' : 's'} · action taken on {m.actioned}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className={`panel p-4 ${tone === 'warn' && value > 0 ? 'border-amber-500' : ''}`}>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm text-ink-700">{label}</p>
    </div>
  );
}

function Dashboard({ refreshKey }) {
  const { data, loading } = useAsync((signal) => reportApi.stats(signal), [refreshKey]);
  const s = data?.stats;
  if (loading && !s) return null;
  if (!s) return null;
  const days = s.oldestOpenAt ? Math.floor((Date.now() - new Date(s.oldestOpenAt).getTime()) / 86400000) : 0;
  return (
    <section aria-label="Overview" className="mb-6 space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Waiting for a decision" value={s.open} />
        <Stat label="Waiting more than 2 days" value={s.openOver48h} tone="warn" />
        <Stat label="Handled in the last 30 days" value={s.last30Days.handled} />
        <Stat label="Average hours to handle" value={s.last30Days.averageHoursToHandle ?? '-'} />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="panel p-4">
          <h2 className="text-sm font-semibold"><Tx>Waiting, by type</Tx></h2>
          <ul className="mt-2 space-y-1 text-sm">{Object.entries(s.openByType).length ? Object.entries(s.openByType).map(([k, n]) => <li key={k} className="flex justify-between"><span>{TYPE[k]}</span><strong>{n}</strong></li>) : <li className="text-ink-600"><Tx>Nothing waiting</Tx></li>}</ul>
          {s.open > 0 && <p className="mt-2 text-xs text-ink-600">Oldest has waited {days === 0 ? 'less than a day' : `${days} day${days === 1 ? '' : 's'}`}.</p>}
        </div>
        <div className="panel p-4">
          <h2 className="text-sm font-semibold"><Tx>Decisions, last 30 days</Tx></h2>
          <ul className="mt-2 space-y-1 text-sm">{Object.entries(s.last30Days.actions).length ? Object.entries(s.last30Days.actions).map(([k, n]) => <li key={k} className="flex justify-between"><span>{ACTION[k]}</span><strong>{n}</strong></li>) : <li className="text-ink-600"><Tx>No decisions yet</Tx></li>}</ul>
        </div>
        <div className="panel p-4">
          <h2 className="text-sm font-semibold"><Tx>Most reported members, last 30 days</Tx></h2>
          <ul className="mt-2 space-y-1 text-sm">
            {s.mostReported.length ? s.mostReported.map((m) => <li key={m.id} className="flex justify-between gap-2"><Link to={`/dashboard/people/${m.id}`} className="truncate font-medium text-teal-800 underline">{m.fullName}{m.suspended ? ' (suspended)' : ''}</Link><span>{m.reports} reports, {m.removed} removed</span></li>) : <li className="text-ink-600"><Tx>No reports yet</Tx></li>}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default function AdminModerationPage() {
  useDocumentTitle('Reports');
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const list = useAsync((signal) => reportApi.adminList({ status, page, limit: 10 }, signal), [status, page]);
  const reports = list.data?.reports;

  return (
    <>
      <PageHeader title="Reports" description="What members reported: posts, comments, listings, private messages and accounts. For a private message you see only the message that was reported." />
      <Summary />
      <Dashboard refreshKey={list.data} />
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button key={f.value} type="button" aria-pressed={status === f.value} onClick={() => { setStatus(f.value); setPage(1); }} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${status === f.value ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 hover:bg-ink-50'}`}>{f.label}</button>
        ))}
      </div>
      {list.loading && <PageLoader label="Loading reports" />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {reports?.length === 0 && <EmptyState title="No reports here" description={status === 'open' ? 'Nothing is waiting for you.' : 'Nothing to show for this filter.'} />}
      {reports?.length > 0 && (
        <>
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="panel p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">{TYPE[r.targetType]}</Badge>
                  <Badge tone="neutral">{REASON[r.reason] ?? r.reason}</Badge>
                  {r.openReportsOnTarget > 1 && <Badge tone="warning">{r.openReportsOnTarget} reports on this</Badge>}
                  <span className="text-sm text-ink-600">{formatDate(r.createdAt)}</span>
                </div>
                <blockquote className="mt-3 max-w-prose whitespace-pre-line border-l-4 border-ink-200 pl-3 text-ink-900">{r.snapshot}</blockquote>
                {r.details && <p className="mt-2 text-sm text-ink-800">Reporter says: {r.details}</p>}
                <p className="mt-2 text-sm text-ink-700">
                  Reported by {r.reporter?.fullName ?? 'a member'}{r.owner && <> · by {r.owner.fullName}</>}
                  {r.link && <> · <Link to={r.link} className="font-semibold text-teal-800 underline"><Tx>Open it</Tx></Link></>}
                </p>
                {r.status === 'open' ? <Decision report={r} onDone={list.reload} /> : r.resolution && <p className="mt-3 text-sm"><strong>{ACTION[r.resolution.action]}</strong>{r.resolution.by ? ` by ${r.resolution.by}` : ''}{r.resolution.note ? `: ${r.resolution.note}` : ''}</p>}
              </li>
            ))}
          </ul>
          <Pagination meta={list.meta} onPage={setPage} />
        </>
      )}
    </>
  );
}
