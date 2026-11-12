import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import { Alert } from '../components/ui/feedback';
import AnnouncementBar from '../components/AnnouncementBar';
import Preferences from '../components/Preferences';
import Icon from '../components/Icon';
import { LogoMark } from '../components/Logo';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { RW_PHONE_RE } from '../utils/constants';
import { errorMessage, fieldErrors } from '../utils/errors';
import { useT } from '../i18n';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

/** One box for "email or phone": an @ means email, anything else is read as a Rwandan mobile number. */
export function credentialFrom(value) {
  const v = value.trim();
  if (v.includes('@')) return EMAIL_RE.test(v) ? { email: v } : null;
  const phone = v.replace(/[\s-]/g, '');
  return RW_PHONE_RE.test(phone) ? { phone } : null;
}

function LoginField({ id, label, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-bold text-ink-950">{label}</label>
      {children}
      {error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm font-medium text-rose-700">{error}</p>}
    </div>
  );
}

export default function LoginPage() {
  useDocumentTitle('Log in');
  const { t } = useT();
  const { login, notice, clearNotice, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ identifier: '', password: '', remember: true });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const prev = location.state?.from;
  const from = prev ? `${prev.pathname}${prev.search || ''}` : '/dashboard'; // after logging in you land on your dashboard (the welcome page is for visitors), unless a page that needs an account sent you here
  const message = location.state?.message;
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const next = {};
    const credential = form.identifier.trim() ? credentialFrom(form.identifier) : null;
    if (!form.identifier.trim()) next.identifier = t('Enter your email address or phone number');
    else if (!credential) next.identifier = t('Enter a valid email address or Rwandan mobile number');
    if (!form.password) next.password = t('Enter your password');
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    clearNotice();
    try {
      await login({ ...credential, password: form.password, remember: form.remember });
      navigate(from, { replace: true });
    } catch (err) {
      const found = fieldErrors(err);
      setErrors(found.email || found.phone ? { identifier: found.email || found.phone } : found);
      setFormError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper">
      <AnnouncementBar />

      {/* Banner: the palette's teal, with the four colours as a thin rule along the top. */}
      <header className="relative overflow-hidden bg-teal-700 text-white">
        <div className="absolute inset-x-0 top-0 h-1 bg-brand-gradient" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-sun-300/25 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-sage-300/30 blur-3xl" />
        <div className="container-page relative pb-12 pt-6 sm:pb-16">
          <div className="flex items-center justify-between gap-3">
            <Link to="/" className="inline-flex items-center gap-2 rounded-md text-sm font-semibold text-white hover:underline focus-visible:ring-white focus-visible:ring-offset-teal-700">
              <Icon name="arrowleft" className="h-4 w-4" />{t('Back to Home')}
            </Link>
            <Preferences className="[&_*]:!text-white [&_select]:!border-white/40 [&_button]:!border-white/40 [&_option]:!text-ink-900" />
          </div>
          <h1 className="mt-10 font-display text-4xl font-bold tracking-tight !text-white sm:text-5xl">{t('Welcome back')}</h1>
          <p className="mt-3 max-w-xl text-lg text-teal-50">{t('Welcome back. Log in to manage your profile, services and account.')}</p>
        </div>
      </header>

      <main id="content" className="container-page pb-16">
        <div className="mx-auto -mt-6 grid max-w-4xl overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-lg md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {/* Form */}
          <section className="p-6 sm:p-10" aria-labelledby="login-title">
            <h2 id="login-title" className="text-2xl font-bold">{t('Log in')}</h2>

            {user && <Alert tone="info" className="mt-4">{t('You’re already logged in.')} <Link to="/dashboard" className="font-semibold underline">{t('Go to your dashboard')}</Link>.</Alert>}
            {notice && <Alert tone="warning" className="mt-4">{notice}</Alert>}
            {message && !notice && <Alert tone="success" className="mt-4">{message}</Alert>}
            {formError && <Alert tone="error" className="mt-4">{formError}</Alert>}

            <form onSubmit={submit} noValidate className="mt-6 space-y-5">
              <LoginField id="login-identifier" label={t('Email or phone number')} error={errors.identifier}>
                <input
                  id="login-identifier"
                  className="input"
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  placeholder="you@example.com or 07XXXXXXXXX"
                  value={form.identifier}
                  onChange={set('identifier')}
                  aria-invalid={errors.identifier ? 'true' : undefined}
                  aria-describedby={errors.identifier ? 'login-identifier-error' : undefined}
                />
              </LoginField>

              <LoginField id="login-password" label={t('Password')} error={errors.password}>
                <div className="relative">
                  <input
                    id="login-password"
                    className="input pr-12"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder={t('Enter your password')}
                    value={form.password}
                    onChange={set('password')}
                    aria-invalid={errors.password ? 'true' : undefined}
                    aria-describedby={errors.password ? 'login-password-error' : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-ink-600 hover:text-ink-950"
                  >
                    <Icon name={showPassword ? 'eyeoff' : 'eye'} />
                    <span className="sr-only">{showPassword ? t('Hide password') : t('Show password')}</span>
                  </button>
                </div>
              </LoginField>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input type="checkbox" checked={form.remember} onChange={(e) => setForm((f) => ({ ...f, remember: e.target.checked }))} className="h-5 w-5 rounded accent-teal-700" aria-describedby="remember-hint" />
                  <span className="font-medium text-ink-900">{t('Keep me signed in on this device')}</span>
                </label>
                <Link to="/forgot-password" className="font-semibold text-teal-700 hover:underline">{t('Forgot your password?')}</Link>
              </div>
              <p id="remember-hint" className="-mt-2 text-sm text-ink-600">{t('Stay signed in until you log out. Don’t use this on a shared computer. Administrators and finance staff are always signed out after an hour.')}</p>

              <Button type="submit" size="lg" className="w-full" loading={loading}>{t('Log in')}</Button>
            </form>

            <p className="mt-6 border-t border-ink-100 pt-6 text-center text-ink-700">
              {t('New to Imbehe?')} <Link to="/register" className="font-bold text-teal-800 underline">{t('Create an account')}</Link>
            </p>
          </section>

          {/* Side panel (below the form on small screens) */}
          <aside className="flex flex-col items-center justify-center bg-teal-800 p-8 text-center text-white sm:p-10">
            <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 ring-4 ring-white/20"><LogoMark className="h-16 w-16" /></span>
            <p className="mt-6 font-display text-2xl font-bold">{t('Welcome back')}</p>
            <div aria-hidden="true" className="mt-3 h-1 w-14 rounded bg-sun-300" />
            <p className="mt-5 max-w-xs text-teal-50">{t('Log in with your email or phone number to access your account.')}</p>
            <div className="mt-8 w-full max-w-xs border-t border-white/25 pt-5">
              <p className="inline-flex items-center gap-2 text-sm text-teal-50"><Icon name="shield" className="h-4 w-4" />{t('Secure & Encrypted')}</p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
