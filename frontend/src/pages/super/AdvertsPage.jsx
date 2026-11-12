import { useState } from 'react';
import Button from '../../components/ui/Button';
import FileButton from '../../components/ui/FileButton';
import Dialog, { ConfirmDialog } from '../../components/ui/Dialog';
import PageHeader from '../../components/ui/PageHeader';
import { TextField } from '../../components/ui/Field';
import { Alert, Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import { PageLoader } from '../../components/ui/Spinner';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { advertApi } from '../../services/advertApi';
import { errorMessage, fieldErrors } from '../../utils/errors';
import { formatDate } from '../../utils/format';
import Tx from '../../components/Tx';

const EMPTY = { title: '', text: '', linkUrl: '', sortOrder: '', expiresAt: '' };

// <input type="datetime-local"> works in local time without a zone; the API wants a real instant.
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toIso = (local) => (local ? new Date(local).toISOString() : '');
const isEnded = (a) => a.expiresAt && new Date(a.expiresAt).getTime() <= Date.now();

function validate(form, file, needsFile) {
  const e = {};
  if (form.title.trim().length < 3) e.title = 'Write a title of at least 3 characters';
  if (form.text.trim().length > 200) e.text = 'Keep it to 200 characters or fewer';
  if (form.linkUrl.trim() && !/^https?:\/\/\S+\.\S+/i.test(form.linkUrl.trim())) e.linkUrl = 'Use a link that starts with http:// or https://';
  if (form.sortOrder !== '' && !/^\d{1,5}$/.test(String(form.sortOrder))) e.sortOrder = 'Use a whole number, 0 or more';
  if (form.expiresAt && !(new Date(form.expiresAt).getTime() > Date.now())) e.expiresAt = 'The end time must be in the future';
  if (needsFile && !file) e.image = 'Choose a picture (JPEG, PNG or WebP)';
  return e;
}

function Fields({ form, set, errors }) {
  return (
    <div className="space-y-4">
      <TextField label="Title" value={form.title} onChange={set('title')} error={errors.title} maxLength={100} required />
      <TextField label="Short text (optional)" value={form.text} onChange={set('text')} error={errors.text} maxLength={200} hint="Shown over the bottom of the picture." />
      <TextField label="Link (optional)" value={form.linkUrl} onChange={set('linkUrl')} error={errors.linkUrl} placeholder="https://" hint="Where the advert goes when someone taps it." />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Order (optional)" inputMode="numeric" value={form.sortOrder} onChange={set('sortOrder')} error={errors.sortOrder} hint="Smaller numbers come first." />
        <TextField label="Stop showing on (optional)" type="datetime-local" value={form.expiresAt} onChange={set('expiresAt')} error={errors.expiresAt} hint="Leave empty to keep it up until you hide it." />
      </div>
    </div>
  );
}

function Row({ advert: a, onChange }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: a.title, text: a.text ?? '', linkUrl: a.linkUrl ?? '', sortOrder: String(a.sortOrder ?? 0), expiresAt: toLocalInput(a.expiresAt) });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const run = async (fn, done) => {
    setBusy(true);
    try { await fn(); toast.success(done); onChange(); return true; } catch (err) { toast.error(errorMessage(err)); setErrors(fieldErrors(err)); return false; } finally { setBusy(false); }
  };
  const save = async () => {
    const found = validate(form, null, false);
    setErrors(found);
    if (Object.keys(found).length) return;
    const ok = await run(() => advertApi.update(a.id, { title: form.title.trim(), text: form.text.trim(), linkUrl: form.linkUrl.trim(), sortOrder: Number(form.sortOrder || 0), expiresAt: toIso(form.expiresAt) }), 'Saved.');
    if (ok) setEditing(false);
  };
  const ended = isEnded(a);

  return (
    <li className="panel flex flex-wrap items-center gap-4 p-4">
      <img src={a.imageUrl} alt="" className="h-20 w-36 shrink-0 rounded-lg border border-ink-100 object-cover" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{a.title}</p>
        {a.text && <p className="truncate text-sm text-ink-700">{a.text}</p>}
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-700">
          <Badge tone={ended ? 'neutral' : a.status === 'active' ? 'success' : 'neutral'}>{ended ? 'Ended' : a.status === 'active' ? 'Shown' : 'Hidden'}</Badge>
          <span>Order {a.sortOrder}</span>
          {a.expiresAt && <span>{ended ? 'Ended' : 'Ends'} {formatDate(a.expiresAt)}</span>}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}><Tx>Edit</Tx></Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => advertApi.update(a.id, { status: a.status === 'active' ? 'hidden' : 'active' }), a.status === 'active' ? 'Hidden from the welcome page.' : 'Shown on the welcome page.')}>{a.status === 'active' ? 'Hide' : 'Show'}</Button>
        <FileButton size="sm" disabled={busy} onFile={(f) => run(() => advertApi.replaceImage(a.id, f), 'Picture replaced.')}><Tx>Change picture</Tx></FileButton>
        <Button size="sm" variant="danger" disabled={busy} onClick={() => setRemoving(true)}><Tx>Remove</Tx></Button>
      </div>

      <Dialog open={editing} onClose={() => setEditing(false)} title={`Edit ${a.title}`} footer={<><Button variant="outline" onClick={() => setEditing(false)}><Tx>Cancel</Tx></Button><Button loading={busy} onClick={save}><Tx>Save</Tx></Button></>}>
        <Fields form={form} set={set} errors={errors} />
      </Dialog>
      <ConfirmDialog open={removing} onClose={() => setRemoving(false)} danger loading={busy} title={`Remove ${a.title}?`} confirmLabel="Remove" onConfirm={async () => { if (await run(() => advertApi.remove(a.id), 'Removed.')) setRemoving(false); }}>
        <Tx>It disappears from the welcome page and its picture file is deleted. To keep it for later, use Hide instead.</Tx>
      </ConfirmDialog>
    </li>
  );
}

