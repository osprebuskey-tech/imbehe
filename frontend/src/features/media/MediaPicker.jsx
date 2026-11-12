import { useRef, useState } from 'react';
import Icon from '../../components/Icon';
import { Alert } from '../../components/ui/feedback';
import { useT } from '../../i18n';
import { postApi } from '../../services/postApi';

export const MAX_VIDEO_SECONDS = 10;

/** Reads a video's length in the browser so a clip over 10 seconds is refused before it is uploaded. The server checks again. */
export function videoSeconds(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    v.src = url;
  });
}

/** Uploads the picked files (each only once, even if a later step fails and the person tries again) and returns their ids. */
export async function uploadPicked(items) {
  const ids = [];
  for (const item of items) {
    if (!item.id) item.id = (await postApi.uploadMedia(item.file)).data.media.id;
    ids.push(item.id);
  }
  return ids;
}

/** Photos and short videos for a form. The parent keeps `items` and calls uploadPicked(items) when the form is sent. */
export default function MediaPicker({ items, onChange, max = 3, label, id = 'media-picker' }) {
  const { t } = useT();
  const [error, setError] = useState('');
  const input = useRef(null);

  const add = async (list) => {
    setError('');
    const next = [...items];
    for (const file of Array.from(list)) {
      if (next.length >= max) { setError(t('You can add up to {count} photos or videos.', { count: max })); break; }
      const kind = file.type.startsWith('video/') ? 'video' : 'image';
      if (kind === 'video') {
        const seconds = await videoSeconds(file);
        if (seconds !== null && seconds > MAX_VIDEO_SECONDS + 0.25) { setError(t('Videos can be at most {count} seconds long.', { count: MAX_VIDEO_SECONDS })); continue; }
      }
      next.push({ file, previewUrl: URL.createObjectURL(file), kind });
    }
    onChange(next);
    if (input.current) input.current.value = '';
  };

  const remove = (i) => { URL.revokeObjectURL(items[i].previewUrl); onChange(items.filter((_, j) => j !== i)); };

  return (
    <div>
      {label && <p className="mb-1 text-sm font-semibold">{label}</p>}
      {items.length > 0 && (
        <ul className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {items.map((f, i) => (
            <li key={f.previewUrl} className="relative overflow-hidden rounded-lg bg-ink-50">
              {f.kind === 'video' ? <video src={f.previewUrl} muted className="aspect-square w-full object-cover" /> : <img src={f.previewUrl} alt="" className="aspect-square w-full object-cover" />}
              <button type="button" onClick={() => remove(i)} className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"><Icon name="close" className="h-4 w-4" /><span className="sr-only">{t('Remove')}</span></button>
            </li>
          ))}
        </ul>
      )}
      {error && <Alert tone="error" className="mb-3">{error}</Alert>}
      <input ref={input} id={id} type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" onChange={(e) => add(e.target.files)} className="sr-only" />
      <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-ink-300 px-3 py-2 text-sm font-semibold text-ink-900 hover:bg-ink-50 focus-within:ring-2 focus-within:ring-teal-600">
        <Icon name="photo" className="h-4 w-4" />{t('Photo or video')}
      </label>
      <span className="ml-2 text-xs text-ink-600">{t('Up to {count} files, videos up to {seconds} seconds', { count: max, seconds: MAX_VIDEO_SECONDS })}</span>
    </div>
  );
}

/** Shows media that is already saved (from the API). */
export function MediaGallery({ media = [] }) {
  if (!media.length) return null;
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {media.map((m) => (
        <li key={m.id || m.url} className="overflow-hidden rounded-lg bg-ink-50">
          {m.kind === 'video' ? <video src={m.url} controls preload="metadata" className="aspect-square w-full object-cover" /> : <a href={m.url} target="_blank" rel="noreferrer"><img src={m.url} alt="" loading="lazy" className="aspect-square w-full object-cover" /></a>}
        </li>
      ))}
    </ul>
  );
}
