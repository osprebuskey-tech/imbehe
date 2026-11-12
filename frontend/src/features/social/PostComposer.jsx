import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { SelectField } from '../../components/ui/Field';
import { useCategories } from '../../hooks/useCategories';
import { marketApi } from '../../services/marketApi';
import { DISTRICTS } from '../../utils/constants';
import { isStaffUser } from './staff';
import Button from '../../components/ui/Button';
import Icon from '../../components/Icon';
import { Alert } from '../../components/ui/feedback';
import { useT } from '../../i18n';
import { postApi } from '../../services/postApi';
import { errorMessage } from '../../utils/errors';

const MAX_SECONDS = 10;
const MAX_FILES = 6;

/** Reads a video's length in the browser so a clip over 10 seconds is refused before it is uploaded. The server checks again. */
function videoSeconds(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    v.src = url;
  });
}

export default function PostComposer({ onPosted }) {
  const { t } = useT();
  const [caption, setCaption] = useState('');
  const [files, setFiles] = useState([]); // [{ file, previewUrl, kind }]
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const { user } = useAuth();
  const { categories } = useCategories();
  const [category, setCategory] = useState('');
  const [district, setDistrict] = useState('');
  const [listingId, setListingId] = useState('');
  const [myListings, setMyListings] = useState([]);

  // Your own active listings, so a post can promote one of them. Not having any (or failing to load them) just hides the choice.
  useEffect(() => {
    if (!user || isStaffUser(user)) return undefined;
    let live = true;
    marketApi.mine({ status: 'active', limit: 50 }).then((res) => { if (live) setMyListings(res.data ?? []); }).catch(() => {});
    return () => { live = false; };
  }, [user]);

  const addFiles = async (list) => {
    setError('');
    const next = [...files];
    for (const file of Array.from(list)) {
      if (next.length >= MAX_FILES) { setError(t('You can add up to {count} photos or videos.', { count: MAX_FILES })); break; }
      const kind = file.type.startsWith('video/') ? 'video' : 'image';
      if (kind === 'video') {
        const seconds = await videoSeconds(file);
        if (seconds !== null && seconds > MAX_SECONDS + 0.25) { setError(t('Videos can be at most {count} seconds long.', { count: MAX_SECONDS })); continue; }
      }
      next.push({ file, previewUrl: URL.createObjectURL(file), kind });
    }
    setFiles(next);
    if (input.current) input.current.value = '';
  };

  const removeFile = (i) => setFiles((f) => f.filter((_, j) => j !== i));

  const submit = async (e) => {
    e.preventDefault();
    if (!caption.trim() && files.length === 0) { setError(t('Write something or add a photo or video.')); return; }
    setBusy(true);
    setError('');
    try {
      const mediaIds = [];
      for (const f of files) mediaIds.push((await postApi.uploadMedia(f.file)).data.media.id);
      const { data } = await postApi.create({ ...(caption.trim() ? { caption: caption.trim() } : {}), ...(mediaIds.length ? { mediaIds } : {}), ...(category ? { category } : {}), ...(district ? { district } : {}), ...(listingId ? { listingId } : {}) });
      files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      setCaption('');
      setFiles([]);
      setCategory('');
      setDistrict('');
      setListingId('');
      onPosted?.(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="panel p-4" aria-label={t('Create a post')}>
      <label htmlFor="post-caption" className="sr-only">{t('What would you like to share?')}</label>
      <textarea id="post-caption" rows={3} maxLength={2000} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={t('What would you like to share? Add #hashtags to be found.')} className="input" />
      {files.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((f, i) => (
            <li key={f.previewUrl} className="relative overflow-hidden rounded-lg bg-ink-50">
              {f.kind === 'video' ? <video src={f.previewUrl} muted className="aspect-square w-full object-cover" /> : <img src={f.previewUrl} alt="" className="aspect-square w-full object-cover" />}
              <button type="button" onClick={() => removeFile(i)} className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"><Icon name="close" className="h-4 w-4" /><span className="sr-only">{t('Remove')}</span></button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="No category" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
        <SelectField label="Location" value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Anywhere" options={DISTRICTS} />
        {myListings.length > 0 && <SelectField className="sm:col-span-2" label="Promote one of your listings" value={listingId} onChange={(e) => setListingId(e.target.value)} placeholder="None" options={myListings.map((l) => ({ value: l.id, label: l.name }))} hint="People can open it or ask you for a quotation straight from the post." />}
      </div>
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <input ref={input} id="post-media" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" onChange={(e) => addFiles(e.target.files)} className="sr-only" />
          <label htmlFor="post-media" className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-ink-300 px-3 py-2 text-sm font-semibold text-ink-900 hover:bg-ink-50 focus-within:ring-2 focus-within:ring-teal-600">
            <Icon name="photo" className="h-4 w-4" />{t('Photo or video')}
          </label>
          <span className="ml-2 text-xs text-ink-600">{t('Videos up to {count} seconds', { count: MAX_SECONDS })}</span>
        </div>
        <Button type="submit" loading={busy}>{t('Post')}</Button>
      </div>
    </form>
  );
}
