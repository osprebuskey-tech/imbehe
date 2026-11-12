import { Link, useParams } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import { PageLoader } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/feedback';
import PostCard from '../features/social/PostCard';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useT } from '../i18n';
import { postApi } from '../services/postApi';

// Where "someone liked your post" and shared links land.
export default function PostPage() {
  useDocumentTitle('Post');
  const { t } = useT();
  const { id } = useParams();
  const { data, loading, error, reload } = useAsync((signal) => postApi.get(id, signal), [id]);
  const post = data?.post ?? data;
  return (
    <>
      <PageHeader title={t('Post')} actions={<Link to="/dashboard/feed" className="font-semibold text-teal-700 underline">{t('Back to the feed')}</Link>} />
      <div className="mx-auto max-w-2xl">
        {loading && <PageLoader label={t('Loading posts')} />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {post?.id && <PostCard post={post} />}
      </div>
    </>
  );
}
