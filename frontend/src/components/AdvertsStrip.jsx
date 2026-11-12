import { useAsync } from '../hooks/useAsync';
import { advertApi } from '../services/advertApi';
import { useT } from '../i18n';

function Advert({ advert: a, single }) {
  const { t } = useT();
  const card = (
    <figure className="relative overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm transition-shadow group-hover:shadow-md">
      <img src={a.imageUrl} alt={a.title} loading="lazy" className={`w-full object-cover ${single ? 'aspect-[21/9]' : 'aspect-[16/9]'}`} />
      <span className="absolute left-3 top-3 rounded-full bg-sun-300 px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-[#14262a]">{t('Advert')}</span>
      {(a.title || a.text) && (
        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/80 to-transparent p-4 pt-12 text-white">
          <p className="font-display text-lg font-bold sm:text-xl">{a.title}</p>
          {a.text && <p className="mt-0.5 text-sm text-white/90">{a.text}</p>}
        </figcaption>
      )}
    </figure>
  );
  return a.linkUrl
    ? <a href={a.linkUrl} target="_blank" rel="noopener noreferrer sponsored" className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600" aria-label={`${a.title} (${t('opens in a new tab')})`}>{card}</a>
    : <div className="group">{card}</div>;
}

/** Picture adverts the super administrator publishes, shown near the top of the welcome page. Renders nothing until there is one. */
export default function AdvertsStrip() {
  const { data } = useAsync((signal) => advertApi.list(signal), []);
  const { t } = useT();
  if (!data?.length) return null;
  return (
    <section className="container-page py-10" aria-label={t('Adverts')}>
      <ul className={`grid gap-4 ${data.length > 1 ? 'md:grid-cols-2' : ''}`}>
        {data.map((a) => <li key={a.id}><Advert advert={a} single={data.length === 1} /></li>)}
      </ul>
    </section>
  );
}
