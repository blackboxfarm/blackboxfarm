import React, { useState, useRef, useCallback } from 'react';
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Crop as CropIcon, RotateCcw } from 'lucide-react';

interface ImageCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string;
  onCropComplete: (croppedBlobUrl: string, blob: Blob) => void;
  /** Default aspect ratio. 'free' = no constraint */
  defaultAspect?: number | 'free';
  title?: string;
}

const ASPECT_OPTIONS = [
  { label: 'Free', value: 'free' },
  { label: '2:1 (Hero)', value: '2' },
  { label: '16:9', value: '1.778' },
  { label: '4:3', value: '1.333' },
  { label: '1:1 (Square)', value: '1' },
  { label: '3:4', value: '0.75' },
];

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 80 }, aspect, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight
  );
}

export function ImageCropDialog({
  open,
  onOpenChange,
  imageSrc,
  onCropComplete,
  defaultAspect = 2,
  title = 'Crop Image',
}: ImageCropDialogProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>(
    defaultAspect === 'free' ? undefined : defaultAspect
  );
  const [scale, setScale] = useState(1);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (aspect) {
      setCrop(centerAspectCrop(naturalWidth, naturalHeight, aspect));
    } else {
      setCrop({ unit: '%', x: 10, y: 10, width: 80, height: 80 });
    }
  }, [aspect]);

  const handleAspectChange = (val: string) => {
    if (val === 'free') {
      setAspect(undefined);
    } else {
      const a = parseFloat(val);
      setAspect(a);
      if (imgRef.current) {
        const { naturalWidth, naturalHeight } = imgRef.current;
        setCrop(centerAspectCrop(naturalWidth, naturalHeight, a));
      }
    }
  };

  const handleReset = () => {
    setScale(1);
    if (imgRef.current) {
      const { naturalWidth, naturalHeight } = imgRef.current;
      if (aspect) {
        setCrop(centerAspectCrop(naturalWidth, naturalHeight, aspect));
      } else {
        setCrop({ unit: '%', x: 10, y: 10, width: 80, height: 80 });
      }
    }
  };

  const handleConfirm = async () => {
    if (!completedCrop || !imgRef.current) return;

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    const pixelX = completedCrop.x * scaleX;
    const pixelY = completedCrop.y * scaleY;
    const pixelW = completedCrop.width * scaleX;
    const pixelH = completedCrop.height * scaleY;

    canvas.width = pixelW;
    canvas.height = pixelH;

    ctx.drawImage(image, pixelX, pixelY, pixelW, pixelH, 0, 0, pixelW, pixelH);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      onCropComplete(url, blob);
      onOpenChange(false);
    }, 'image/jpeg', 0.92);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CropIcon className="h-5 w-5" /> {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Controls */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Aspect:</Label>
              <Select
                value={aspect ? String(aspect) : 'free'}
                onValueChange={handleAspectChange}
              >
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASPECT_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-[150px]">
              <Label className="text-xs whitespace-nowrap">Zoom:</Label>
              <Slider
                value={[scale]}
                min={0.5}
                max={3}
                step={0.1}
                onValueChange={([v]) => setScale(v)}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-10">{scale.toFixed(1)}x</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
            </Button>
          </div>

          {/* Crop area */}
          <div className="flex justify-center bg-muted/30 rounded-lg p-2 overflow-hidden max-h-[50vh]">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={aspect}
              className="max-h-[48vh]"
            >
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Crop"
                onLoad={onImageLoad}
                style={{ transform: `scale(${scale})`, transformOrigin: 'center', maxHeight: '48vh' }}
                crossOrigin="anonymous"
              />
            </ReactCrop>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!completedCrop}>
            <CropIcon className="h-4 w-4 mr-2" /> Apply Crop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
