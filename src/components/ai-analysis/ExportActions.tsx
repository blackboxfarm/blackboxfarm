import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Share2,
  Copy,
  Download,
  Mail,
  FileText,
  FileCode,
  Loader2,
  Check,
} from 'lucide-react';
import {
  formatAnalysisAsText,
  formatAnalysisAsHTML,
  copyToClipboard,
  downloadAsFile,
} from '@/utils/aiAnalysisExport';

interface AIInterpretationResponse {
  interpretation: {
    status_overview: string;
    lifecycle: {
      stage: string;
      confidence: string;
      explanation: string;
    };
    key_drivers: Array<{
      label: string;
      metric_value: string;
      bucket: string;
      implication: string;
    }>;
    reasoning_trace: Array<{
      metric: string;
      value: string;
      threshold_category: string;
      phrase_selected: string;
    }>;
    uncertainty_notes?: string[];
    abbreviated_summary: string;
  };
  mode: string;
  mode_label?: string;
  mode_reason?: string;
  cached: boolean;
  metrics_context?: {
    token_symbol?: string;
    token_name?: string;
    control_density?: { value: number; bucket: string };
    liquidity_coverage?: { value: number; bucket: string };
    resilience_score?: { value: number; bucket: string };
    tier_divergence?: { value: number; bucket: string };
    risk_flags?: string[];
    total_holders?: number;
    market_cap?: number;
  };
}

interface ExportActionsProps {
  interpretation: AIInterpretationResponse;
  tokenMint: string;
  tone: string;
}

export default function ExportActions({ interpretation, tokenMint, tone }: ExportActionsProps) {
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopyText = async () => {
    const text = formatAnalysisAsText(interpretation, tokenMint, tone);
    const success = await copyToClipboard(text);
    
    if (success) {
      setCopied(true);
      toast({ title: 'Copied!', description: 'Analysis copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  const handleDownloadText = () => {
    const text = formatAnalysisAsText(interpretation, tokenMint, tone);
    const symbol = interpretation.metrics_context?.token_symbol || tokenMint.slice(0, 8);
    downloadAsFile(text, `ai-analysis-${symbol}.txt`, 'text/plain');
    toast({ title: 'Downloaded', description: 'Text file saved' });
  };

  const handleDownloadHTML = () => {
    const html = formatAnalysisAsHTML(interpretation, tokenMint, tone);
    const symbol = interpretation.metrics_context?.token_symbol || tokenMint.slice(0, 8);
    downloadAsFile(html, `ai-analysis-${symbol}.html`, 'text/html');
    toast({ title: 'Downloaded', description: 'HTML file saved' });
  };

  const handleSendEmail = async () => {
    if (!recipientEmail || !recipientEmail.includes('@')) {
      toast({ title: 'Invalid email', variant: 'destructive' });
      return;
    }

    setIsSendingEmail(true);

    try {
      const htmlContent = formatAnalysisAsHTML(interpretation, tokenMint, tone);
      const textContent = formatAnalysisAsText(interpretation, tokenMint, tone);

      const { data, error } = await supabase.functions.invoke('send-ai-analysis-email', {
        body: {
          recipientEmail,
          tokenMint,
          tokenSymbol: interpretation.metrics_context?.token_symbol,
          htmlContent,
          textContent,
        },
      });

      if (error) throw error;

      toast({ title: 'Email sent!', description: `Analysis sent to ${recipientEmail}` });
      setEmailDialogOpen(false);
      setRecipientEmail('');
    } catch (error) {
      console.error('Email send error:', error);
      toast({
        title: 'Failed to send email',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Share2 className="h-4 w-4" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 bg-card border-border z-50">
          <DropdownMenuLabel>Share & Export</DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onClick={handleCopyText} className="cursor-pointer">
            {copied ? (
              <Check className="h-4 w-4 mr-2 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            Copy to Clipboard
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={() => setEmailDialogOpen(true)} className="cursor-pointer">
            <Mail className="h-4 w-4 mr-2" />
            Send via Email
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onClick={handleDownloadText} className="cursor-pointer">
            <FileText className="h-4 w-4 mr-2" />
            Download as Text
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={handleDownloadHTML} className="cursor-pointer">
            <FileCode className="h-4 w-4 mr-2" />
            Download as HTML
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Email Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Analysis
            </DialogTitle>
            <DialogDescription>
              Send this AI analysis report via email
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Recipient Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@example.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                disabled={isSendingEmail}
              />
            </div>
            
            <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
              <p className="font-medium mb-1">Report Preview:</p>
              <p>
                {interpretation.metrics_context?.token_symbol 
                  ? `$${interpretation.metrics_context.token_symbol}` 
                  : tokenMint.slice(0, 12) + '...'
                } • Mode {interpretation.mode} • {tone.charAt(0).toUpperCase() + tone.slice(1)} Tone
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)} disabled={isSendingEmail}>
              Cancel
            </Button>
            <Button onClick={handleSendEmail} disabled={isSendingEmail || !recipientEmail}>
              {isSendingEmail ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
