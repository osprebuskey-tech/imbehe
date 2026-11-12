import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import PageHeader from '../components/ui/PageHeader';
import { PageLoader } from '../components/ui/Spinner';
import { Alert, EmptyState, ErrorState } from '../components/ui/feedback';
import { useMessageStream } from '../hooks/useMessageStream';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useT } from '../i18n';
import ReportButton from '../features/moderation/ReportButton';
import { messageApi } from '../services/messageApi';
import { errorMessage } from '../utils/errors';
import { formatDate } from '../utils/format';

const POLL_MS = 30000; // a safety net only: new messages arrive live through the stream
const CONTEXT_LINK = { listing: (id) => `/dashboard/market/${id}`, request: (id) => `/dashboard/requests/${id}`, post: (id) => `/dashboard/feed/${id}` };

function Inbox({ activeId }) {
  const { t } = useT();
  const [state, setState] = useState({ loading: true });
  const load = useCallback(async () => {
    try {
      const res = await messageApi.list({ limit: 50 });
      setState({ items: res.data.conversations });
    } catch (err) {
      setState((s) => (s.items ? s : { error: errorMessage(err) }));
    }
  }, []);
  useEffect(() => { load(); const timer = setInterval(load, POLL_MS); return () => clearInterval(timer); }, [load, activeId]);
  useMessageStream(load);

  if (state.loading) return <PageLoader />;
  if (state.error) return <ErrorState message={state.error} onRetry={load} />;
  if (!state.items.length) return <EmptyState title={t('No conversations yet')} description={t('Message a provider from a listing or a post to start one.')} />;
  return (
    <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
      {state.items.map((c) => (
        <li key={c.id}>
          <Link to={`/dashboard/messages/${c.id}`} className={`flex items-center gap-3 p-3 hover:bg-ink-50 ${c.id === activeId ? 'bg-ink-50' : ''}`}>
            <Avatar name={c.other.fullName} src={c.other.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{c.other.fullName}</span>
              <span className="block truncate text-sm text-ink-600">{c.lastMessage ? `${c.lastMessage.mine ? `${t('You')}: ` : ''}${c.lastMessage.body}` : ''}</span>
            </span>
            {c.unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-xs font-bold text-white"><span className="sr-only">{t('{count} unread', { count: c.unread })}</span><span aria-hidden="true">{c.unread}</span></span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Thread({ id }) {
  const { t } = useT();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const bottom = useRef(null);
  const newest = useRef('');

  const load = useCallback(async () => {
    try {
      const res = await messageApi.thread(id, { limit: 50 });
      setData({ conversation: res.data.conversation, messages: [...res.data.messages].reverse(), hasMore: res.data.hasMore });
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id]);
  useEffect(() => { setData(null); load(); const timer = setInterval(load, POLL_MS); return () => clearInterval(timer); }, [load]);
  useMessageStream(load);

  const last = data?.messages.at(-1)?.id ?? '';
  useEffect(() => { if (last && last !== newest.current) { newest.current = last; bottom.current?.scrollIntoView({ block: 'end' }); } }, [last]);

  const older = async () => {
    const first = data.messages[0]?.id;
    const res = await messageApi.thread(id, { limit: 50, before: first });
    setData((d) => ({ ...d, messages: [...[...res.data.messages].reverse(), ...d.messages], hasMore: res.data.hasMore }));
  };

  const send = async (e) => {
    e.preventDefault();
    setSending(true);
    setSendError('');
    try {
      await messageApi.send(id, text.trim());
      setText('');
      await load();
    } catch (err) {
      setSendError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const toggleBlock = async () => {
    const c = data.conversation;
    await (c.blockedByMe ? messageApi.unblock(c.other.id) : messageApi.block(c.other.id));
    load();
  };

  if (error && !data) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <PageLoader />;
  const { conversation: c, messages } = data;
  return (
    <section className="flex h-[70vh] flex-col rounded-xl border border-ink-200" aria-label={t('Conversation with {name}', { name: c.other.fullName })}>
      <header className="flex items-center gap-3 border-b border-ink-100 p-3">
        <button type="button" className="text-sm font-semibold underline lg:hidden" onClick={() => navigate('/dashboard/messages')}>{t('Back')}</button>
        <Avatar name={c.other.fullName} src={c.other.avatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold"><Link to={`/dashboard/people/${c.other.id}`} className="hover:underline">{c.other.fullName}</Link></p>
          {c.context && <Link to={CONTEXT_LINK[c.context.type](c.context.id)} className="block truncate text-xs text-teal-800 underline">{t('About: {title}', { title: c.context.title })}</Link>}
        </div>
        <Button size="sm" variant="outline" onClick={toggleBlock}>{c.blockedByMe ? t('Unblock') : t('Block')}</Button>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
        {data.hasMore && <div className="text-center"><Button size="sm" variant="outline" onClick={older}>{t('Earlier messages')}</Button></div>}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.mine ? 'bg-teal-700 text-white' : 'bg-ink-100 text-ink-900'}`}>
              <p className="whitespace-pre-wrap break-words">{m.removed ? <em>{t('This message was removed by a moderator.')}</em> : m.body}</p>
              <p className={`mt-1 text-[11px] ${m.mine ? 'text-white/80' : 'text-ink-600'}`}>{formatDate(m.createdAt)}</p>
              {!m.mine && !m.removed && <ReportButton targetType="message" targetId={m.id} />}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="border-t border-ink-100 p-3">
        {sendError && <Alert tone="error" className="mb-2">{sendError}</Alert>}
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="message-text">{t('Your message')}</label>
          <textarea id="message-text" rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} className="flex-1 rounded-lg border border-ink-300 p-2 text-sm" placeholder={t('Write a message')} />
          <Button type="submit" loading={sending} disabled={!text.trim()}>{t('Send')}</Button>
        </div>
      </form>
    </section>
  );
}

export default function MessagesPage() {
  useDocumentTitle('Messages');
  const { t } = useT();
  const { id } = useParams();
  return (
    <>
      <PageHeader title={t('Messages')} subtitle={t('Private conversations with providers, businesses and customers.')} />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className={id ? 'hidden lg:block' : ''}><Inbox activeId={id} /></div>
        <div>{id ? <Thread key={id} id={id} /> : <p className="hidden rounded-xl border border-dashed border-ink-200 p-8 text-center text-ink-600 lg:block">{t('Choose a conversation.')}</p>}</div>
      </div>
    </>
  );
}
