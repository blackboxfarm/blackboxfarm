import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollText } from 'lucide-react';
import { ArticleContent } from './ArticleMarkdownRenderer';

interface TLDRButtonProps {
  briefingId: string;
  title: string;
}

export function TLDRButton({ briefingId, title }: TLDRButtonProps) {
  const { data: variant, isLoading } = useQuery({
    queryKey: ['briefing-variant', briefingId, 1],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intel_briefing_variants')
        .select('content_md')
        .eq('briefing_id', briefingId)
        .eq('depth', 1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!briefingId,
  });

  if (isLoading || !variant?.content_md) return null;

  return (
    <Dialog>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <button
                type="button"
                aria-label="Read TL;DR summary"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#c9a84c]/40 bg-[#c9a84c]/10 text-[#c9a84c] hover:bg-[#c9a84c]/20 hover:border-[#c9a84c] transition-colors text-xs font-semibold tracking-wider uppercase"
              >
                <ScrollText className="h-3.5 w-3.5" />
                TL;DR
              </button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">Quick 2–3 sentence summary</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="max-w-2xl border-[#c9a84c]/40">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#f0d78c]">
            <ScrollText className="h-5 w-5 text-[#c9a84c]" />
            <span style={{ color: '#f0d78c' }}>TL;DR</span>
          </DialogTitle>
        </DialogHeader>
        <div className="text-xs uppercase tracking-wider text-[#c9a84c]/80 mb-1">{title}</div>
        <div className="leading-relaxed [&_*]:!text-[#f0d78c] [&_a]:!text-[#c9a84c] [&_a:hover]:!underline [&_strong]:!text-[#f0d78c] [&_h1]:!text-[#f0d78c] [&_h2]:!text-[#f0d78c] [&_h3]:!text-[#f0d78c]">
          <ArticleContent content={variant.content_md} />
        </div>
      </DialogContent>
    </Dialog>
  );
}