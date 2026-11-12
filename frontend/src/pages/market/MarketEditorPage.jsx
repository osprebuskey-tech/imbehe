import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Icon from '../../components/Icon';
import { CheckGroup, CheckboxField, SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import { PageLoader } from '../../components/ui/Spinner';
import { Alert, ErrorState } from '../../components/ui/feedback';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useCategories } from '../../hooks/useCategories';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useT } from '../../i18n';
import { marketApi } from '../../services/marketApi';
import { postApi } from '../../services/postApi';
import { DISTRICTS } from '../../utils/constants';
import { errorMessage, fieldErrors } from '../../utils/errors';

const CONTACT = [{ value: 'message', label: 'Message on Imbehe' }, { value: 'phone', label: 'Phone call' }, { value: 'email', label: 'Email' }, { value: 'visit', label: 'Visit in person' }];
const TRADE = [{ value: 'quotation', label: 'Quotation' }, { value: 'direct_purchase', label: 'Direct purchase' }, { value: 'pickup', label: 'Pickup' }, { value: 'delivery', label: 'Delivery' }];
const MAX_FILES = 8;

const startForm = (l) => ({
  kind: l?.kind ?? 'product', name: l?.name ?? '', description: l?.description ?? '', category: l?.category?.id ?? '',
  details: l?.details ?? {}, district: l?.location?.district ?? '', sector: l?.location?.sector ?? '',
  priceType: l?.priceType ?? 'fixed', priceMin: l?.priceMin !== undefined ? String(l.priceMin) : '', priceMax: l?.priceMax !== undefined ? String(l.priceMax) : '',
  tracked: l?.stock?.tracked ?? false, quantity: l?.stock?.quantity !== undefined ? String(l.stock.quantity) : '', stockNote: l?.stock?.note ?? '',
  contactMethods: l?.contactMethods ?? ['message'], transactionOptions: l?.transactionOptions ?? ['quotation'],
});

