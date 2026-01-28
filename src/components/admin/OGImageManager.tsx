import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Image, Upload, Trash2, ExternalLink, Copy, RefreshCw, Plus } from 'lucide-react';

interface OGImageFile {
  name: string;
  created_at: string;
  size: number;
  url: string;
  version: string | null;
  isDefault: boolean;
}

export function OGImageManager() {
  const [images, setImages] = useState<OGImageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [versionCode, setVersionCode] = useState('');

  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from('OG')
        .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

      if (error) throw error;

      const ogImages: OGImageFile[] = (data || [])
        .filter(file => file.name.startsWith('holders_og') && file.name.endsWith('.png'))
        .map(file => {
          const versionMatch = file.name.match(/holders_og_(\d{8})\.png/);
          const version = versionMatch ? versionMatch[1] : null;
          
          return {
            name: file.name,
            created_at: file.created_at || '',
            size: file.metadata?.size || 0,
            url: `https://apxauapuusmgwbbzjgfl.supabase.co/storage/v1/object/public/OG/${file.name}`,
            version,
            isDefault: file.name === 'holders_og.png',
          };
        });

      setImages(ogImages);
    } catch (error) {
      console.error('Failed to fetch OG images:', error);
      toast.error('Failed to load OG images');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('png')) {
      toast.error('PNG only');
      return;
    }

    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
    setVersionCode('');
    event.target.value = '';
  };

  const handleUpload = async () => {
    if (!pendingFile || !versionCode) {
      toast.error('Enter a version code first');
      return;
    }

    if (!/^\d{8}$/.test(versionCode)) {
      toast.error('Version must be 8 digits (YYYYMMDD)');
      return;
    }

    setUploading(true);
    try {
      const fileName = `holders_og_${versionCode}.png`;
      
      const { data: existing } = await supabase.storage
        .from('OG')
        .list('', { search: fileName });

      if (existing && existing.length > 0) {
        await supabase.storage.from('OG').remove([fileName]);
      }

      const { error } = await supabase.storage
        .from('OG')
        .upload(fileName, pendingFile, {
          cacheControl: '3600',
          upsert: true,
        });

      if (error) throw error;

      toast.success(`Saved as ?v=${versionCode}`);
      setPendingFile(null);
      setPendingPreview(null);
      setVersionCode('');
      fetchImages();
    } catch (error: any) {
      console.error('Upload failed:', error);
      toast.error(error.message || 'Failed to upload');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fileName: string) => {
    if (fileName === 'holders_og.png') {
      toast.error('Cannot delete default');
      return;
    }

    if (!confirm(`Delete ${fileName}?`)) return;

    try {
      const { error } = await supabase.storage.from('OG').remove([fileName]);
      if (error) throw error;
      
      toast.success('Deleted');
      fetchImages();
    } catch (error: any) {
      console.error('Delete failed:', error);
      toast.error(error.message || 'Failed to delete');
    }
  };

  const copyShareUrl = (version: string | null) => {
    const url = version 
      ? `https://blackbox.farm/holders?v=${version}`
      : 'https://blackbox.farm/holders';
    navigator.clipboard.writeText(url);
    toast.success('Copied');
  };

  const cancelUpload = () => {
    setPendingFile(null);
    setPendingPreview(null);
    setVersionCode('');
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Image className="w-4 h-4" />
          OG Images
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Area */}
        {!pendingFile ? (
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-muted-foreground/25 rounded-lg cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors">
            <Plus className="w-8 h-8 text-muted-foreground mb-2" />
            <span className="text-sm text-muted-foreground">Add New OG Image</span>
            <input
              type="file"
              accept="image/png"
              onChange={handleFileSelect}
              className="sr-only"
            />
          </label>
        ) : (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
            <div className="aspect-[1200/630] bg-muted rounded overflow-hidden">
              <img src={pendingPreview!} alt="Preview" className="w-full h-full object-cover" />
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Version code (e.g. 20260128)"
                value={versionCode}
                onChange={(e) => setVersionCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                className="font-mono"
                maxLength={8}
              />
              <Button onClick={handleUpload} disabled={uploading || versionCode.length !== 8}>
                {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              </Button>
              <Button variant="ghost" onClick={cancelUpload}>Cancel</Button>
            </div>
            {versionCode.length === 8 && (
              <p className="text-xs text-muted-foreground">
                Will be accessible via <code className="bg-muted px-1 rounded">?v={versionCode}</code>
              </p>
            )}
          </div>
        )}

        {/* Existing Images */}
        {loading ? (
          <div className="text-center py-4 text-muted-foreground text-sm">Loading...</div>
        ) : images.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">No images</div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {images.map((img) => (
              <div key={img.name} className="border rounded-lg overflow-hidden bg-card">
                <div className="aspect-[1200/630] bg-muted relative">
                  <img src={img.url} alt={img.name} className="w-full h-full object-cover" loading="lazy" />
                  {img.isDefault && (
                    <Badge className="absolute top-1 left-1 text-xs" variant="secondary">Default</Badge>
                  )}
                  {img.version && (
                    <Badge className="absolute top-1 right-1 text-xs font-mono" variant="outline">v={img.version}</Badge>
                  )}
                </div>
                <div className="p-2 flex items-center justify-between gap-1">
                  <span className="text-xs text-muted-foreground">{formatBytes(img.size)}</span>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyShareUrl(img.version)}>
                      <Copy className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => window.open(img.url, '_blank')}>
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                    {!img.isDefault && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(img.name)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
