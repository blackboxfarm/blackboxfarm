import { SiteLayout } from '@/components/layout/SiteLayout';
import AutopsyQueueBody from '@/components/admin/autopsies/AutopsyQueueBody';

export default function AutopsyQueue() {
  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-10 max-w-7xl">
        <AutopsyQueueBody />
      </div>
    </SiteLayout>
  );
}