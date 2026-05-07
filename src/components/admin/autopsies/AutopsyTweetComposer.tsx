import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Copy, Download, ExternalLink, RefreshCw, Twitter } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { buildDeadTokensPost, DEAD_TOKENS_HANDLE, type DeadTokenPostInput } from '@/lib/deadTokensPost';

interface Props {
  input: DeadTokenPostInput;
  heroImage?: string | null;
}

function absUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  if (typeof window === 'undefined') return `https://blackbox.farm${path}`;
  return `${window.location.origin}${path}`;
}

export function AutopsyTweetComposer({ input, heroImage }: Props) {
  const { toast } = useToast();
  const template = useMemo(() => buildDeadTokensPost(input), [input]);
  const [text, setText] = useState(template);

  const len = text.length;
  const lenColor = len > 280 ? 'text-destructive' : len > 250 ? 'text-amber-500' : 'text-muted-foreground';
  const heroAbs = heroImage ? absUrl(heroImage) : '';

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `Copied ${label}` });
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const downloadImage = async () => {
    if (!heroAbs) return;
    try {
      const r = await fetch(heroAbs);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${input.slug}-deadtokens-banner.${(blob.type.split('/')[1] || 'jpg').split('+')[0]}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Image download failed — use Copy URL instead', variant: 'destructive' });
    }
  };

  const intentUrl = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="bg-primary/15 text-primary border-primary/40">
          <Twitter className="h-3 w-3 mr-1" /> {DEAD_TOKENS_HANDLE}
        </Badge>
        <span className={`text-xs ${lenColor}`}>{len}/280 chars</span>
        <Button size="sm" variant="ghost" onClick={() => setText(template)} className="ml-auto gap-1">
          <RefreshCw className="h-3 w-3" /> Regenerate
        </Button>
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        className="font-mono text-xs leading-relaxed"
      />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => copy(text, 'post')} className="gap-1.5">
          <Copy className="h-4 w-4" /> Copy Post
        </Button>
        {heroAbs && (
          <>
            <Button size="sm" variant="outline" onClick={() => copy(heroAbs, 'image URL')} className="gap-1.5">
              <Copy className="h-4 w-4" /> Copy Image URL
            </Button>
            <Button size="sm" variant="outline" onClick={downloadImage} className="gap-1.5">
              <Download className="h-4 w-4" /> Download Banner
            </Button>
          </>
        )}
        <a href={intentUrl} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="outline" className="gap-1.5">
            <ExternalLink className="h-4 w-4" /> Open X Compose
          </Button>
        </a>
      </div>

      {/* Mock X card preview */}
      <div className="rounded-xl border border-border bg-background p-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-destructive/20 border border-destructive/40 flex items-center justify-center text-lg">☠️</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 text-sm">
              <span className="font-bold">DeadTokens</span>
              <span className="text-muted-foreground">{DEAD_TOKENS_HANDLE}</span>
            </div>
            <pre className="mt-1 whitespace-pre-wrap break-words text-sm font-sans text-foreground/90">{text}</pre>
            {heroAbs && (
              <div className="mt-3 rounded-xl overflow-hidden border border-border">
                <img src={heroAbs} alt="autopsy banner preview" className="w-full h-auto block" loading="lazy" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}