import { useCallback, useRef, useState } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';

interface Props {
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
}

const ACCEPT = 'image/jpeg,image/jpg,image/gif';
const MAX_INPUT_BYTES = 5 * 1024 * 1024; // 5MB pre-crop

async function getCroppedJpeg(src: string, area: Area, size = 512): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.9);
}

export function AvatarUploader({ currentUrl, onUploaded }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!['image/jpeg', 'image/jpg', 'image/gif'].includes(f.type)) {
      toast.error('Only JPG or GIF allowed');
      return;
    }
    if (f.size > MAX_INPUT_BYTES) {
      toast.error('Max 5MB before crop');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setSrc(reader.result as string);
    reader.readAsDataURL(f);
  };

  const onCropComplete = useCallback((_c: Area, px: Area) => setArea(px), []);

  const upload = async () => {
    if (!src || !area) return;
    setBusy(true);
    try {
      const dataUrl = await getCroppedJpeg(src, area, 512);
      const b64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
      const { data, error } = await supabase.functions.invoke('avatar-upload-scan', {
        body: { image_b64: b64 },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).reason || (data as any).error);
      const url = (data as any).avatar_url as string;
      onUploaded(url);
      toast.success('Avatar updated');
      setSrc(null);
    } catch (e) {
      toast.error((e as Error).message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="h-16 w-16 rounded-full bg-muted overflow-hidden border border-border">
        {currentUrl ? <img src={currentUrl} alt="avatar" className="h-full w-full object-cover" /> : null}
      </div>
      <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
        <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload
      </Button>
      <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={onFile} />
      <p className="text-xs text-muted-foreground">JPG or GIF, ≤5MB. Scanned for safety.</p>

      <Dialog open={!!src} onOpenChange={(o) => !o && setSrc(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Crop your avatar</DialogTitle></DialogHeader>
          <div className="relative h-64 w-full bg-black rounded-md overflow-hidden">
            {src && (
              <Cropper
                image={src}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            )}
          </div>
          <Slider value={[zoom]} min={1} max={3} step={0.05} onValueChange={(v) => setZoom(v[0])} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSrc(null)} disabled={busy}>Cancel</Button>
            <Button onClick={upload} disabled={busy}>
              {busy ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Scanning…</> : 'Upload'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}