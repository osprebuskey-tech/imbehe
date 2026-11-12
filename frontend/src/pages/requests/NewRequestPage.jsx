import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import { PageLoader } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/feedback';
import RequestForm from '../../features/requests/RequestForm';
import QuickRequest from '../../features/requests/QuickRequest';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAsync, allowCode } from '../../hooks/useAsync';
import { useCategories } from '../../hooks/useCategories';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { catalogApi } from '../../services/catalogApi';
import { companyApi } from '../../services/companyApi';
import { marketApi } from '../../services/marketApi';
import { requestApi } from '../../services/requestApi';
import { ROLES } from '../../utils/constants';
import Tx from '../../components/Tx';

export default function NewRequestPage() {
  useDocumentTitle('Get a service');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { hasRole } = useAuth();
  const listingId = /^[a-f0-9]{24}$/i.test(params.get('listing') || '') ? params.get('listing') : '';
  const postId = /^[a-f0-9]{24}$/i.test(params.get('post') || '') ? params.get('post') : '';
  // Starting from a listing or a post goes straight to the detailed form, so photos and the link come along.
  const [detailed, setDetailed] = useState(Boolean(listingId || postId));
  const { categories, loading: catsLoading, error: catsError } = useCategories();

  const providerId = /^[a-f0-9]{24}$/i.test(params.get('provider') || '') ? params.get('provider') : '';
  const provider = useAsync(async (signal) => (providerId ? allowCode(catalogApi.getProvider(providerId, signal), 'PROVIDER_NOT_FOUND') : { data: null }), [providerId]);
  const listing = useAsync(async (signal) => (listingId ? allowCode(marketApi.get(listingId, signal), 'LISTING_NOT_FOUND') : { data: null }), [listingId]);
  // Only business accounts that already have a company profile can send a request on the company's behalf.
  const company = useAsync(async (signal) => (hasRole(ROLES.BUSINESS) ? allowCode(companyApi.getMe(signal), 'COMPANY_NOT_FOUND') : { data: null }), []);

  if (catsLoading || provider.loading || company.loading || listing.loading) return <PageLoader label="Loading" />;
  if (catsError) return <ErrorState error={catsError} onRetry={() => window.location.reload()} />;

  const target = provider.data?.provider ? { id: provider.data.provider.id, displayName: provider.data.provider.displayName } : null;
  const categoryParam = /^[a-f0-9]{24}$/i.test(params.get('category') || '') ? params.get('category') : '';
  const source = listing.data?.listing;
  const defaults = { category: source?.category?.id || categoryParam, title: source ? `Quotation for: ${source.name}` : '', ...(source ? { fromListing: source.id } : {}), ...(postId ? { fromPost: postId } : {}) };
  const canUseCompany = Boolean(company.data?.company);

  const create = async (body) => {
    const { data } = await requestApi.create(body);
    toast.success(target ? `Request sent to ${target.displayName}.` : 'Request posted. Matching providers have been told.');
    navigate(`/dashboard/requests/${data.request.id}`);
  };

  return (
    <>
      <PageHeader title="Get a service" description="Tap your way through four quick steps. Providers reply with a price, and you choose." />
      {detailed
        ? (
          <>
            <button type="button" onClick={() => setDetailed(false)} className="mb-5 text-sm font-semibold text-teal-700 underline"><Tx>Back to the quick request</Tx></button>
            <RequestForm categories={categories} provider={target} defaults={defaults} canUseCompany={canUseCompany} onSubmit={create} submitLabel="Send request" />
          </>
        )
        : <QuickRequest categories={categories} provider={target} defaults={defaults} canUseCompany={canUseCompany} onSubmit={create} onNeedMore={() => setDetailed(true)} />}
    </>
  );
}
