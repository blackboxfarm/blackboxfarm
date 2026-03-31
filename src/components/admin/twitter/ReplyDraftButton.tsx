import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Copy, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ReplyDraftButtonProps {
  tweetText: string;
  tweetAuthor?: string;
  detectedTickers?: string[];
  detectedContracts?: string[];
}

type Tone = 'casual' | 'analytical' | 'degen';

export function ReplyDraftButton({
  tweetText,
  tweetAuthor,
  detectedTickers,
  detectedContracts,
}: ReplyDraftButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [tone, setTone] = useState<Tone>('casual');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [hasTokenData, setHasTokenData] = useState(false);

  const generateDrafts = async (selectedTone: Tone) => {
    setIsLoading(true);
    setDrafts([]);
    setTone(selectedTone);

    try {
      const { data, error } = await supabase.functions.invoke('generate-reply-draft', {
        body: {
          tweet_text: tweetText,
          tweet_author: tweetAuthor,
          detected_tickers: detectedTickers,
          detected_contracts: detectedContracts,
          tone: selectedTone,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to generate drafts');

      setDrafts(data.drafts);
      setHasTokenData(data.token_context);
    } catch (error: any) {
      console.error('Draft generation error:', error);
      toast.error(error.message || 'Failed to generate reply drafts');
    } finally {
      setIsLoading(false);
    }
  };

  const copyDraft = async (draft: string, index: number) => {
    await navigator.clipboard.writeText(draft);
    setCopiedIndex(index);
    toast.success('Reply copied to clipboard!');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-sky-400"
        onClick={() => {
          setIsOpen(true);
          generateDrafts('casual');
        }}
        title="Draft AI Reply"
      >
        <MessageSquare className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <div className="mt-3 p-3 rounded-lg border border-sky-500/30 bg-sky-500/5 space-y-3">
      {/* Tone selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Tone:</span>
        {(['casual', 'analytical', 'degen'] as const).map((t) => (
          <Badge
            key={t}
            variant="outline"
            className={cn(
              "cursor-pointer text-xs transition-colors",
              tone === t
                ? "bg-sky-500/20 text-sky-400 border-sky-500/50"
                : "hover:bg-muted"
            )}
            onClick={() => generateDrafts(t)}
          >
            {t === 'casual' && '💬 Casual'}
            {t === 'analytical' && '📊 Analytical'}
            {t === 'degen' && '🦍 Degen'}
          </Badge>
        ))}
        {hasTokenData && (
          <Badge variant="outline" className="text-xs bg-green-500/20 text-green-400 border-green-500/50 ml-auto">
            ✓ Token data found
          </Badge>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs ml-auto"
          onClick={() => { setIsOpen(false); setDrafts([]); }}
        >
          Close
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Generating {tone} replies...</span>
        </div>
      )}

      {/* Drafts */}
      {drafts.length > 0 && (
        <div className="space-y-2">
          {drafts.map((draft, i) => (
            <div
              key={i}
              className="flex items-start gap-2 p-2 rounded border border-border/50 bg-card/50 hover:bg-card/80 transition-colors"
            >
              <span className="text-xs text-muted-foreground mt-1 shrink-0">#{i + 1}</span>
              <p className="text-sm flex-1">{draft}</p>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => copyDraft(draft, i)}
              >
                {copiedIndex === i ? (
                  <Check className="h-3.5 w-3.5 text-green-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
