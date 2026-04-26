import React, { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Camera, Copy, Download, Twitter, Send, Check, RefreshCw, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { captureBubbleMap, blobToBase64, type CaptureView, type CaptureWatermark } from '@/utils/captureBubbleMap';

interface SnapshotShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: CaptureView;
  forceGraphRef?: any;
  schematicContainer?: HTMLElement | null;
  watermark: CaptureWatermark & { tokenAddress: string; realHolders?: number };
}

const SnapshotShareDialog: React.FC<SnapshotShareDialogProps> = ({
  open,
  onOpenChange,
  view,
  forceGraphRef,
  schematicContainer,
  watermark,
}) => {
  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [commentary, setCommentary] = useState('');
  const [copied, setCopied] = useState(false);

  const ticker = watermark.ticker || 'TOKEN';
  const ca = watermark.tokenAddress;

  const defaultCommentary = useCallback(() => {
    const lines = [
      `🔍 $${ticker} — Holder Mesh${watermark.grade ? ` · Grade ${watermark.grade}` : ''}`,
      watermark.realHolders ? `${watermark.realHolders.toLocaleString()} real holders mapped` : '',
      `Mapped on @HoldersIntel`,
      `https://blackbox.farm/bubblemap?token=${ca}`,
    ].filter(Boolean);
    return lines.join('\n');
  }, [ticker, ca, watermark.grade, watermark.realHolders]);

  const doCapture = useCallback(async () => {
    setCapturing(true);
    setPublicUrl(null);
    try {
      const newBlob = await captureBubbleMap({
        view,
        forceGraphRef,
        schematicContainer,
        watermark: {
          ticker: watermark.ticker,
          ca: watermark.tokenAddress,
          grade: watermark.grade,
          viewLabel: view === 'schematic' ? 'SCHEMATIC' : 'BUBBLE',
        },
      });
      setBlob(newBlob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(newBlob));
    } catch (err: any) {
      console.error('Capture failed', err);
      toast.error(err?.message || 'Capture failed');
    } finally {
      setCapturing(false);
    }
  }, [view, forceGraphRef, schematicContainer, watermark, previewUrl]);

  // Auto-capture on open
  useEffect(() => {
    if (open) {
      setCommentary(defaultCommentary());
      // small delay so dialog mount doesn't race the canvas
      const t = setTimeout(doCapture, 150);
      return () => clearTimeout(t);
    } else {
      // cleanup
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setBlob(null);
      setPublicUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ensureUploaded = useCallback(async (): Promise<string | null> => {
    if (publicUrl) return publicUrl;
    if (!blob) {
      toast.error('No snapshot captured yet');
      return null;
    }
    setUploading(true);
    try {
      const b64 = await blobToBase64(blob);
      const { data, error } = await supabase.functions.invoke('upload-bubble-snapshot', {
        body: {
          pngBase64: b64,
          tokenAddress: ca,
          ticker: watermark.ticker,
          viewMode: view,
          commentary,
        },
      });
      if (error) throw error;
      if (!data?.publicUrl) throw new Error('Upload returned no URL');
      setPublicUrl(data.publicUrl);
      return data.publicUrl as string;
    } catch (err: any) {
      console.error('Upload failed', err);
      toast.error(err?.message || 'Upload failed');
      return null;
    } finally {
      setUploading(false);
    }
  }, [blob, publicUrl, ca, ticker, view, commentary, watermark.ticker]);

  const handleCopyLink = useCallback(async () => {
    const url = await ensureUploaded();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Public image URL copied');
  }, [ensureUploaded]);

  const handleShareToX = useCallback(async () => {
    const url = await ensureUploaded();
    if (!url) return;
    const text = `${commentary}\n\n${url}`;
    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(intentUrl, '_blank', 'width=550,height=520');
  }, [ensureUploaded, commentary]);

  const handleShareToTelegram = useCallback(async () => {
    const url = await ensureUploaded();
    if (!url) return;
    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(commentary)}`;
    window.open(tgUrl, '_blank', 'width=550,height=520');
  }, [ensureUploaded, commentary]);

  const handleDownload = useCallback(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ticker}-bubblemap-${view}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [blob, ticker, view]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            Snapshot &amp; Share — ${ticker}
            <Badge variant="secondary" className="ml-2 uppercase text-[10px]">{view}</Badge>
          </DialogTitle>
          <DialogDescription>
            Capture the visible map area and share it to X, Telegram, or as a public image link.
          </DialogDescription>
        </DialogHeader>

        {/* Preview */}
        <div className="relative rounded-md border bg-black/40 overflow-hidden aspect-[1200/675]">
          {capturing && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-sm">Capturing…</span>
            </div>
          )}
          {previewUrl ? (
            <img src={previewUrl} alt="Bubble map snapshot preview" className="w-full h-full object-contain" />
          ) : !capturing ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
              No preview yet
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between">
          <Button size="sm" variant="outline" onClick={doCapture} disabled={capturing}>
            <RefreshCw className={`h-3.5 w-3.5 mr-2 ${capturing ? 'animate-spin' : ''}`} />
            Re-capture
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDownload} disabled={!blob || capturing}>
            <Download className="h-3.5 w-3.5 mr-2" />
            Download PNG
          </Button>
        </div>

        {/* Commentary */}
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Commentary</label>
          <Textarea
            value={commentary}
            onChange={(e) => setCommentary(e.target.value)}
            rows={4}
            className="font-mono text-xs"
            placeholder="Say something about this map…"
          />
          <div className="text-[10px] text-muted-foreground text-right">{commentary.length} chars</div>
        </div>

        {/* Public URL display once uploaded */}
        {publicUrl && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-2 flex items-center gap-2 text-xs">
            <LinkIcon className="h-3.5 w-3.5 text-primary shrink-0" />
            <code className="truncate flex-1">{publicUrl}</code>
            <Button size="sm" variant="ghost" onClick={handleCopyLink}>
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-3 gap-2">
          <Button onClick={handleShareToX} disabled={!blob || uploading || capturing}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Twitter className="h-3.5 w-3.5 mr-2" />}
            Share to X
          </Button>
          <Button variant="secondary" onClick={handleShareToTelegram} disabled={!blob || uploading || capturing}>
            <Send className="h-3.5 w-3.5 mr-2" />
            Share to Telegram
          </Button>
          <Button variant="outline" onClick={handleCopyLink} disabled={!blob || uploading || capturing}>
            {copied ? <Check className="h-3.5 w-3.5 mr-2 text-green-500" /> : <Copy className="h-3.5 w-3.5 mr-2" />}
            Copy public link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SnapshotShareDialog;