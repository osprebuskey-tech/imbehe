import { Link } from 'react-router-dom';
import { useUnreadCounts } from '../hooks/useUnreadCount';
import Icon from './Icon';
import { useT } from '../i18n';

// Three alerts you can tell apart at a glance: a different icon and badge colour for each.
const KINDS = [
  { key: 'message', icon: 'comment', label: 'Messages', to: '/dashboard/messages', badge: 'bg-teal-600 text-white' },
  { key: 'quotation', icon: 'document', label: 'Quotations', to: '/dashboard/notifications?tab=quotations', badge: 'bg-sun-300 text-[#14262a]' },
  { key: 'general', icon: 'bell', label: 'Notifications', to: '/dashboard/notifications?tab=other', badge: 'bg-rose-600 text-white' },
];

/** tone="dark" is for use on the teal header. Shows message, quotation and other notifications as three separate icons. */
export default function NotificationBell({ tone = 'light' }) {
  const { t } = useT();
  const counts = useUnreadCounts();
  return (
    <div className="flex items-center">
      {KINDS.map((k) => {
        const count = counts[k.key];
        return (
          <Link key={k.key} to={k.to} data-kind={k.key} title={t(k.label)} className={`relative rounded-full p-2 ${tone === 'dark' ? 'text-ink-950 hover:bg-ink-900/10' : 'text-ink-800 hover:bg-ink-50'}`}>
            <Icon name={k.icon} className="h-6 w-6" />
            <span className="sr-only">{t(k.label)}{count > 0 ? `, ${t('{count} unread', { count })}` : ''}</span>
            {count > 0 && (
              <span aria-hidden="true" className={`absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold ${k.badge}`}>{count > 99 ? '99+' : count}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
