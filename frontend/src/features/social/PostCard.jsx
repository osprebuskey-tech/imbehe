import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ReportButton from '../moderation/ReportButton';
import MessageButton from '../messages/MessageButton';
import Avatar from '../../components/ui/Avatar';
import Button from '../../components/ui/Button';
import Icon from '../../components/Icon';
import { Alert } from '../../components/ui/feedback';
import { useAuth } from '../../context/AuthContext';
import { useT } from '../../i18n';
import { postApi } from '../../services/postApi';
import { errorMessage } from '../../utils/errors';
import { formatDate } from '../../utils/format';

function Media({ media }) {
  if (!media?.length) return null;
  return (
    <div className={`mt-3 grid gap-1.5 overflow-hidden rounded-xl ${media.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {media.map((m) =>
        m.kind === 'video'
          ? <video key={m.url} src={m.url} controls preload="metadata" playsInline className="max-h-96 w-full bg-black object-cover" />
          : <img key={m.url} src={m.url} alt="" loading="lazy" className="max-h-96 w-full object-cover" />,
      )}
    </div>
  );
}

function Comments({ postId, onCount }) {
  const { t } = useT();
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    postApi.comments(postId, { limit: 50 }).then((res) => { if (live) setItems(res.data ?? []); }).catch((err) => { if (live) setError(errorMessage(err)); });
    return () => { live = false; };
  }, [postId]);

  const add = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await postApi.addComment(postId, text.trim());
      setItems((list) => [...(list || []), data.comment ?? data]);
      setText('');
      onCount(1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (c) => {
    try { await postApi.removeComment(postId, c.id); setItems((list) => list.filter((x) => x.id !== c.id)); onCount(-1); } catch (err) { setError(errorMessage(err)); }
  };

  return (
    <div className="mt-3 border-t border-ink-100 pt-3">
      <ul className="space-y-3">
        {(items || []).map((c) => (
          <li key={c.id} className="flex gap-2">
            <Avatar name={c.author?.fullName} src={c.author?.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1 rounded-lg bg-ink-50 px-3 py-2">
              <p className="text-sm font-semibold">{c.author?.fullName}</p>
              <p className="whitespace-pre-line break-words text-sm text-ink-800">{c.body}</p>
              {user && !(c.mine || user.id === c.author?.id) && <ReportButton targetType="comment" targetId={c.id} />}
              {(c.mine || user?.id === c.author?.id) && <button type="button" onClick={() => remove(c)} className="mt-1 text-xs font-semibold text-rose-700 underline">{t('Delete')}</button>}
            </div>
          </li>
        ))}
      </ul>
      {error && <Alert tone="error" className="mt-2">{error}</Alert>}
      <form onSubmit={add} className="mt-3 flex gap-2">
        <label htmlFor={`c-${postId}`} className="sr-only">{t('Write a comment')}</label>
        <input id={`c-${postId}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={t('Write a comment')} className="input" />
        <Button type="submit" size="sm" loading={busy}>{t('Send')}</Button>
      </form>
    </div>
  );
}

const typeLabel = { business: 'Business', provider: 'Provider' };

/** One post: author, text, media and the actions. Changes are applied on screen at once and rolled back if the server refuses. */
export default function PostCard({ post: initial, onRemoved }) {
  const { t } = useT();
  const { user } = useAuth();
  const [post, setPost] = useState(initial);
  const [showComments, setShowComments] = useState(false);
  const [error, setError] = useState('');

  const patch = (changes) => setPost((p) => ({ ...p, ...changes }));
  const run = async (apply, rollback, call) => {
    setError('');
    apply();
    try { await call(); } catch (err) { rollback(); setError(errorMessage(err)); }
  };

  const toggleLike = () => post.likedByMe
    ? run(() => patch({ likedByMe: false, likeCount: post.likeCount - 1 }), () => patch({ likedByMe: true, likeCount: post.likeCount }), () => postApi.unlike(post.id))
    : run(() => patch({ likedByMe: true, likeCount: post.likeCount + 1 }), () => patch({ likedByMe: false, likeCount: post.likeCount }), () => postApi.like(post.id));
  const toggleSave = () => post.savedByMe
    ? run(() => patch({ savedByMe: false, saveCount: post.saveCount - 1 }), () => patch({ savedByMe: true, saveCount: post.saveCount }), () => postApi.unsave(post.id))
    : run(() => patch({ savedByMe: true, saveCount: post.saveCount + 1 }), () => patch({ savedByMe: false, saveCount: post.saveCount }), () => postApi.save(post.id));
  const toggleFollow = () => post.followingAuthor
    ? run(() => patch({ followingAuthor: false }), () => patch({ followingAuthor: true }), () => postApi.unfollow(post.author.id))
    : run(() => patch({ followingAuthor: true }), () => patch({ followingAuthor: false }), () => postApi.follow(post.author.id));

  const share = async () => {
    const url = `${window.location.origin}/dashboard/feed/${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Imbehe', url });
      else await navigator.clipboard.writeText(url);
      await postApi.share(post.id);
      patch({ shareCount: post.shareCount + 1 });
    } catch (err) {
      if (err?.name !== 'AbortError') setError(errorMessage(err));
    }
  };
  const remove = async () => {
    try { await postApi.remove(post.id); onRemoved?.(post.id); } catch (err) { setError(errorMessage(err)); }
  };

  const action = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600';
  const mine = post.mine || user?.id === post.author?.id;

  return (
    <article className="panel p-4">
      <header className="flex items-center gap-3">
        <Avatar name={post.author.fullName} src={post.author.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold"><Link to={`/dashboard/people/${post.author.id}`} className="hover:underline">{post.author.fullName}</Link></p>
          <p className="text-xs text-ink-600">{typeLabel[post.author.type] ? `${t(typeLabel[post.author.type])} · ` : ''}{formatDate(post.createdAt)}{post.location?.district ? ` · ${post.location.district}` : ''}</p>
        </div>
        {user && !mine && <Button size="sm" variant={post.followingAuthor ? 'outline' : 'primary'} aria-pressed={post.followingAuthor} onClick={toggleFollow}>{post.followingAuthor ? t('Following') : t('Follow')}</Button>}
        {mine && <button type="button" onClick={remove} className="text-xs font-semibold text-rose-700 underline">{t('Delete')}</button>}
      </header>
      {post.caption && <p className="mt-3 whitespace-pre-line break-words text-ink-900">{post.caption}</p>}
      {post.hashtags?.length > 0 && <p className="mt-1 flex flex-wrap gap-x-2 text-sm font-medium text-teal-700">{post.hashtags.map((h) => <Link key={h} to={`/dashboard/feed?hashtag=${h}`} className="hover:underline">#{h}</Link>)}</p>}
      <Media media={post.media} />
      {post.listing && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-ink-100 bg-teal-50/50 p-3">
          {post.listing.imageUrl ? <img src={post.listing.imageUrl} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg object-cover" /> : <span aria-hidden="true" className="h-14 w-14 shrink-0 rounded-lg bg-teal-100" />}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{post.listing.name}</p>
            <p className="text-xs text-ink-600">{post.listing.kind === 'business' ? t('Business') : t('Product')}</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Link to={`/dashboard/market/${post.listing.id}`} className="rounded-lg border border-ink-300 px-3 py-1.5 text-sm font-semibold text-ink-900 hover:bg-ink-50">{post.listing.kind === 'business' ? t('View business') : t('View product')}</Link>
            {user && !mine && <Link to={`/dashboard/requests/new?listing=${post.listing.id}`} className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-700">{t('Request a quotation')}</Link>}
          </div>
        </div>
      )}
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}
      <footer className="mt-3 flex flex-wrap items-center gap-1 border-t border-ink-100 pt-2">
        <button type="button" onClick={toggleLike} aria-pressed={post.likedByMe} disabled={!user} className={`${action} ${post.likedByMe ? 'text-rose-700' : ''}`}><Icon name="heart" className="h-5 w-5" filled={post.likedByMe} />{post.likeCount}<span className="sr-only"> {t('Like')}</span></button>
        <button type="button" onClick={() => setShowComments((v) => !v)} aria-expanded={showComments} className={action}><Icon name="comment" className="h-5 w-5" />{post.commentCount}<span className="sr-only"> {t('Comments')}</span></button>
        <button type="button" onClick={share} className={action}><Icon name="share" className="h-5 w-5" />{post.shareCount}<span className="sr-only"> {t('Share')}</span></button>
        {user && !mine && <ReportButton targetType="post" targetId={post.id} />}
        {user && !mine && <MessageButton size="sm" userId={post.author.id} context={{ type: 'post', id: post.id }} />}
        {user && !mine && !post.listing && <Link to={`/dashboard/requests/new?post=${post.id}`} className={action}><span className="text-xs font-semibold">{t('Request a quotation')}</span></Link>}
        <button type="button" onClick={toggleSave} aria-pressed={post.savedByMe} disabled={!user} className={`${action} ml-auto ${post.savedByMe ? 'text-teal-700' : ''}`}><Icon name="bookmark" className="h-5 w-5" filled={post.savedByMe} /><span className="sr-only">{post.savedByMe ? t('Unsave') : t('Save')}</span></button>
      </footer>
      {showComments && <Comments postId={post.id} onCount={(d) => patch({ commentCount: Math.max(0, post.commentCount + d) })} />}
    </article>
  );
}
