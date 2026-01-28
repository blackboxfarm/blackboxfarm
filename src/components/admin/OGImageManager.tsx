import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Image, Upload, Trash2, ExternalLink, Copy, RefreshCw, Calendar } from 'lucide-react';
import { format } from 'date-fns';

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
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyyMMdd'));

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
          // Extract version from filename: holders_og_20260128.png -> 20260128
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

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('png')) {
      toast.error('Please upload a PNG image (1200x630 recommended)');
      return;
    }

    setUploading(true);
    try {
      const fileName = `holders_og_${selectedDate}.png`;
      
      // Check if file already exists
      const { data: existing } = await supabase.storage
        .from('OG')
        .list('', { search: fileName });

      if (existing && existing.length > 0) {
        // Remove existing file first
        await supabase.storage.from('OG').remove([fileName]);
      }

      const { error } = await supabase.storage
        .from('OG')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (error) throw error;

      toast.success(`Uploaded ${fileName}`);
      fetchImages();
    } catch (error: any) {
      console.error('Upload failed:', error);
      toast.error(error.message || 'Failed to upload image');
    } finally {
      setUploading(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const handleDelete = async (fileName: string) => {
    if (fileName === 'holders_og.png') {
      toast.error('Cannot delete the default OG image');
      return;
    }

    if (!confirm(`Delete ${fileName}?`)) return;

    try {
      const { error } = await supabase.storage.from('OG').remove([fileName]);
      if (error) throw error;
      
      toast.success(`Deleted ${fileName}`);
      fetchImages();
    } catch (error: any) {
      console.error('Delete failed:', error);
      toast.error(error.message || 'Failed to delete image');
    }
  };

  const copyShareUrl = (version: string | null) => {
    const url = version 
      ? `https://blackbox.farm/holders?v=${version}`
      : 'https://blackbox.farm/holders';
    navigator.clipboard.writeText(url);
    toast.success('Copied share URL to clipboard');
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
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Image className="w-5 h-5" />
          OG Image Manager
        </CardTitle>
        <CardDescription>
          Manage social share images for different versions. Use <code className="bg-muted px-1 rounded">?v=YYYYMMDD</code> in share URLs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload Section */}
        <div className="flex flex-col sm:flex-row gap-4 items-end p-4 bg-muted/30 rounded-lg">
          <div className="flex-1 space-y-2">
            <Label htmlFor="og-date">Version Date (YYYYMMDD)</Label>
            <Input
              id="og-date"
              type="text"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="20260128"
              maxLength={8}
              className="font-mono"
            />
          </div>
          <div className="flex gap-2">
            <label 
              htmlFor="og-file-upload"
              className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 cursor-pointer ${uploading || selectedDate.length !== 8 ? 'opacity-50 pointer-events-none' : ''}`}
            >
              {uploading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Upload as holders_og_{selectedDate}.png
              <input
                type="file"
                id="og-file-upload"
                accept="image/png"
                onChange={handleUpload}
                className="sr-only"
                disabled={uploading || selectedDate.length !== 8}
              />
            </label>
          </div>
        </div>

        {/* Images Grid */}
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading images...</div>
        ) : images.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No OG images found</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {images.map((img) => (
              <div
                key={img.name}
                className="border rounded-lg overflow-hidden bg-card"
              >
                <div className="aspect-[1200/630] bg-muted relative">
                  <img
                    src={img.url}
                    alt={img.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {img.isDefault && (
                    <Badge className="absolute top-2 left-2" variant="secondary">
                      Default
                    </Badge>
                  )}
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm truncate">{img.name}</span>
                    <span className="text-xs text-muted-foreground">{formatBytes(img.size)}</span>
                  </div>
                  
                  {img.version && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      <span>v={img.version}</span>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => copyShareUrl(img.version)}
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      Copy URL
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(img.url, '_blank')}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                    {!img.isDefault && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(img.name)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Usage Instructions */}
        <div className="text-sm text-muted-foreground bg-muted/30 p-4 rounded-lg space-y-2">
          <p className="font-medium">How it works:</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Upload images with naming format: <code className="bg-muted px-1 rounded">holders_og_YYYYMMDD.png</code></li>
            <li>Share URLs with <code className="bg-muted px-1 rounded">?v=YYYYMMDD</code> to use that specific image</li>
            <li>Example: <code className="bg-muted px-1 rounded">blackbox.farm/holders?v=20260128</code></li>
            <li>If no matching version found, falls back to default <code className="bg-muted px-1 rounded">holders_og.png</code></li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}