import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GripVertical, Trash2, Upload, Sparkles, ImageIcon } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GalleryPickerButton } from './social/GalleryPickerButton';
import { supabase } from '@/integrations/supabase/client';
import { stripExifAndBrand, generateImageName } from '@/utils/imageMetadata';
import { ImageCropDialog } from '@/components/ui/ImageCropDialog';
import { toast } from '@/hooks/use-toast';

interface InlineImage {
  id: string;
  url: string;
  alt: string;
  /** Anchor: 'auto' (smart placement) or paragraph break index (number as string) */
  anchor: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentMd: string;
  articleTitle?: string;
  onApply: (newContentMd: string) => void;
}

const IMG_REGEX = /\n*!\[([^\]]*)\]\(([^)]+)\)\n*/g;

function parseImagesAndStrip(md: string): { clean: string; images: { alt: string; url: string; insertedAt: number }[] } {
  const images: { alt: string; url: string; insertedAt: number }[] = [];
  let clean = '';
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(IMG_REGEX.source, 'g');
  while ((m = re.exec(md)) !== null) {
    clean += md.slice(lastIdx, m.index);
    images.push({ alt: m[1] || 'image', url: m[2], insertedAt: clean.length });
    // Insert a paragraph separator where the image used to be (so para count is preserved)
    if (!clean.endsWith('\n\n')) clean += clean.endsWith('\n') ? '\n' : '\n\n';
    lastIdx = m.index + m[0].length;
  }
  clean += md.slice(lastIdx);
  return { clean, images };
}

function computeParaBreaks(content: string): number[] {
  const breaks: number[] = [];
  const re = /\n\s*\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    breaks.push(m.index + m[0].length);
  }
  return breaks;
}

function smartSlot(insertionIndex: number, totalAuto: number, paraBreaks: number[]): number {
  if (paraBreaks.length === 0) return -1;
  if (paraBreaks.length === 1) return paraBreaks[0];
  if (insertionIndex === 0) {
    return paraBreaks[paraBreaks.length >= 3 ? 1 : 0];
  }
  if (insertionIndex === totalAuto - 1 && paraBreaks.length >= 3) {
    return paraBreaks[paraBreaks.length - 2];
  }
  const slot = Math.floor((paraBreaks.length * (insertionIndex + 1)) / (totalAuto + 1));
  return paraBreaks[Math.min(Math.max(slot, 0), paraBreaks.length - 1)];
}

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').pop() || url;
    return decodeURIComponent(last).slice(0, 48);
  } catch {
    return url.slice(-32);
  }
}

