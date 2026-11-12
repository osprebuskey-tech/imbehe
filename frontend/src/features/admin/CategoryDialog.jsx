import { useState } from 'react';
import Dialog from '../../components/ui/Dialog';
import Button from '../../components/ui/Button';
import { CheckboxField, SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import TagInput from '../../components/ui/TagInput';
import { Alert } from '../../components/ui/feedback';
import { adminApi } from '../../services/adminApi';
import { errorFor, errorMessage, fieldErrors } from '../../utils/errors';
import Tx from '../../components/Tx';

const KINDS = [
  { value: 'service', label: 'Service (something done for you)' },
  { value: 'product', label: 'Product (something you buy)' },
  { value: 'business', label: 'Business (shop, restaurant, farm, other)' },
];
const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Choice from a list' },
  { value: 'yes_no', label: 'Yes or no' },
];
const toRows = (fields = []) => fields.map((f) => ({ label: f.label, type: f.type, options: (f.options || []).join(', '), required: f.required }));

/** Create (category = null) or edit a category. Mount it only while open so its form always starts fresh. */
function CategoryFormBody({ category, onSaved, onClose }) {
  const [form, setForm] = useState({
    name: category?.name ?? '',
    description: category?.description ?? '',
    subcategories: category?.subcategories?.map((s) => s.name) ?? [],
    kind: category?.kind ?? 'service',
    icon: category?.icon ?? '',
    fields: toRows(category?.requiredFields),
    status: category?.status ?? 'active',
    sortOrder: String(category?.sortOrder ?? 0),
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [image, setImage] = useState(null);
  const setField = (i, patch) => setForm((f) => ({ ...f, fields: f.fields.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = {};
    if (form.name.trim().length < 2) found.name = 'Use at least 2 characters';
    if (!/^\d+$/.test(form.sortOrder)) found.sortOrder = 'Enter a whole number, 0 or higher';
    setErrors(found);
    if (Object.keys(found).length) return;

    const rows = form.fields.filter((r) => r.label.trim());
    for (const r of rows) {
      if (r.type === 'select' && r.options.split(',').map((o) => o.trim()).filter(Boolean).length < 2) found.fields = `“${r.label}” needs at least two choices, separated by commas`;
    }
    if (found.fields) { setErrors(found); return; }

    const body = {
      kind: form.kind,
      ...(form.icon.trim() ? { icon: form.icon.trim().toLowerCase() } : {}),
      requiredFields: rows.map((r) => ({ label: r.label.trim(), type: r.type, required: r.required, ...(r.type === 'select' ? { options: r.options.split(',').map((o) => o.trim()).filter(Boolean) } : {}) })),
      name: form.name.trim(),
      description: form.description.trim(),
      subcategories: form.subcategories,
      status: form.status,
      sortOrder: Number(form.sortOrder),
    };
    setSaving(true);
    try {
      let saved;
      if (category) saved = (await adminApi.updateCategory(category.id, body)).data?.category;
      else saved = (await adminApi.createCategory(body)).data?.category;
      if (image && saved?.id) await adminApi.setCategoryImage(saved.id, image);
      onSaved(category ? 'Category updated.' : 'Category created.');
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(err.code === 'CATEGORY_EXISTS' ? { name: err.message } : fe);
      setFormError(err.code === 'CATEGORY_EXISTS' || Object.keys(fe).length ? '' : errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form id="category-form" onSubmit={submit} noValidate className="space-y-4">
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField label="Name" value={form.name} onChange={set('name')} error={errors.name} maxLength={80} required />
      <TextAreaField label="Description (optional)" value={form.description} onChange={set('description')} error={errors.description} maxLength={300} rows={2} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Type" value={form.kind} onChange={set('kind')} options={KINDS} />
        <TextField label="Icon name (optional)" value={form.icon} onChange={set('icon')} error={errors.icon} maxLength={30} hint="From the app’s icon set, like “tag” or “building”." />
      </div>
      <div>
        <label htmlFor="category-image" className="block text-sm font-semibold text-ink-900"><Tx>Picture (optional)</Tx></label>
        <input id="category-image" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setImage(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm text-ink-700" />
        {category?.imageUrl && !image && <img src={category.imageUrl} alt="" className="mt-2 h-16 w-16 rounded-lg object-cover" />}
      </div>
      <fieldset>
        <legend className="text-sm font-semibold text-ink-900"><Tx>Details every listing must give</Tx></legend>
        <p className="mt-1 text-sm text-ink-700"><Tx>For example “Size” for clothes or “Plot area” for land. Leave empty for none.</Tx></p>
        <ul className="mt-3 space-y-3">
          {form.fields.map((r, i) => (
            <li key={i} className="rounded-lg border border-ink-100 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Label" value={r.label} onChange={(e) => setField(i, { label: e.target.value })} maxLength={60} />
                <SelectField label="Answer type" value={r.type} onChange={(e) => setField(i, { type: e.target.value })} options={FIELD_TYPES} />
              </div>
              {r.type === 'select' && <div className="mt-3"><TextField label="Choices" value={r.options} onChange={(e) => setField(i, { options: e.target.value })} hint="Separate with commas, like “S, M, L”." /></div>}
              <div className="mt-3 flex items-center justify-between gap-3">
                <CheckboxField label="Required" checked={r.required} onChange={(e) => setField(i, { required: e.target.checked })} />
                <Button variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, fields: f.fields.filter((_, j) => j !== i) }))}><Tx>Remove</Tx><span className="sr-only"> {r.label || 'field'}</span></Button>
              </div>
            </li>
          ))}
        </ul>
        {errors.fields && <p role="alert" className="mt-2 text-sm font-medium text-rose-700">{errors.fields}</p>}
        {form.fields.length < 15 && <Button variant="outline" size="sm" className="mt-3" onClick={() => setForm((f) => ({ ...f, fields: [...f.fields, { label: '', type: 'text', options: '', required: true }] }))}><Tx>Add a detail</Tx></Button>}
      </fieldset>
      <TagInput label="Specialties" value={form.subcategories} onChange={(v) => setForm((f) => ({ ...f, subcategories: v }))} maxLength={80} max={30} error={errorFor(errors, 'subcategories')} hint="Type one and press Enter, like “Logo design”." />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Status" value={form.status} onChange={set('status')} options={[{ value: 'active', label: 'Active' }, { value: 'disabled', label: 'Disabled (hidden)' }]} />
        <TextField label="Display order" inputMode="numeric" value={form.sortOrder} onChange={set('sortOrder')} error={errors.sortOrder} hint="Lower numbers come first." />
      </div>
      <div className="flex flex-wrap justify-end gap-3 pt-2">
        <Button variant="outline" onClick={onClose} disabled={saving}><Tx>Cancel</Tx></Button>
        <Button type="submit" loading={saving}>{category ? 'Save changes' : 'Create category'}</Button>
      </div>
    </form>
  );
}

export default function CategoryDialog({ open, category, onClose, onSaved }) {
  return (
    <Dialog open={open} onClose={onClose} title={category ? `Edit ${category.name}` : 'New category'}>
      {open && <CategoryFormBody category={category} onSaved={onSaved} onClose={onClose} />}
    </Dialog>
  );
}
