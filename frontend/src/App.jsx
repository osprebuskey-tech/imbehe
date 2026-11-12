import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './theme/ThemeContext';
import { I18nProvider } from './i18n';
import { PageLoader } from './components/ui/Spinner';
import { router } from './routes';

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <ToastProvider>
            <RouterProvider router={router} fallbackElement={<PageLoader />} />
          </ToastProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
