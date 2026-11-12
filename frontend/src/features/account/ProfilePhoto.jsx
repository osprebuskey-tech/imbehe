import { useState } from 'react';
import Avatar from '../../components/ui/Avatar';
import Button from '../../components/ui/Button';
import FileButton from '../../components/ui/FileButton';
import { Alert } from '../../components/ui/feedback';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { authApi } from '../../services/authApi';
import { checkImage, MAX_IMAGE_MB } from '../providers/AvatarUploader';
import { errorMessage } from '../../utils/errors';
import Tx from '../../components/Tx';

/** Everyone's profile picture (customers, providers, businesses, staff). It can be added, changed or removed at any time. */
export default function ProfilePhoto() {
  const { user, setCurrentUser } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const upload = async (file) => {
    const problem = checkImage(file);
    if (problem) { setError(problem); return; }
    setError('');
    setBusy(true);
    try {
      const { data } = await authApi.uploadAvatar(file);
      setCurrentUser(data.user);
      toast.success('Profile photo updated.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setError('');
    setBusy(true);
    try {
      const { data } = await authApi.removeAvatar();
      setCurrentUser(data.user);
      toast.success('Profile photo removed.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const changeCover = async (call, okMessage) => {
    setError('');
    setBusy(true);
    try {
      const { data } = await call();
      setCurrentUser(data.user);
      toast.success(okMessage);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const uploadCover = (file) => {
    const problem = checkImage(file);
    if (problem) { setError(problem); return; }
    changeCover(() => authApi.uploadCover(file), 'Cover image updated.');
  };

  return (
    <section id="profile-photo" className="panel mb-6 scroll-mt-24 p-6" aria-labelledby="photo-title">
      <h2 id="photo-title" className="mb-1 text-xl font-semibold"><Tx>Profile photo</Tx></h2>
      <p className="mb-4 text-ink-700"><Tx>Shown next to your name on posts, messages and your profile. You can change it whenever you like.</Tx></p>
      <div className="flex flex-wrap items-center gap-5">
        <Avatar name={user.fullName} src={user.avatarUrl} size="xl" />
        <div>
          <div className="flex flex-wrap gap-2">
            <FileButton onFile={upload} disabled={busy}>{busy ? 'Saving…' : user.avatarUrl ? 'Change photo' : 'Add a photo'}</FileButton>
            {user.avatarUrl && <Button variant="danger" onClick={remove} disabled={busy}>Remove photo</Button>}
          </div>
          <p className="mt-2 text-sm text-ink-600"><Tx>JPEG, PNG or WebP, up to {MAX_IMAGE_MB} MB.</Tx></p>
        </div>
      </div>
      <div className="mt-6 border-t border-ink-100 pt-5">
        <h3 className="mb-1 text-base font-semibold"><Tx>Cover image</Tx></h3>
        <p className="mb-3 text-sm text-ink-700"><Tx>The wide banner at the top of your profile page.</Tx></p>
        {user.coverUrl ? <img src={user.coverUrl} alt="" className="mb-3 h-28 w-full rounded-xl object-cover sm:h-36" /> : <div aria-hidden="true" className="mb-3 h-28 w-full rounded-xl bg-gradient-to-r from-teal-100 to-sage-200 sm:h-36" />}
        <div className="flex flex-wrap gap-2">
          <FileButton onFile={uploadCover} disabled={busy}>{user.coverUrl ? 'Change cover' : 'Add a cover image'}</FileButton>
          {user.coverUrl && <Button variant="danger" onClick={() => changeCover(() => authApi.removeCover(), 'Cover image removed.')} disabled={busy}>Remove cover</Button>}
        </div>
      </div>
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}
    </section>
  );
}
