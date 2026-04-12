import React, { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ImageIcon, Upload, Trash2, Edit2, Search, Tag, Sparkles, X, Check, Plus, Settings, Loader2, Wand2
} from "lucide-react";
import { StyleCategoryManager } from "./StyleCategoryManager";

export interface GalleryImage {
  id: string;
  file_name: string;
  display_name: string;
  file_url: string;
  source_type: 'uploaded' | 'ai_generated';
  tags: string[];
  style_category_ids: string[];
  ai_prompt: string | null;
  use_count: number;
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface StyleCategory {
  id: string;
  name: string;
  description: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
}

interface ImageGalleryProps {
  mode?: 'manage' | 'pick';
  onSelect?: (imageUrl: string) => void;
  articleContent?: string;
  articleTitle?: string;
}

export function ImageGallery({ mode = 'manage', onSelect, articleContent, articleTitle }: ImageGalleryProps) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [categories, setCategories] = useState<StyleCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSourceTab, setActiveSourceTab] = useState<string>("uploaded");
  const [editImage, setEditImage] = useState<GalleryImage | null>(null);
  const [editName, setEditName] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editCategories, setEditCategories] = useState<string[]>([]);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [imgRes, catRes] = await Promise.all([
      (supabase as any).from('social_media_gallery').select('*').eq('is_active', true).order('created_at', { ascending: false }),
      (supabase as any).from('gallery_style_categories').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    ]);
    setImages((imgRes.data as GalleryImage[]) || []);
    setCategories((catRes.data as StyleCategory[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredImages = images.filter(img => {
    const matchesSource = img.source_type === activeSourceTab;
    const matchesSearch = !searchQuery || 
      img.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      img.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSource && matchesSearch;
  });

  const handleUpload = async (files: FileList) => {
    setUploading(true);
    let uploadCount = 0;
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop();
      const fileName = `gallery_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from('social-gallery')
        .upload(fileName, file, { contentType: file.type, upsert: true });
      if (error) { toast.error(`Upload failed: ${error.message}`); continue; }

      const { data: urlData } = supabase.storage.from('social-gallery').getPublicUrl(fileName);
      if (!urlData?.publicUrl) continue;

      await (supabase as any).from('social_media_gallery').insert({
        file_name: fileName,
        display_name: file.name.replace(/\.[^.]+$/, ''),
        file_url: urlData.publicUrl,
        source_type: 'uploaded',
        mime_type: file.type,
        file_size_bytes: file.size,
      });
      uploadCount++;
    }
    toast.success(`${uploadCount} image(s) added to gallery`);
    setUploading(false);
    loadData();
  };

  const handleTrioGenerate = async () => {
    if (!articleContent) {
      toast.error("No article content available. Open this gallery from an article editor to use Trio Generate.");
      return;
    }

    // Gather uploaded images as style references
    const uploadedImages = images
      .filter(i => i.source_type === 'uploaded')
      .slice(0, 5)
      .map(i => i.file_url);

    setGenerating(true);
    setActiveSourceTab('ai_generated');
    toast.info("Generating 3 AI thumbnails... this may take 30-60 seconds.");

    try {
      const { data, error } = await supabase.functions.invoke('generate-gallery-images', {
        body: {
          articleContent,
          articleTitle,
          styleImageUrls: uploadedImages,
        },
      });

      if (error) throw error;

      if (data?.images?.length) {
        toast.success(`Generated ${data.images.length} thumbnail(s)! Select any to use, or leave them in the gallery.`);
        loadData();
      } else {
        toast.error("No images were generated. Please try again.");
      }
    } catch (err: any) {
      console.error("Trio generate error:", err);
      toast.error(err?.message || "Failed to generate images");
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (img: GalleryImage) => {
    await (supabase as any).from('social_media_gallery').update({ is_active: false }).eq('id', img.id);
    toast.success('Image removed from gallery');
    loadData();
  };

  const openEdit = (img: GalleryImage) => {
    setEditImage(img);
    setEditName(img.display_name);
    setEditTags(img.tags.join(', '));
    setEditCategories(img.style_category_ids || []);
  };

  const saveEdit = async () => {
    if (!editImage) return;
    const tags = editTags.split(',').map(t => t.trim()).filter(Boolean);
    await (supabase as any).from('social_media_gallery').update({
      display_name: editName.trim(),
      tags,
      style_category_ids: editCategories,
      updated_at: new Date().toISOString(),
    }).eq('id', editImage.id);
    toast.success('Image updated');
    setEditImage(null);
    loadData();
  };

  const toggleCategory = (catId: string) => {
    setEditCategories(prev => prev.includes(catId) ? prev.filter(c => c !== catId) : [...prev, catId]);
  };

  const getCategoryName = (catId: string) => categories.find(c => c.id === catId)?.name || '';
  const getCategoryColor = (catId: string) => categories.find(c => c.id === catId)?.color || '#888';

  return (
    <Card className={mode === 'pick' ? 'border-0 shadow-none' : ''}>
      {mode === 'manage' && (
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-primary" />
              Social Media Image Gallery
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowCategoryManager(true)}>
                <Settings className="h-4 w-4 mr-1" /> Style Categories
              </Button>
              <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                <Upload className="h-4 w-4 mr-1" /> {uploading ? 'Uploading...' : 'Upload Images'}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className="space-y-4">
        {mode === 'pick' && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <Upload className="h-4 w-4 mr-1" /> Upload
            </Button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleUpload(e.target.files)}
        />

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or tag..."
              className="pl-9 text-sm"
            />
          </div>
        </div>

        <Tabs value={activeSourceTab} onValueChange={setActiveSourceTab}>
          <TabsList>
            <TabsTrigger value="uploaded">
              <Upload className="h-3.5 w-3.5 mr-1" /> Uploaded ({images.filter(i => i.source_type === 'uploaded').length})
            </TabsTrigger>
            <TabsTrigger value="ai_generated">
              <Sparkles className="h-3.5 w-3.5 mr-1" /> AI Generated ({images.filter(i => i.source_type === 'ai_generated').length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeSourceTab} className="mt-3">
            {/* Trio Generate button on AI Generated tab */}
            {activeSourceTab === 'ai_generated' && (
              <div className="mb-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTrioGenerate}
                  disabled={generating || !articleContent}
                  className="gap-2 border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  {generating ? 'Generating 3 thumbnails...' : 'Trio Generate'}
                </Button>
                {!articleContent && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Open gallery from an article editor to enable Trio Generate.
                  </p>
                )}
              </div>
            )}

            <ScrollArea className={mode === 'manage' ? 'h-[500px]' : 'h-[350px]'}>
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Loading...</p>
              ) : filteredImages.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {activeSourceTab === 'uploaded' ? 'No uploaded images yet. Click Upload to add some!' : 'No AI-generated images yet. Use Trio Generate or the Content Repurposer.'}
                </p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pr-3">
                  {filteredImages.map((img) => (
                    <div
                      key={img.id}
                      className={`group relative border rounded-lg overflow-hidden transition-all hover:ring-2 hover:ring-primary/50 ${mode === 'pick' ? 'cursor-pointer' : ''}`}
                      onClick={mode === 'pick' ? () => onSelect?.(img.file_url) : undefined}
                    >
                      <div className="aspect-square bg-muted">
                        <img
                          src={`${img.file_url}?width=200&height=200&resize=cover`}
                          alt={img.display_name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="p-2 space-y-1">
                        <p className="text-xs font-medium truncate">{img.display_name}</p>
                        <div className="flex flex-wrap gap-1">
                          {img.style_category_ids?.map(catId => (
                            <span
                              key={catId}
                              className="text-[9px] px-1.5 py-0.5 rounded-full text-white font-medium"
                              style={{ backgroundColor: getCategoryColor(catId) }}
                            >
                              {getCategoryName(catId)}
                            </span>
                          ))}
                          {img.tags?.slice(0, 2).map(tag => (
                            <Badge key={tag} variant="outline" className="text-[9px] px-1 py-0">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        {img.use_count > 0 && (
                          <p className="text-[10px] text-muted-foreground">Used {img.use_count}x</p>
                        )}
                      </div>

                      {mode === 'manage' && (
                        <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="icon" variant="secondary" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(img); }}>
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="destructive" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleDelete(img); }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}

                      {mode === 'pick' && (
                        <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Check className="h-8 w-8 text-primary" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={!!editImage} onOpenChange={(open) => !open && setEditImage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Image</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {editImage && (
              <img src={editImage.file_url} alt="" className="w-full max-h-48 object-contain rounded-lg bg-muted" />
            )}
            <div className="space-y-2">
              <Label className="text-xs">Display Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Tags (comma-separated)</Label>
              <Input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="logo, mascot, orange" className="text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Style Categories</Label>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => toggleCategory(cat.id)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                      editCategories.includes(cat.id)
                        ? 'text-white border-transparent'
                        : 'text-foreground border-border hover:border-primary'
                    }`}
                    style={editCategories.includes(cat.id) ? { backgroundColor: cat.color } : {}}
                  >
                    {editCategories.includes(cat.id) && <Check className="h-3 w-3 inline mr-1" />}
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
            {editImage?.ai_prompt && (
              <div className="space-y-1">
                <Label className="text-xs">AI Prompt Used</Label>
                <p className="text-xs text-muted-foreground bg-muted rounded p-2">{editImage.ai_prompt}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditImage(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Style Category Manager Dialog */}
      <Dialog open={showCategoryManager} onOpenChange={setShowCategoryManager}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Style Categories</DialogTitle>
          </DialogHeader>
          <StyleCategoryManager categories={categories} onUpdate={loadData} />
        </DialogContent>
      </Dialog>
    </Card>
  );
}
