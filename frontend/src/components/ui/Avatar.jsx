import { initials } from '../../utils/format';

const sizes = { sm: 'h-9 w-9 text-sm', md: 'h-12 w-12 text-base', lg: 'h-20 w-20 text-2xl', xl: 'h-28 w-28 text-3xl', '2xl': 'h-24 w-24 text-3xl' };

export default function Avatar({ name, src, size = 'md' }) {
  if (src) return <img src={src} alt="" className={`${sizes[size]} shrink-0 rounded-full object-cover ring-1 ring-ink-100`} />;
  return (
    <span aria-hidden="true" className={`${sizes[size]} inline-flex shrink-0 items-center justify-center rounded-full bg-teal-100 font-display font-semibold text-teal-800`}>
      {initials(name)}
    </span>
  );
}