function SortableCard({
  img, idx, paraCount, onDelete, onAnchorChange,
}: {
  img: InlineImage;
  idx: number;
  paraCount: number;
  onDelete: () => void;
  onAnchorChange: (val: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: img.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <img
        src={img.url}
        alt={img.alt}
        loading="lazy"
        className="h-14 w-20 rounded object-cover border border-border"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{filenameFromUrl(img.url)}</div>
        <div className="text-xs text-muted-foreground">Position #{idx + 1}</div>
      </div>
      <Select value={img.anchor} onValueChange={onAnchorChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          <SelectItem value="auto">Auto (Smart)</SelectItem>
          {Array.from({ length: paraCount }, (_, i) => (
            <SelectItem key={i} value={String(i)}>After ¶{i + 1}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" size="icon" variant="ghost" onClick={onDelete} className="text-destructive hover:text-destructive">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function InlineImageManagerModal({ open, onOpenChange, contentMd, articleTitle, onApply }: Props) {
  const [images, setImages] = useState<InlineImage[]>([]);
  const [cleanContent, setCleanContent] = useState('');
  const [showCrop, setShowCrop] = useState(false);
  const [cropSrc, setCropSrc] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Parse on open
  useEffect(() => {
    if (!open) return;
    const { clean, images: parsed } = parseImagesAndStrip(contentMd);
    setCleanContent(clean);
    setImages(parsed.map((p, i) => ({
      id: `img-${Date.now()}-${i}`,
      url: p.url,
      alt: p.alt,
      anchor: 'auto',
    })));
  }, [open, contentMd]);

  const paraBreaks = useMemo(() => computeParaBreaks(cleanContent), [cleanContent]);
  const paraCount = paraBreaks.length;

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setImages(items => {
      const oldIdx = items.findIndex(i => i.id === active.id);
      const newIdx = items.findIndex(i => i.id === over.id);
      return arrayMove(items, oldIdx, newIdx);
    });
  };

  const addImageUrl = (url: string, alt = 'image') => {
    setImages(prev => [...prev, { id: `img-${Date.now()}-${prev.length}`, url, alt, anchor: 'auto' }]);
  };

  const handleGalleryPick = (url: string) => {
    setCropSrc(url);
    setShowCrop(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCropSrc(url);
    setShowCrop(true);
    e.target.value = '';
  };

  const handleCropComplete = async (blobUrl: string, blob: Blob) => {
    const cleanBlob = await stripExifAndBrand(blob);
    const imageName = generateImageName('inline', articleTitle);
    const path = `${Date.now()}-${imageName}.jpg`;
    const { error } = await supabase.storage.from('intel-images').upload(path, cleanBlob, { contentType: 'image/jpeg' });
    if (error) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
      URL.revokeObjectURL(blobUrl);
      return;
    }
    const { data: urlData } = supabase.storage.from('intel-images').getPublicUrl(path);
    addImageUrl(urlData.publicUrl);
    toast({ title: 'Image added', description: `"${imageName}" — EXIF stripped & branded.` });
    URL.revokeObjectURL(blobUrl);
  };

  const handleApply = () => {
    if (images.length === 0) {
      onApply(cleanContent);
      onOpenChange(false);
      return;
    }

    // Resolve final insert positions in ORIGINAL clean content coordinates.
    // Honor manual anchors first; auto images fill remaining slots evenly.
    const autoIndices: number[] = [];
    const positions: (number | null)[] = images.map((img, i) => {
      if (img.anchor === 'auto') {
        autoIndices.push(i);
        return null;
      }
      const idx = parseInt(img.anchor, 10);
      if (Number.isFinite(idx) && paraBreaks[idx] != null) return paraBreaks[idx];
      autoIndices.push(i);
      return null;
    });

    // Distribute auto images across remaining slots
    autoIndices.forEach((imgIdx, k) => {
      positions[imgIdx] = smartSlot(k, autoIndices.length, paraBreaks);
    });

    // Build insertions list, sort end-to-start so earlier insertions don't shift later ones
    const insertions = images
      .map((img, i) => ({
        pos: positions[i] ?? cleanContent.length,
        token: `\n\n![${img.alt || 'image'}](${img.url})\n`,
      }))
      .sort((a, b) => b.pos - a.pos);

    let result = cleanContent;
    for (const ins of insertions) {
      result = result.slice(0, ins.pos) + ins.token + result.slice(ins.pos);
    }

    onApply(result);
    onOpenChange(false);
    toast({ title: 'Images updated', description: `${images.length} image${images.length === 1 ? '' : 's'} repositioned.` });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Manage Inline Images
              <Badge variant="secondary">{images.length}</Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 border-b border-border pb-3">
            <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-1.5">
              <Upload className="h-3.5 w-3.5" /> Upload
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            <GalleryPickerButton
              onSelect={handleGalleryPick}
              label="From Gallery"
              articleContent={cleanContent}
              articleTitle={articleTitle}
            />
            <div className="ml-auto text-xs text-muted-foreground self-center">
              {paraCount} paragraph slot{paraCount === 1 ? '' : 's'} available
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-[200px] max-h-[50vh] pr-3">
            {images.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <ImageIcon className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-sm">No inline images yet.</p>
                <p className="text-xs mt-1">Use Upload or Gallery to add some.</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={images.map(i => i.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2 py-2">
                    {images.map((img, idx) => (
                      <SortableCard
                        key={img.id}
                        img={img}
                        idx={idx}
                        paraCount={paraCount}
                        onDelete={() => setImages(prev => prev.filter(p => p.id !== img.id))}
                        onAnchorChange={(val) => setImages(prev => prev.map(p => p.id === img.id ? { ...p, anchor: val } : p))}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleApply}>Apply Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageCropDialog
        open={showCrop}
        onOpenChange={(o) => {
          setShowCrop(o);
          if (!o) {
            try { if (cropSrc.startsWith('blob:')) URL.revokeObjectURL(cropSrc); } catch {}
            setCropSrc('');
          }
        }}
        imageSrc={cropSrc}
        onCropComplete={handleCropComplete}
        defaultAspect="free"
        title="Crop Inline Image"
      />
    </>
  );
}
