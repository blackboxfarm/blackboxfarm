import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { Copy, FileText } from 'lucide-react';
import { buildExport, copyRich, type ExportPreset } from '@/lib/articleExport';

interface Props {
  contentMd: string;
  title?: string;
  trigger?: React.ReactNode;
}

const PRESETS: { key: ExportPreset; label: string; hint: string }[] = [
  { key: 'medium',   label: 'Medium',     hint: 'Rich HTML, no H1 (Medium uses title field)' },
  { key: 'substack', label: 'Substack',   hint: 'Rich HTML with styled pull-quotes' },
  { key: 'ghost',    label: 'Ghost',      hint: 'Clean semantic HTML' },
  { key: 'generic',  label: 'Generic HTML', hint: 'Universal HTML for any editor' },
  { key: 'linkedin', label: 'LinkedIn',   hint: 'Plain text with Unicode bold' },
  { key: 'plain',    label: 'Plain Text', hint: 'No markdown, no asterisks' },
];

export function ArticleExportDialog({ contentMd, title, trigger }: Props) {
  const [preset, setPreset] = useState<ExportPreset>('medium');
  const { html, plain } = useMemo(() => buildExport(contentMd || '', preset), [contentMd, preset]);
  const preview = (preset === 'linkedin' || preset === 'plain' ? plain : html);

  const handleCopy = async () => {
    try {
      await copyRich(html, plain);
      toast({ title: `Copied for ${PRESETS.find(p => p.key === preset)?.label}`, description: 'Paste into the destination editor.' });
    } catch (e: any) {
      toast({ title: 'Copy failed', description: e?.message || 'Clipboard unavailable', variant: 'destructive' });
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="ghost" title="Export for platform">
            <FileText className="h-3.5 w-3.5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export “{title || 'article'}” for platform</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            {PRESETS.map(p => (
              <Button
                key={p.key}
                size="sm"
                variant={preset === p.key ? 'default' : 'outline'}
                onClick={() => setPreset(p.key)}
                className="text-xs"
              >
                {p.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{PRESETS.find(p => p.key === preset)?.hint}</p>
          <Textarea readOnly value={preview} className="text-[11px] font-mono h-72 resize-none" />
          <div className="flex justify-end">
            <Button onClick={handleCopy}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy to clipboard
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/70">
            Rich HTML + plain text are both placed on the clipboard. Medium, Substack, Ghost and most editors will keep bold, headings, bullets, and links. LinkedIn and Plain are text-only.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}