import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { ChevronDown, ChevronUp, Copy, FileText } from 'lucide-react';
import { buildExport, copyRich, type ExportPreset } from '@/lib/articleExport';

interface Props {
  contentMd: string;
  title?: string;
}

const PRESETS: { key: ExportPreset; label: string; hint: string }[] = [
  { key: 'medium',   label: 'Medium',     hint: 'Rich HTML, no H1 (Medium uses title field)' },
  { key: 'substack', label: 'Substack',   hint: 'Rich HTML with styled pull-quotes' },
  { key: 'ghost',    label: 'Ghost',      hint: 'Clean semantic HTML' },
  { key: 'generic',  label: 'Generic HTML', hint: 'Universal HTML for any editor' },
  { key: 'linkedin', label: 'LinkedIn',   hint: 'Plain text with Unicode bold' },
  { key: 'plain',    label: 'Plain Text', hint: 'No markdown, no asterisks' },
];

export function ArticleExportPanel({ contentMd, title }: Props) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<ExportPreset>('medium');

  const { html, plain } = useMemo(() => buildExport(contentMd || '', preset), [contentMd, preset]);
  const preview = (preset === 'linkedin' || preset === 'plain' ? plain : html).slice(0, 600);

  const handleCopy = async () => {
    try {
      await copyRich(html, plain);
      toast({ title: `Copied for ${PRESETS.find(p => p.key === preset)?.label}`, description: 'Paste into the destination editor.' });
    } catch (e: any) {
      toast({ title: 'Copy failed', description: e?.message || 'Clipboard unavailable', variant: 'destructive' });
    }
  };

  const handleDownloadHtml = () => {
    const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${(title || 'article').replace(/</g, '&lt;')}</title></head><body>${html}</body></html>`;
    const blob = new Blob([doc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || 'article').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}-${preset}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(420px,calc(100vw-2rem))]">
      <Card className="border-primary/40 shadow-xl bg-background/95 backdrop-blur">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/40"
        >
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Export for Platform
          </span>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>

        {open && (
          <div className="p-3 space-y-3 border-t border-border">
            <div className="grid grid-cols-3 gap-1.5">
              {PRESETS.map(p => (
                <Button
                  key={p.key}
                  size="sm"
                  variant={preset === p.key ? 'default' : 'outline'}
                  className="text-xs h-8"
                  onClick={() => setPreset(p.key)}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            <p className="text-[11px] text-muted-foreground">
              {PRESETS.find(p => p.key === preset)?.hint}
            </p>

            <Textarea
              readOnly
              value={preview + (preview.length >= 600 ? '\n…' : '')}
              className="text-[11px] font-mono h-32 resize-none"
            />

            <div className="flex gap-2">
              <Button size="sm" onClick={handleCopy} className="flex-1">
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy
              </Button>
              <Button size="sm" variant="outline" onClick={handleDownloadHtml}>
                .html
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
              Paste directly into Medium / Substack / Ghost editors — formatting (bold, headings, lists, links) is preserved. LinkedIn and Plain use text-only.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}