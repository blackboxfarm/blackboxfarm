import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Sparkles, Save, Copy, Check, Loader2, RefreshCw } from 'lucide-react';

interface VariantEditorTabProps {
  briefingId: string;
  briefingSlug: string;
  masterContent: string;
  depth: number; // 75 | 50 | 25 | 1 (TL;DR) | 0 (breadcrumb)
  label: string;
  platform: string;
  badgeColor: string;
}

function buildInstruction(depth: number, slug: string): string {
  const backlink = `\n\n---\n*Read the full deep-dive at [blackbox.farm/intel/briefing/${slug}](https://blackbox.farm/intel/briefing/${slug})*`;
  if (depth === 75) {
    return `Rewrite the following article at approximately 75% of its original length. Preserve all key arguments, data points, statistics, and structure. Maintain the same authoritative tone. Do NOT add any new information. End the article with this exact backlink:\n${backlink}`;
  }
  if (depth === 50) {
    return `Condense the following article to approximately 50% of its original length. Keep the core thesis, key statistics, and the 2-3 strongest points. Use a slightly more conversational tone suitable for social media articles. Do NOT add new information. End with this exact backlink:\n${backlink}`;
  }
  if (depth === 25) {
    return `Create a punchy summary of the following article at approximately 25% of its original length. Lead with the hook, include 1-2 key insights and the most impactful statistic. Make it compelling for Reddit/short-form platforms. Do NOT add new information. End with this exact backlink:\n${backlink}`;
  }
  if (depth === 1) {
    // TL;DR snippet — plain prose summary, no link, no preamble.
    return `Write a TL;DR summary of the following article in 2-3 sentences (max ~300 characters total). Capture the core thesis and the single most important takeaway. Plain prose only — no hashtags, no link, no "TL;DR:" prefix, no preamble. Output ONLY the summary text.`;
  }
  // breadcrumb (depth = 0)
  return `Compose a 2-3 sentence teaser/breadcrumb post (max ~280 characters total) suitable for Twitter/X or Telegram. Lead with the most provocative hook from the article. End with this exact link back: https://blackbox.farm/intel/briefing/${slug}. No hashtags unless they appear in the original article. Output ONLY the teaser text — no preamble.`;
}

export function VariantEditorTab({
  briefingId,
  briefingSlug,
  masterContent,
  depth,
  label,
  platform,
  badgeColor,
}: VariantEditorTabProps) {
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [buffer, setBuffer] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: variant } = useQuery({
    queryKey: ['briefing-variant', briefingId, depth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intel_briefing_variants')
        .select('*')
        .eq('briefing_id', briefingId)
        .eq('depth', depth)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!briefingId,
  });

  // Reset buffer when switching briefing/depth
  useEffect(() => { setBuffer(null); }, [briefingId, depth]);

  const content = buffer !== null ? buffer : (variant?.content_md || '');
  const masterLen = masterContent.length || 1;
  const pct = Math.round((content.length / masterLen) * 100);

  const saveMutation = useMutation({
    mutationFn: async (text: string) => {
      if (variant?.id) {
        const { error } = await supabase
          .from('intel_briefing_variants')
          .update({ content_md: text })
          .eq('id', variant.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('intel_briefing_variants')
          .insert({ briefing_id: briefingId, depth, content_md: text });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['briefing-variant', briefingId, depth] });
      queryClient.invalidateQueries({ queryKey: ['condenser-variants'] });
      setBuffer(null);
      toast({ title: 'Saved' });
    },
    onError: (e: any) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  const handleGenerate = async () => {
    if (!masterContent || masterContent.trim().length < 50) {
      toast({ title: 'No master article', description: 'Save the 100% article first.', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('condense-article', {
        body: { instruction: buildInstruction(depth, briefingSlug), content: masterContent },
      });
      if (error) throw error;
      const out = data?.result || data?.content || '';
      setBuffer(out);
      await saveMutation.mutateAsync(out);
    } catch (e: any) {
      toast({ title: 'Generation failed', description: e.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Copied to clipboard' });
  };

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Badge className={`${badgeColor} border-0`}>{label}</Badge>
            <span className="text-xs text-muted-foreground">{platform}</span>
            {content && (
              <span className="text-[10px] text-muted-foreground">
                · {content.length.toLocaleString()} chars · {pct}% of master
              </span>
            )}
            {variant?.updated_at && !buffer && (
              <span className="text-[10px] text-muted-foreground">
                · saved {new Date(variant.updated_at).toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Generating…</>
              ) : content ? (
                <><RefreshCw className="h-3 w-3 mr-1" /> Re-generate</>
              ) : (
                <><Sparkles className="h-3 w-3 mr-1" /> Generate</>
              )}
            </Button>
            {content && buffer !== null && (
              <Button
                size="sm"
                onClick={() => saveMutation.mutate(content)}
                disabled={saveMutation.isPending}
              >
                <Save className="h-3 w-3 mr-1" /> Save
              </Button>
            )}
            {content && (
              <Button size="sm" variant="ghost" onClick={handleCopy}>
                {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {(content || generating) && (
        <CardContent className="pt-0 px-4 pb-4">
          <Textarea
            value={content}
            onChange={(e) => setBuffer(e.target.value)}
            className="min-h-[400px] font-mono text-sm"
            placeholder={`${label} version will appear here after Generate...`}
          />
        </CardContent>
      )}
      {!content && !generating && (
        <CardContent className="pt-0 px-4 pb-4">
          <div className="text-center py-8 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
            No {label} variant yet. Click <strong>Generate</strong> to have AI condense the 100% article down to this size for {platform}.
          </div>
        </CardContent>
      )}
    </Card>
  );
}