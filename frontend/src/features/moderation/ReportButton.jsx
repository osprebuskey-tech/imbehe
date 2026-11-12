import { useState } from 'react';
import Button from '../../components/ui/Button';
import { Alert } from '../../components/ui/feedback';
import { SelectField, TextAreaField } from '../../components/ui/Field';
import { useT } from '../../i18n';
import { reportApi } from '../../services/reportApi';
import { errorMessage } from '../../utils/errors';

export const REPORT_REASONS = [
  ['spam', 'Spam or advertising'],
  ['scam', 'Scam or fraud'],
  ['inappropriate', 'Inappropriate content'],
  ['harassment', 'Harassment or abuse'],
  ['false_info', 'False information'],
  ['prohibited_item', 'Item or service not allowed'],
  ['other', 'Something else'],
];

/** A small "Report" link that opens a short form. targetType is post, comment, listing, message or user. */
export default function ReportButton({ targetType, targetId, className = '' }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (done) return <span role="status" className="text-xs text-ink-700">{t('Thank you. A moderator will look at this.')}</span>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={`text-xs font-semibold text-ink-700 underline hover:text-ink-950 ${className}`}>{t('Report')}</button>;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await reportApi.create({ targetType, targetId, reason, ...(details.trim() ? { details: details.trim() } : {}) });
      setDone(true);
    } catch (err) {
      // Reporting the same thing twice is not a problem for the person: treat it as done.
      if (err.status === 409) setDone(true);
      else { setError(errorMessage(err)); setBusy(false); }
    }
  };

  return (
    <form onSubmit={submit} className="mt-2 w-full max-w-sm space-y-2 rounded-xl border border-ink-200 bg-paper p-3 text-left">
      <SelectField label={t('What is wrong?')} value={reason} onChange={(e) => setReason(e.target.value)} options={REPORT_REASONS.map(([value, label]) => ({ value, label: t(label) }))} />
      <TextAreaField label={t('More details (optional)')} rows={2} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} />
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={busy}>{t('Send report')}</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>{t('Cancel')}</Button>
      </div>
    </form>
  );
}