function Form({ listing }) {
  const { t } = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const { categories } = useCategories();
  const [form, setForm] = useState(() => startForm(listing));
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);
  const editing = Boolean(listing);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const options = categories.filter((c) => c.kind === form.kind);
  const category = categories.find((c) => c.id === form.category);

  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.previewUrl)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = (list) => {
    const next = [...files];
    for (const file of Array.from(list)) if (next.length < MAX_FILES) next.push({ file, previewUrl: URL.createObjectURL(file), kind: file.type.startsWith('video/') ? 'video' : 'image' });
    setFiles(next);
    if (fileInput.current) fileInput.current.value = '';
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = {};
    if (form.name.trim().length < 3) found.name = t('Use at least 3 characters');
    if (form.description.trim().length < 10) found.description = t('Use at least 10 characters');
    if (!form.category) found.category = t('Choose a category');
    if (!form.district) found.district = t('Choose a district');
    if ((form.priceType !== 'negotiable') && !/^\d+$/.test(form.priceMin)) found.priceMin = t('Enter a whole number of RWF');
    if (form.priceType === 'range' && !/^\d+$/.test(form.priceMax)) found.priceMax = t('Enter a whole number of RWF');
    if (form.tracked && !/^\d+$/.test(form.quantity)) found.quantity = t('Enter how many are in stock');
    for (const f of category?.requiredFields ?? []) if (f.required && (form.details[f.key] === undefined || form.details[f.key] === '')) found[`details.${f.key}`] = t('Required');
    setErrors(found);
    if (Object.keys(found).length) return;

    const details = {};
    for (const f of category?.requiredFields ?? []) {
      const v = form.details[f.key];
      if (v === undefined || v === '') continue;
      details[f.key] = f.type === 'number' ? Number(v) : v;
    }
    const body = {
      name: form.name.trim(), description: form.description.trim(), category: form.category, details,
      district: form.district, ...(form.sector.trim() ? { sector: form.sector.trim() } : {}),
      priceType: form.priceType,
      ...(form.priceType !== 'negotiable' || form.priceMin ? { priceMin: Number(form.priceMin) } : {}),
      ...(form.priceType === 'range' || (form.priceType === 'negotiable' && form.priceMax) ? { priceMax: Number(form.priceMax) } : {}),
      stock: { tracked: form.tracked, ...(form.tracked ? { quantity: Number(form.quantity) } : {}), ...(form.stockNote.trim() ? { note: form.stockNote.trim() } : {}) },
      contactMethods: form.contactMethods.length ? form.contactMethods : ['message'],
      transactionOptions: form.transactionOptions.length ? form.transactionOptions : ['quotation'],
    };
    setBusy(true);
    try {
      if (editing) {
        await marketApi.update(listing.id, body);
        toast.success(t('Listing updated.'));
        navigate(`/dashboard/market/${listing.id}`);
      } else {
        const mediaIds = [];
        for (const f of files) mediaIds.push((await postApi.uploadMedia(f.file)).data.media.id);
        const { data } = await marketApi.create({ ...body, kind: form.kind, ...(mediaIds.length ? { mediaIds } : {}) });
        toast.success(t('Listing published.'));
        navigate(`/dashboard/market/${data.listing.id}`);
      }
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      setFormError(Object.keys(fe).length ? '' : errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="panel mx-auto max-w-2xl space-y-5 p-5">
      {formError && <Alert tone="error">{formError}</Alert>}
      {!editing && <SelectField label={t('What are you listing?')} value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value, category: '', details: {} }))} options={[{ value: 'product', label: t('A product for sale') }, { value: 'business', label: t('A business, shop or place') }]} />}
      <TextField label={t('Name')} value={form.name} onChange={set('name')} error={errors.name} maxLength={120} required />
      <TextAreaField label={t('Description')} value={form.description} onChange={set('description')} error={errors.description} maxLength={4000} rows={5} required />
      <SelectField label={t('Category')} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value, details: {} }))} error={errors.category} placeholder={t('Choose a category')} options={options.map((c) => ({ value: c.id, label: c.name }))} required />
      {category?.requiredFields?.length > 0 && (
        <fieldset className="space-y-4 rounded-lg border border-ink-100 p-4">
          <legend className="px-1 text-sm font-semibold">{t('Details for {category}', { category: category.name })}</legend>
          {category.requiredFields.map((f) => {
            const key = `details.${f.key}`;
            const value = form.details[f.key] ?? '';
            const setDetail = (v) => setForm((x) => ({ ...x, details: { ...x.details, [f.key]: v } }));
            if (f.type === 'yes_no') return <SelectField key={f.key} label={f.label} value={value === '' ? '' : String(value)} onChange={(e) => setDetail(e.target.value === '' ? '' : e.target.value === 'true')} error={errors[key]} placeholder={t('Choose')} options={[{ value: 'true', label: t('Yes') }, { value: 'false', label: t('No') }]} required={f.required} />;
            if (f.type === 'select') return <SelectField key={f.key} label={f.label} value={value} onChange={(e) => setDetail(e.target.value)} error={errors[key]} placeholder={t('Choose')} options={f.options} required={f.required} />;
            return <TextField key={f.key} label={f.label} value={value} inputMode={f.type === 'number' ? 'decimal' : undefined} onChange={(e) => setDetail(e.target.value)} error={errors[key]} maxLength={200} required={f.required} />;
          })}
        </fieldset>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label={t('District')} value={form.district} onChange={set('district')} error={errors.district} placeholder={t('Choose a district')} options={DISTRICTS} required />
        <TextField label={t('Sector (optional)')} value={form.sector} onChange={set('sector')} maxLength={60} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label={t('Price')} value={form.priceType} onChange={set('priceType')} options={[{ value: 'fixed', label: t('Fixed price') }, { value: 'range', label: t('Price range') }, { value: 'negotiable', label: t('Negotiable') }]} />
        <TextField label={form.priceType === 'range' ? t('Lowest (RWF)') : t('Price (RWF)')} inputMode="numeric" value={form.priceMin} onChange={set('priceMin')} error={errors.priceMin} hint={form.priceType === 'negotiable' ? t('Optional guide') : undefined} />
        {form.priceType !== 'fixed' && <TextField label={t('Highest (RWF)')} inputMode="numeric" value={form.priceMax} onChange={set('priceMax')} error={errors.priceMax} hint={form.priceType === 'negotiable' ? t('Optional guide') : undefined} />}
      </div>
      <div className="space-y-3">
        <CheckboxField label={t('Keep track of how many are in stock')} checked={form.tracked} onChange={(e) => setForm((f) => ({ ...f, tracked: e.target.checked }))} />
        {form.tracked && <TextField label={t('In stock')} inputMode="numeric" value={form.quantity} onChange={set('quantity')} error={errors.quantity} />}
        <TextField label={t('Availability note (optional)')} value={form.stockNote} onChange={set('stockNote')} maxLength={200} hint={t('For example “Open Mon–Sat” or “Ready in 2 days”.')} />
      </div>
      <CheckGroup legend={t('How can people reach you?')} hint={t('Your phone number and email stay hidden until you accept a quotation.')} options={CONTACT.map((o) => ({ ...o, label: t(o.label) }))} value={form.contactMethods} onChange={(v) => setForm((f) => ({ ...f, contactMethods: v }))} />
      <CheckGroup legend={t('How do you like to trade?')} options={TRADE.map((o) => ({ ...o, label: t(o.label) }))} value={form.transactionOptions} onChange={(v) => setForm((f) => ({ ...f, transactionOptions: v }))} />
      {!editing ? (
        <div>
          <p className="text-sm font-semibold">{t('Photos and videos')}</p>
          <p className="text-sm text-ink-600">{t('Videos up to {count} seconds', { count: 10 })}</p>
          {files.length > 0 && (
            <ul className="mt-2 grid grid-cols-4 gap-2">
              {files.map((f, i) => (
                <li key={f.previewUrl} className="relative overflow-hidden rounded-lg bg-ink-50">
                  {f.kind === 'video' ? <video src={f.previewUrl} muted className="aspect-square w-full object-cover" /> : <img src={f.previewUrl} alt="" className="aspect-square w-full object-cover" />}
                  <button type="button" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"><Icon name="close" className="h-4 w-4" /><span className="sr-only">{t('Remove')}</span></button>
                </li>
              ))}
            </ul>
          )}
          <input ref={fileInput} id="market-media" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" onChange={(e) => addFiles(e.target.files)} className="sr-only" />
          <label htmlFor="market-media" className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-ink-300 px-3 py-2 text-sm font-semibold hover:bg-ink-50 focus-within:ring-2 focus-within:ring-teal-600"><Icon name="photo" className="h-4 w-4" />{t('Add photos or videos')}</label>
        </div>
      ) : <p className="text-sm text-ink-600">{t('Photos and videos can’t be changed after publishing. Delete the listing and publish it again to change them.')}</p>}
      <div className="flex flex-wrap justify-end gap-3 pt-2">
        <Link to={editing ? `/dashboard/market/${listing.id}` : '/dashboard/market'} className="inline-flex items-center rounded-lg border border-ink-300 px-4 py-2.5 text-sm font-semibold hover:bg-ink-50">{t('Cancel')}</Link>
        <Button type="submit" loading={busy}>{editing ? t('Save changes') : t('Publish')}</Button>
      </div>
    </form>
  );
}

export default function MarketEditorPage() {
  const { id } = useParams();
  const { t } = useT();
  useDocumentTitle(id ? 'Edit listing' : 'New listing');
  const { data, loading, error, reload } = useAsync((signal) => (id ? marketApi.get(id, signal) : Promise.resolve({ data: null })), [id]);
  return (
    <>
      <PageHeader title={id ? t('Edit listing') : t('New listing')} />
      {loading && <PageLoader label={t('Loading listings')} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {!loading && !error && (!id || data?.listing) && <Form listing={data?.listing} />}
    </>
  );
}
