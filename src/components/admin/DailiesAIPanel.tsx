import React, { useState, useEffect } from 'react';
import { X, Loader2, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DailiesAIPanelProps {
  tokenMint: string;
  tokenSymbol: string | null;
  onClose: () => void;
}

type Tone = 'balanced' | 'constructive' | 'cautionary';
type SelectedText = 'overview' | 'summary' | null;

export function DailiesAIPanel({ tokenMint, tokenSymbol, onClose }: DailiesAIPanelProps) {
  const [tone, setTone] = useState<Tone>('constructive');
  const [statusOverview, setStatusOverview] = useState('');
  const [socialSummary, setSocialSummary] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [selectedText, setSelectedText] = useState<SelectedText>(null);

  // Auto-generate on mount and when tone changes
  useEffect(() => {
    generateAnalysis();
  }, [tone]);

  const generateAnalysis = async () => {
    setIsLoading(true);
    setHasGenerated(false);

    try {
      // Step 1: Fetch holder report data
      const { data: reportData, error: reportError } = await supabase.functions.invoke('bagless-holders-report', {
        body: { tokenMint }
      });

      if (reportError) throw new Error(reportError.message || 'Failed to fetch holder data');
      if (reportData?.error) throw new Error(reportData.error);

      // Step 2: Call AI interpreter with forceMode: "A" and selected tone
      const { data: aiData, error: aiError } = await supabase.functions.invoke('token-ai-interpreter', {
        body: { 
          reportData, 
          tokenMint, 
          forceRefresh: true,
          tone,
          forceMode: 'A'
        }
      });

      if (aiError) throw new Error(aiError.message || 'Failed to generate AI analysis');
      if (aiData?.error) throw new Error(aiData.error);

      // Extract the interpretation
      const interpretation = aiData?.interpretation;
      if (interpretation) {
        setStatusOverview(interpretation.status_overview || '');
        setSocialSummary(interpretation.abbreviated_summary || '');
        setHasGenerated(true);
      } else {
        throw new Error('No interpretation returned');
      }

    } catch (error) {
      console.error('AI generation error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate analysis');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePost = async () => {
    // Determine which text to post based on selection
    const textToPost = selectedText === 'overview' ? statusOverview.trim() : 
                       selectedText === 'summary' ? socialSummary.trim() : '';

    if (!textToPost) {
      toast.error('Please select a text to post');
      return;
    }

    setIsPosting(true);

    try {
      // Build tweet text with token symbol prefix
      const tweetText = tokenSymbol 
        ? `$${tokenSymbol}\n\n${textToPost}`
        : textToPost;

      const { data, error } = await supabase.functions.invoke('post-share-card-twitter', {
        body: { 
          tweetText,
          twitterHandle: 'HoldersIntel'
        }
      });

      if (error) throw new Error(error.message || 'Failed to post to X');
      if (data?.error) throw new Error(data.error);

      if (data?.success) {
        toast.success('Posted to @HoldersIntel!', {
          action: data.tweetUrl ? {
            label: 'View',
            onClick: () => window.open(data.tweetUrl, '_blank')
          } : undefined
        });
        onClose();
      } else {
        throw new Error('Post failed');
      }

    } catch (error) {
      console.error('Post error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to post');
    } finally {
      setIsPosting(false);
    }
  };

  // Character count for selected text
  const selectedContent = selectedText === 'overview' ? statusOverview : 
                          selectedText === 'summary' ? socialSummary : '';
  const charCount = selectedContent.length;
  const isOverLimit = charCount > 280;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-lg shadow-lg w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg">
            {tokenSymbol ? `$${tokenSymbol}` : tokenMint.slice(0, 8)} AI Analysis
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Tone Selector */}
          <div className="flex items-center gap-3">
            <Label htmlFor="tone" className="shrink-0">Tone:</Label>
            <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
              <SelectTrigger id="tone" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="constructive">Constructive</SelectItem>
                <SelectItem value="cautionary">Cautionary</SelectItem>
              </SelectContent>
            </Select>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {/* Status Overview */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-overview"
                checked={selectedText === 'overview'}
                onCheckedChange={(checked) => setSelectedText(checked ? 'overview' : null)}
              />
              <Label htmlFor="select-overview" className="cursor-pointer">Status Overview</Label>
              {selectedText === 'overview' && (
                <span className={`text-xs ml-auto ${isOverLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {charCount}/280
                </span>
              )}
            </div>
            <Textarea
              id="status-overview"
              value={statusOverview}
              onChange={(e) => setStatusOverview(e.target.value)}
              placeholder={isLoading ? 'Generating analysis...' : 'Status overview will appear here'}
              className="min-h-[120px] resize-none"
              disabled={isLoading}
            />
          </div>

          {/* Social Summary */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-summary"
                checked={selectedText === 'summary'}
                onCheckedChange={(checked) => setSelectedText(checked ? 'summary' : null)}
              />
              <Label htmlFor="select-summary" className="cursor-pointer">Social Summary (Twitter-ready)</Label>
              {selectedText === 'summary' && (
                <span className={`text-xs ml-auto ${isOverLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {charCount}/280
                </span>
              )}
            </div>
            <Textarea
              id="social-summary"
              value={socialSummary}
              onChange={(e) => setSocialSummary(e.target.value)}
              placeholder={isLoading ? 'Generating summary...' : 'Social summary will appear here'}
              className="min-h-[80px] resize-none"
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t bg-muted/30">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={generateAnalysis}
            disabled={isLoading}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Regenerate
          </Button>
          <Button 
            onClick={handlePost}
            disabled={isLoading || isPosting || !hasGenerated || !selectedText || isOverLimit}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {isPosting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            POST to @HoldersIntel
          </Button>
        </div>
      </div>
    </div>
  );
}
