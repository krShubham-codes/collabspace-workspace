import PageView from '@/components/PageView';

export default function Page({ params }) {
  return <PageView id={params.id} />;
}
