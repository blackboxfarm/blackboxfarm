import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SiteLayout } from '@/components/layout/SiteLayout';
import { BriefingCard } from '@/components/intel/BriefingCard';
import { CacheBustingTools } from '@/components/intel/CacheBustingTools';
import { cn } from '@/lib/utils';
import { Newspaper, Wrench, X } from 'lucide-react';

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'holder-analysis', label: 'Holder Analysis' },
  { value: 'wallet-tracing', label: 'Wallet Tracing' },
  { value: 'scam-detection', label: 'Scam Detection' },
  { value: 'platform-guides', label: 'Platform Guides' },
  { value: 'market-intel', label: 'Market Intel' },
  { value: 'general', label: 'General' },
];

export default function IntelBriefings() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [showTools, setShowTools] = useState(false);
  // Check if public access is enabled
  const { data: isPublic, isLoading: accessLoading } = useQuery({
    queryKey: ['intel-public-access'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'intel_briefings_public')
        .maybeSingle();
      return data?.value === 'true';
    },
  });

  useEffect(() => {
    document.title = 'Intel Briefings | BlackBox Farm — On-Chain Intelligence Reports';
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'intel-index-jsonld';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Intel Briefings',
      description: 'Authoritative on-chain intelligence reports covering Solana holder analysis, wallet tracing, scam detection, and DeFi market insights by BlackBox Farm.',
      url: 'https://blackbox.farm/intel',
      isPartOf: { '@type': 'WebSite', name: 'BlackBox Farm', url: 'https://blackbox.farm' },
    });
    document.head.appendChild(script);
    return () => { document.getElementById('intel-index-jsonld')?.remove(); };
  }, []);

  const { data: briefings, isLoading } = useQuery({
    queryKey: ['intel-briefings', activeCategory],
    queryFn: async () => {
      let q = supabase
        .from('intel_briefings')
        .select('slug, title, subtitle, category, featured_image_url, published_at, tags')
        .eq('is_published', true)
        .order('published_at', { ascending: false });

      if (activeCategory !== 'all') {
        q = q.eq('category', activeCategory);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  if (!accessLoading && !isPublic) {
    return (
      <SiteLayout>
        <div className="container mx-auto px-4 py-20 text-center">
          <Newspaper className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
          <h1 className="text-2xl font-bold mb-2">Coming Soon</h1>
          <p className="text-muted-foreground">Intel Briefings are currently being prepared. Check back soon.</p>
        </div>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-8 md:py-12">
        {/* Hero */}
        <div className="text-center mb-10 space-y-3">
          <div className="flex items-center justify-center gap-2 text-primary">
            <Newspaper className="h-6 w-6" />
            <span className="text-sm font-semibold uppercase tracking-widest">Intel Briefings</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            On-Chain Intelligence Reports
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Deep-dive analysis on Solana holder patterns, wallet tracing methodology, scam detection frameworks, and DeFi market intelligence — by BlackBox Research.
          </p>
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-6 scrollbar-hide">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setActiveCategory(cat.value)}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors',
                activeCategory === cat.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card animate-pulse h-72" />
            ))}
          </div>
        ) : briefings && briefings.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {briefings.map((b) => (
              <BriefingCard key={b.slug} {...b} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 text-muted-foreground">
            <Newspaper className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">No briefings published yet.</p>
            <p className="text-sm">Check back soon for on-chain intelligence reports.</p>
          </div>
        )}
      </div>
    </SiteLayout>
  );
}