/** Super administrator only: the picture adverts shown near the top of the welcome page. */
export default function AdvertsPage() {
  useDocumentTitle('Adverts');
  const toast = useToast();
  const list = useAsync((signal) => advertApi.manage(signal), []);
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const add = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = validate(form, file, true);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await advertApi.create({ title: form.title.trim(), text: form.text.trim(), linkUrl: form.linkUrl.trim(), sortOrder: form.sortOrder, expiresAt: toIso(form.expiresAt) }, file);
      toast.success('Advert added to the welcome page.');
      setForm(EMPTY);
      setFile(null);
      list.reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Adverts" description="Picture adverts shown near the top of the welcome page, visible to everyone." />

      <form onSubmit={add} noValidate className="panel mb-8 space-y-4 p-6" aria-labelledby="add-advert-h">
        <h2 id="add-advert-h" className="text-xl font-semibold"><Tx>Add an advert</Tx></h2>
        {formError && <Alert tone="error">{formError}</Alert>}
        <Fields form={form} set={set} errors={errors} />
        <div className="flex flex-wrap items-center gap-3">
          <FileButton onFile={setFile}>{file ? 'Choose a different picture' : 'Choose picture'}</FileButton>
          <span className="text-sm text-ink-700">{file ? file.name : 'JPEG, PNG or WebP. A wide picture (about 21:9) looks best.'}</span>
        </div>
        {errors.image && <p role="alert" className="text-sm font-medium text-rose-700">{errors.image}</p>}
        <Button type="submit" loading={busy}><Tx>Add to the welcome page</Tx></Button>
      </form>

      {list.loading ? <PageLoader label="Loading" /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} />
        : list.data.length === 0 ? <EmptyState title="No adverts yet" description="Add one above and it appears on the welcome page straight away." />
          : <ul className="space-y-3">{list.data.map((a) => <Row key={a.id} advert={a} onChange={list.reload} />)}</ul>}
    </>
  );
}
