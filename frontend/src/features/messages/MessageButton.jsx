import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { Alert } from '../../components/ui/feedback';
import { TextAreaField } from '../../components/ui/Field';
import { useT } from '../../i18n';
import { messageApi } from '../../services/messageApi';
import { errorMessage } from '../../utils/errors';

/** "Message" opens a small box; sending starts the conversation (about a listing, request or post when `context` is given) and opens it. */
export default function MessageButton({ userId, context, label, size = 'md', variant = 'outline' }) {
  const { t } = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return <Button size={size} variant={variant} onClick={() => setOpen(true)}>{label || t('Message')}</Button>;

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await messageApi.start({ userId, body: text.trim(), ...(context ? { context } : {}) });
      navigate(`/dashboard/messages/${res.data.conversation.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send} className="w-full space-y-2 rounded-xl border border-ink-200 p-3">
      <TextAreaField label={t('Your message')} rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" loading={busy} disabled={!text.trim()}>{t('Send')}</Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('Cancel')}</Button>
      </div>
    </form>
  );
}
