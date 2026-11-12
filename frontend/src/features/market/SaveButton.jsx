import { useState } from 'react';
import Icon from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import { useT } from '../../i18n';
import { marketApi } from '../../services/marketApi';

/** A heart that saves a listing to come back to. Hidden for guests and for the listing's own owner. */
export default function SaveButton({ listing, className = '' }) {
  const { t } = useT();
  const { user } = useAuth();
  const [saved, setSaved] = useState(Boolean(listing.saved));
  const [busy, setBusy] = useState(false);
  if (!user || listing.mine) return null;

  const toggle = async () => {
    setBusy(true);
    const next = !saved;
    setSaved(next); // show the change at once, undo it if the server says no
    try {
      await (next ? marketApi.save(listing.id) : marketApi.unsave(listing.id));
    } catch {
      setSaved(!next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" disabled={busy} aria-pressed={saved} onClick={toggle} className={`rounded-full bg-white/90 p-2 text-rose-600 shadow hover:bg-white focus-visible:ring-2 focus-visible:ring-teal-600 ${className}`}>
      <Icon name="heart" filled={saved} className="h-5 w-5" />
      <span className="sr-only">{saved ? t('Remove from saved') : t('Save')}</span>
    </button>
  );
}
