import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from '@/hooks/use-toast';
import { Copy, Save, Sparkles, Check, Loader2, Wand2 } from 'lucide-react';

const DEPTH_CONFIG = [
  { depth: 1,  label: 'TL;DR',      platform: 'Snippet / summary (no link)', color: 'bg-emerald-500/20 text-emerald-400' },
  { depth: 75, label: '75%', platform: 'Medium / Long-form', color: 'bg-blue-500/20 text-blue-400' },
  { depth: 50, label: '50%', platform: 'Twitter Articles / Fiverr', color: 'bg-amber-500/20 text-amber-400' },
  { depth: 25, label: '25%', platform: 'Reddit / Short-form', color: 'bg-red-500/20 text-red-400' },
  { depth: 0,  label: 'Breadcrumb', platform: 'X / Telegram teaser', color: 'bg-violet-500/20 text-violet-400' },
] as const;

interface Briefing {
  id: string;
  slug: string;
  title: string;
  content_md: string;
  is_published: boolean;
}

interface Variant {
  id: string;
  briefing_id: string;
  depth: number;
  content_md: string;
  updated_at: string;
}

export function ContentCondenser() {
  const queryClient = useQueryClient();
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [editBuffers, setEditBuffers] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const { data: briefings = [] } = useQuery({
    queryKey: ['condenser-briefings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intel_briefings')
        .select('id, slug, title, content_md, is_published')
        .eq('is_published', true)
        .order('published_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Briefing[];
    },
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['condenser-variants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intel_briefing_variants')
        .select('*');
      if (error) throw error;
      return (data ?? []) as Variant[];
    },
  });

  const variantMap = new Map<string, Variant>();
  variants.forEach(v => variantMap.set(`${v.briefing_id}-${v.depth}`, v));

  const totalSlots = briefings.length * DEPTH_CONFIG.length;
  const filledSlots = variants.length;
  const progressPct = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;

  const saveMutation = useMutation({
    mutationFn: async ({ briefingId, depth, content }: { briefingId: string; depth: number; content: string }) => {
      const existing = variantMap.get(`${briefingId}-${depth}`);
      if (existing) {
        const { error } = await supabase
          .from('intel_briefing_variants')
          .update({ content_md: content })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('intel_briefing_variants')
          .insert({ briefing_id: briefingId, depth, content_md: content });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['condenser-variants'] });
      toast({ title: 'Saved' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const handleGenerate = async (briefing: Briefing, depth: number) => {
    const key = `${briefing.id}-${depth}`;
    setGeneratingKey(key);

    const cfg = DEPTH_CONFIG.find(d => d.depth === depth)!;
    const backlink = `\n\n---\n*Read the full deep-dive at [blackbox.farm/intel/briefing/${briefing.slug}](https://blackbox.farm/intel/briefing/${briefing.slug})*`;

    let instruction = '';
    if (depth === 75) {
      instruction = `Rewrite the following article at approximately 75% of its original length. Preserve all key arguments, data points, statistics, and structure. Maintain the same authoritative tone. Do NOT add any new information. End the article with this exact backlink:\n${backlink}`;
    } else if (depth === 50) {
      instruction = `Condense the following article to approximately 50% of its original length. Keep the core thesis, key statistics, and the 2-3 strongest points. Use a slightly more conversational tone suitable for social media articles. Do NOT add new information. End with this exact backlink:\n${backlink}`;
    } else if (depth === 25) {
      instruction = `Create a punchy summary of the following article at approximately 25% of its original length. Lead with the hook, include 1-2 key insights and the most impactful statistic. Make it compelling for Reddit/short-form platforms. Do NOT add new information. End with this exact backlink:\n${backlink}`;
    } else if (depth === 1) {
      instruction = `Write a TL;DR summary of the following article in 2-3 sentences (max ~300 characters total). Capture the core thesis and the single most important takeaway. Plain prose only — no hashtags, no link, no "TL;DR:" prefix, no preamble. Output ONLY the summary text.`;
    } else {
      // breadcrumb (depth = 0)
      instruction = `Compose a 2-3 sentence teaser/breadcrumb post (max ~280 characters total) suitable for Twitter/X or Telegram. Lead with the most provocative hook from the article. End with this exact link back: https://blackbox.farm/intel/briefing/${briefing.slug}. No hashtags unless they appear in the original article. Output ONLY the teaser text — no preamble.`;
    }

    try {
      const { data, error } = await supabase.functions.invoke('condense-article', {
        body: { instruction, content: briefing.content_md },
      });

      if (error) throw error;
      const condensed = data?.result || data?.content || '';
      setEditBuffers(prev => ({ ...prev, [key]: condensed }));
      // Auto-save
      await saveMutation.mutateAsync({ briefingId: briefing.id, depth, content: condensed });
    } catch (e: any) {
      toast({ title: 'Generation failed', description: e.message, variant: 'destructive' });
    } finally {
      setGeneratingKey(null);
    }
  };

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    toast({ title: 'Copied to clipboard' });
  };

  const getContent = (briefingId: string, depth: number): string => {
    const key = `${briefingId}-${depth}`;
    if (editBuffers[key] !== undefined) return editBuffers[key];
    const variant = variantMap.get(key);
    return variant?.content_md || '';
  };

  const setBuffer = (briefingId: string, depth: number, value: string) => {
    setEditBuffers(prev => ({ ...prev, [`${briefingId}-${depth}`]: value }));
  };

  // ---- Backfill TL;DR for every published article missing one ----
  const [backfilling, setBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<{ done: number; total: number } | null>(null);

  const tldrMissing = briefings.filter(b => {
    const v = variantMap.get(`${b.id}-1`);
    return !v || !(v.content_md || '').trim();
  });

  const handleBackfillTldr = async () => {
    if (tldrMissing.length === 0) {
      toast({ title: 'Nothing to backfill', description: 'Every published article already has a TL;DR.' });
      return;
    }
    setBackfilling(true);
    setBackfillProgress({ done: 0, total: tldrMissing.length });
    let okCount = 0;
    let failCount = 0;
    for (let i = 0; i < tldrMissing.length; i++) {
      const b = tldrMissing[i];
      try {
        await handleGenerate(b, 1);
        okCount++;
      } catch {
        failCount++;
      }
      setBackfillProgress({ done: i + 1, total: tldrMissing.length });
      // light throttle to be polite to the gateway
      await new Promise(r => setTimeout(r, 800));
    }
    setBackfilling(false);
    setBackfillProgress(null);
    toast({
      title: 'TL;DR backfill complete',
      description: `${okCount} generated${failCount > 0 ? `, ${failCount} failed` : ''}.`,
    });
  };

  return (
    <div className="space-y-4">
      {/* Progress */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Repurpose Coverage</span>
            <span className="text-xs text-muted-foreground">{filledSlots}/{totalSlots} variants ({progressPct}%)</span>
          </div>
          <Progress value={progressPct} className="h-2" />
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
            <span className="text-xs text-muted-foreground">
              TL;DR snippets: <span className="font-mono text-foreground">{briefings.length - tldrMissing.length}/{briefings.length}</span>
              {tldrMissing.length > 0 && <> · <span className="text-amber-400">{tldrMissing.length} missing</span></>}
              {backfillProgress && <> · <span className="text-primary">{backfillProgress.done}/{backfillProgress.total}…</span></>}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBackfillTldr}
              disabled={backfilling || tldrMissing.length === 0}
              className="h-7 text-xs"
            >
              {backfilling ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Wand2 className="h-3 w-3 mr-1" />}
              {backfilling ? 'Backfilling…' : `Backfill TL;DR (${tldrMissing.length})`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {briefings.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No published briefings yet.</p>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {briefings.map((b, idx) => {
            const hasAll = DEPTH_CONFIG.every(d => variantMap.has(`${b.id}-${d.depth}`));
            return (
              <AccordionItem key={b.id} value={b.id} className="border rounded-lg px-2">
                <AccordionTrigger className="hover:no-underline py-3">
                  <div className="flex items-center gap-3 text-left flex-1 min-w-0">
                    <span className="text-xs text-muted-foreground w-5 shrink-0">{idx + 1}</span>
                    <span className="text-sm font-medium truncate">{b.title}</span>
                    {hasAll && <Badge variant="secondary" className="text-[10px] shrink-0">✓ All {DEPTH_CONFIG.length}</Badge>}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <div className="grid gap-3">
                    {DEPTH_CONFIG.map(cfg => {
                      const key = `${b.id}-${cfg.depth}`;
                      const content = getContent(b.id, cfg.depth);
                      const isGenerating = generatingKey === key;
                      const isCopied = copiedKey === key;

                      return (
                        <Card key={cfg.depth} className="border-border/50">
                          <CardHeader className="py-2 px-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge className={cfg.color + ' border-0 text-[10px]'}>{cfg.label}</Badge>
                                <span className="text-xs text-muted-foreground">{cfg.platform}</span>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs"
                                  onClick={() => handleGenerate(b, cfg.depth)}
                                  disabled={isGenerating}
                                >
                                  {isGenerating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                                  {content ? 'Regenerate' : 'Generate'}
                                </Button>
                                {content && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs"
                                      onClick={() => saveMutation.mutate({ briefingId: b.id, depth: cfg.depth, content })}
                                    >
                                      <Save className="h-3 w-3 mr-1" />Save
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs"
                                      onClick={() => handleCopy(key, content)}
                                    >
                                      {isCopied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                                      {isCopied ? 'Copied' : 'Copy'}
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </CardHeader>
                          {content && (
                            <CardContent className="px-3 pb-3 pt-0">
                              <Textarea
                                value={content}
                                onChange={(e) => setBuffer(b.id, cfg.depth, e.target.value)}
                                className="min-h-[120px] text-xs font-mono"
                                placeholder={`${cfg.label} condensed version will appear here...`}
                              />
                            </CardContent>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}
