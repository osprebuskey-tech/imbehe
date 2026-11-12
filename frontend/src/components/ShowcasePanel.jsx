import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from './ui/Avatar';
import VerifiedBadge from './ui/VerifiedBadge';
import { useAsync } from '../hooks/useAsync';
import { showcaseApi } from '../services/showcaseApi';
import { useT } from '../i18n';

const SECONDS = 6;
const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The tall rounded panel on the welcome page: pictures and short videos posted by verified people, one at a time. Renders nothing until there are some. */
export default function ShowcasePanel({ posts: given }) {
  const { t } = useT();
  const loaded = useAsync((signal) => (given ? Promise.resolve({ data: given }) : showcaseApi.list(signal)), []);
  const posts = (loaded.data ?? []).filter((p) => p.media?.length);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = posts.length;

  // Moves on by itself, unless the person asked their device for less motion or is pointing at / focused in the panel.
  useEffect(() => {
    if (count < 2 || paused || prefersReducedMotion()) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), SECONDS * 1000);
    return () => clearInterval(timer);
  }, [count, paused]);

  if (!count) return null;
  const post = posts[index % count];
  const m = post.media[0];
  const go = (step) => setIndex((i) => (i + step + count) % count);

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t('Posts from verified people')}
      className="relative mx-auto flex h-[26rem] w-full max-w-sm flex-col overflow-hidden rounded-[2rem] border-2 border-teal-600 bg-ink-950 shadow-lg sm:h-[30rem] lg:h-[32rem] lg:max-w-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {m.kind === 'video'
        ? <video key={m.url} src={m.url} muted loop playsInline autoPlay={!prefersReducedMotion()} controls={prefersReducedMotion()} aria-label={post.caption || t('Video posted by a verified user')} className="absolute inset-0 h-full w-full object-cover" />
        : <img key={m.url} src={m.url} alt={post.caption || t('Picture posted by a verified user')} className="absolute inset-0 h-full w-full object-cover" />}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/90 via-ink-950/60 to-transparent p-5 pt-20 text-white">
        <Link to={`/dashboard/people/${post.author.id}`} className="flex items-center gap-2.5 hover:underline">
          <Avatar name={post.author.fullName} src={post.author.avatarUrl} size="sm" />
          <span className="min-w-0 truncate font-semibold">{post.author.fullName}</span>
          <VerifiedBadge className="shrink-0 !bg-white/20" />
        </Link>
        {post.caption && <p className="mt-2 line-clamp-2 text-sm text-white/90">{post.caption}</p>}
      </div>

      {count > 1 && (
        <>
          <button type="button" onClick={() => go(-1)} className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink-950 hover:bg-white"><span aria-hidden="true">‹</span><span className="sr-only">{t('Previous')}</span></button>
          <button type="button" onClick={() => go(1)} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink-950 hover:bg-white"><span aria-hidden="true">›</span><span className="sr-only">{t('Next')}</span></button>
          <div className="absolute inset-x-0 top-3 flex justify-center gap-1.5" role="group" aria-label={t('Choose a post')}>
            {posts.map((p, i) => (
              <button key={p.id} type="button" onClick={() => setIndex(i)} aria-current={i === index % count} className={`h-2 rounded-full transition-all ${i === index % count ? 'w-6 bg-white' : 'w-2 bg-white/50'}`}><span className="sr-only">{`${i + 1} / ${count}`}</span></button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
