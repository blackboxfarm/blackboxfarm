import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Image, Trash2, ExternalLink, Copy, RefreshCw, Plus, Pencil, Check, X } from 'lucide-react';

interface OGImageFile {
  name: string;
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
  const [nickname, setNickname] = useState('');
  const [editingVersion, setEditingVersion] = useState<string | null>(null);
  const [newNickname, setNewNickname] = useState('');

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
          const versionMatch = file.name.match(/holders_og_(.+)\.png/);
          const version = versionMatch ? versionMatch[1] : null;
          
          return {
            name: file.name,
            url: `https://apxauapuusmgwbbzjgfl.supabase.co/storage/v1/object/public/OG/${file.name}`,
            version,
            isDefault: file.name === 'holders_og.png',
          };
        });

      setImages(ogImages);
    } catch (error) {
      console.error('Failed to fetch OG images:', error);
      toast.error('Failed to load');
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
    setNickname('');
    event.target.value = '';
  };

  const handleUpload = async () => {
    if (!pendingFile || !nickname.trim()) {
      toast.error('Enter a nickname');
      return;
    }

    const cleanNickname = nickname.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanNickname) {
      toast.error('Invalid nickname');
      return;
    }

    setUploading(true);
    try {
      const fileName = `holders_og_${cleanNickname}.png`;
      
      const { data: existing } = await supabase.storage
        .from('OG')
        .list('', { search: fileName });

      if (existing && existing.length > 0) {
        await supabase.storage.from('OG').remove([fileName]);
      }

      const { error } = await supabase.storage
        .from('OG')
        .upload(fileName, pendingFile, { cacheControl: '3600', upsert: true });

      if (error) throw error;

      toast.success(`Saved as ?v=${cleanNickname}`);
      setPendingFile(null);
      setPendingPreview(null);
      setNickname('');
      fetchImages();
    } catch (error: any) {
      console.error('Upload failed:', error);
      toast.error(error.message || 'Failed');
    } finally {
      setUploading(false);
    }
  };

  const handleRename = async (oldVersion: string) => {
    const cleanNickname = newNickname.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanNickname || cleanNickname === oldVersion) {
      setEditingVersion(null);
      return;
    }

    try {
      const oldFileName = `holders_og_${oldVersion}.png`;
      const newFileName = `holders_og_${cleanNickname}.png`;

      // Download the file
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('OG')
        .download(oldFileName);

      if (downloadError) throw downloadError;

      // Upload with new name
      const { error: uploadError } = await supabase.storage
        .from('OG')
        .upload(newFileName, fileData, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      // Delete old file
      await supabase.storage.from('OG').remove([oldFileName]);

      toast.success(`Renamed to ?v=${cleanNickname}`);
      setEditingVersion(null);
      setNewNickname('');
      fetchImages();
    } catch (error: any) {
      console.error('Rename failed:', error);
      toast.error(error.message || 'Failed to rename');
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
      toast.error(error.message || 'Failed');
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
    setNickname('');
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
          <label className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-muted-foreground/25 rounded-lg cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors">
            <Plus className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Add New</span>
            <input type="file" accept="image/png" onChange={handleFileSelect} className="sr-only" />
          </label>
        ) : (
          <div className="flex items-center gap-3 p-2 border rounded-lg bg-muted/20">
            <div className="w-20 h-10 rounded overflow-hidden bg-muted flex-shrink-0">
              <img src={pendingPreview!} alt="Preview" className="w-full h-full object-cover" />
            </div>
            <Input
              placeholder="Nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="font-mono text-sm h-8 flex-1"
            />
            <Button size="sm" className="h-8" onClick={handleUpload} disabled={uploading || !nickname.trim()}>
              {uploading ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Save'}
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={cancelUpload}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}

        {/* Image List */}
        {loading ? (
          <div className="text-center py-4 text-muted-foreground text-sm">Loading...</div>
        ) : images.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">No images</div>
        ) : (
          <div className="border rounded-lg divide-y">
            {images.map((img) => (
              <div key={img.name} className="flex items-center gap-3 p-2 hover:bg-muted/30">
                {/* Thumbnail */}
                <div className="w-20 h-10 rounded overflow-hidden bg-muted flex-shrink-0">
                  <img src={img.url} alt={img.name} className="w-full h-full object-cover" loading="lazy" />
                </div>

                {/* Version/Name */}
                <div className="flex-1 min-w-0">
                  {!img.isDefault && editingVersion === img.version ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={newNickname}
                        onChange={(e) => setNewNickname(e.target.value)}
                        className="h-7 text-sm font-mono"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(img.version!);
                          if (e.key === 'Escape') setEditingVersion(null);
                        }}
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleRename(img.version!)}>
                        <Check className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingVersion(null)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {img.isDefault ? (
                        <span className="text-sm text-muted-foreground">Default (fallback)</span>
                      ) : (
                        <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">?v={img.version}</code>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyShareUrl(img.version)} title="Copy URL">
                    <Copy className="w-3 h-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => window.open(img.url, '_blank')} title="Open">
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                  {!img.isDefault && (
                    <>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7" 
                        onClick={() => { setEditingVersion(img.version); setNewNickname(img.version || ''); }}
                        title="Rename"
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7 text-destructive hover:text-destructive" 
                        onClick={() => handleDelete(img.name)}
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
