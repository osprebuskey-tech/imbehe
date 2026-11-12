import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ButtonLink } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import Tx from '../components/Tx';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  const { user } = useAuth();
  return (
    <div className="container-page py-24 text-center">
      <p className="font-display text-6xl font-bold text-rose-700">404</p>
      <h1 className="mt-4 text-3xl font-bold"><Tx>We can’t find that page</Tx></h1>
      <p className="mx-auto mt-2 max-w-md text-ink-700"><Tx>The link may be old or mistyped. Try searching for the service you need instead.</Tx></p>
      <div className="mt-8 flex justify-center gap-3">
        <ButtonLink to="/search"><Tx>Find services</Tx></ButtonLink>
        <ButtonLink to={user ? '/dashboard' : '/'} variant="outline">{user ? 'Back to your dashboard' : 'Go home'}</ButtonLink>
      </div>
      <p className="mt-6 text-sm"><Link to="/categories" className="underline"><Tx>Browse categories</Tx></Link></p>
    </div>
  );
}
