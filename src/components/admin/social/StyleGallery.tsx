import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Palette, Plus, Trash2, Upload, Star, Check, Image, X
} from "lucide-react";

interface StylePreset {
  id: string;
  name: string;
  description: string | null;
  style_type: string;
  style_prompt: string;
  reference_image_urls: string[];
  thumbnail_url: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

export function StyleGallery() {
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [uploadingImages, setUploadingImages] = useState(false);
  const [newRefImages, setNewRefImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPresets = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('image_style_presets')
      .select('*')
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    setPresets((data as StylePreset[]) || []);
    setLoading(false);
  };

  useEffect(() => { loadPresets(); }, []);

  const setDefault = async (id: string) => {
    // Unset all defaults first
    await supabase.from('image_style_presets').update({ is_default: false }).neq('id', '');
    await supabase.from('image_style_presets').update({ is_default: true }).eq('id', id);
    toast.success('Default style updated — AI will use this for new images');
    loadPresets();
  };

  const deletePreset = async (id: string) => {
    await supabase.from('image_style_presets').update({ is_active: false }).eq('id', id);
    toast.success('Style removed');
    loadPresets();
  };

  const uploadRefImages = async (files: FileList) => {
    setUploadingImages(true);
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop();
      const fileName = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from('style-references')
        .upload(fileName, file, { contentType: file.type, upsert: true });
      if (error) {
        toast.error(`Upload failed: ${error.message}`);
        continue;
      }
      const { data: urlData } = supabase.storage
        .from('style-references')
        .getPublicUrl(fileName);
      if (urlData?.publicUrl) urls.push(urlData.publicUrl);
    }
    setNewRefImages(prev => [...prev, ...urls]);
    setUploadingImages(false);
    toast.success(`${urls.length} image(s) uploaded`);
  };

  const createCustomStyle = async () => {
    if (!newName.trim() || !newPrompt.trim()) {
      toast.error('Name and style prompt are required');
      return;
    }
    const { error } = await supabase.from('image_style_presets').insert({
      name: newName.trim(),
      description: newDescription.trim() || null,
      style_type: 'custom',
      style_prompt: newPrompt.trim(),
      reference_image_urls: newRefImages,
      thumbnail_url: newRefImages[0] || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Custom style created!');
    setNewName('');
    setNewDescription('');
    setNewPrompt('');
    setNewRefImages([]);
    setShowCreate(false);
    loadPresets();
  };

  const defaultPreset = presets.find(p => p.is_default);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-purple-400" />
            Image Style Gallery
          </span>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-4 w-4 mr-1" />
            Custom Style
          </Button>
        </CardTitle>
        {defaultPreset && (
          <p className="text-xs text-muted-foreground">
            Active style: <span className="text-primary font-medium">{defaultPreset.name}</span>
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create custom style form */}
        {showCreate && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <h4 className="text-sm font-semibold">Create Custom Style</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Style Name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Glitch Art Crypto"
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description (optional)</Label>
                <Input
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Short description"
                  className="text-sm"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Style Prompt (what the AI sees)</Label>
              <Textarea
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                placeholder="Describe the visual style in detail. e.g. 'Recreate the concept in a glitch art style with RGB channel splitting, VHS noise, and corrupted pixel effects...'"
                className="text-sm min-h-[80px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reference Images (optional — AI uses these as style examples)</Label>
              <div className="flex gap-2 flex-wrap">
                {newRefImages.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt="ref" className="h-16 w-16 object-cover rounded border" />
                    <button
                      onClick={() => setNewRefImages(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="h-16 w-16 border-2 border-dashed rounded flex items-center justify-center hover:border-primary transition-colors"
                  disabled={uploadingImages}
                >
                  {uploadingImages ? (
                    <span className="text-xs animate-pulse">...</span>
                  ) : (
                    <Upload className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && uploadRefImages(e.target.files)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={createCustomStyle} disabled={!newName.trim() || !newPrompt.trim()}>
                Create Style
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Style presets grid */}
        <ScrollArea className="h-[400px]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-3">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className={`border rounded-lg p-3 space-y-2 transition-all ${
                  preset.is_default
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'hover:border-muted-foreground/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{preset.name}</span>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {preset.style_type}
                    </Badge>
                    {preset.is_default && (
                      <Badge className="bg-primary/20 text-primary text-[10px]">
                        <Star className="h-2.5 w-2.5 mr-0.5" /> Active
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {!preset.is_default && (
                      <Button size="sm" variant="ghost" onClick={() => setDefault(preset.id)} title="Set as default">
                        <Check className="h-3 w-3" />
                      </Button>
                    )}
                    {preset.style_type === 'custom' && (
                      <Button size="sm" variant="ghost" onClick={() => deletePreset(preset.id)}>
                        <Trash2 className="h-3 w-3 text-red-400" />
                      </Button>
                    )}
                  </div>
                </div>

                {preset.description && (
                  <p className="text-xs text-muted-foreground">{preset.description}</p>
                )}

                {/* Reference images */}
                {preset.reference_image_urls?.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {preset.reference_image_urls.map((url, i) => (
                      <img key={i} src={url} alt="ref" className="h-12 w-12 object-cover rounded border" />
                    ))}
                  </div>
                )}

                <details className="text-xs">
                  <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                    View prompt
                  </summary>
                  <p className="mt-1 text-muted-foreground bg-muted/50 rounded p-2 text-[11px] leading-relaxed">
                    {preset.style_prompt}
                  </p>
                </details>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
