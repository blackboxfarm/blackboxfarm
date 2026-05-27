import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, Upload, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

type AssetRow = {
  id: string;
  category: string;
  name: string;
  tags: string[] | null;
  language: string | null;
  storage_path: string;
  public_url: string | null;
  enabled: boolean;
  usage_count: number | null;
  notes: string | null;
  created_at: string;
};

const CATEGORIES = ['background', 'character', 'frame', 'sticker', 'logo'] as const;

export function NoLubeAssetLibrary() {
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState<string>('character');
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [language, setLanguage] = useState('en');
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('no_lube_assets')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRows((data || []) as AssetRow[]);
    } catch (e: any) {
      toast.error(`Load failed: ${e.message}`);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleUpload = async () => {
    if (!file) { toast.error('Pick a file'); return; }
    if (!name.trim()) { toast.error('Name required'); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `${category}/${Date.now()}-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${ext}`;
      const { error: upErr } = await supabase.storage.from('no-lube-assets').upload(path, file, {
        contentType: file.type || 'image/png', upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('no-lube-assets').getPublicUrl(path);
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      const { error: insErr } = await (supabase as any).from('no_lube_assets').insert({
        category, name: name.trim(), tags: tagList,
        language: language.trim() || null,
        storage_path: path, public_url: pub.publicUrl,
        enabled: true, notes: notes.trim() || null,
      });
      if (insErr) throw insErr;
      toast.success('Asset uploaded');
      setName(''); setTags(''); setNotes(''); setFile(null);
      void load();
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message}`);
    } finally { setUploading(false); }
  };

  const toggleEnabled = async (row: AssetRow) => {
    const { error } = await (supabase as any)
      .from('no_lube_assets').update({ enabled: !row.enabled }).eq('id', row.id);
    if (error) { toast.error(error.message); return; }
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, enabled: !row.enabled } : r));
  };

  const remove = async (row: AssetRow) => {
    if (!confirm(`Delete "${row.name}"?`)) return;
    await supabase.storage.from('no-lube-assets').remove([row.storage_path]).catch(() => {});
    const { error } = await (supabase as any).from('no_lube_assets').delete().eq('id', row.id);
    if (error) { toast.error(error.message); return; }
    setRows(rs => rs.filter(r => r.id !== row.id));
  };

  return (
    <div className="space-y-4">
      <Card className="bg-card/60 border-border">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Upload new asset</Label>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCcw className="h-3 w-3 mr-1" />Refresh
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs">Category</Label>
              <select
                value={category} onChange={e => setCategory(e.target.value)}
                className="w-full bg-background border border-border rounded h-9 px-2 text-sm"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="frog_pepe_01" />
            </div>
            <div>
              <Label className="text-xs">Tags (comma)</Label>
              <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="meme,frog,hype" />
            </div>
            <div>
              <Label className="text-xs">Language</Label>
              <Input value={language} onChange={e => setLanguage(e.target.value)} placeholder="en" />
            </div>
            <div>
              <Label className="text-xs">File</Label>
              <Input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="optional usage hints for the AI prompt" />
          </div>
          <Button onClick={handleUpload} disabled={uploading || !file || !name.trim()} className="bg-pink-600 hover:bg-pink-700">
            {uploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
            Upload
          </Button>
        </CardContent>
      </Card>

      <div>
        <Label className="text-sm font-semibold">Library ({rows.length})</Label>
        {loading ? (
          <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-xs text-muted-foreground mt-2">No assets yet — upload your first meme reference above.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-2">
            {rows.map(r => (
              <Card key={r.id} className={`bg-card/60 ${r.enabled ? 'border-pink-500/40' : 'border-border opacity-50'}`}>
                <CardContent className="p-2 space-y-2">
                  {r.public_url && (
                    <img src={r.public_url} alt={r.name}
                         className="w-full h-24 object-cover rounded border border-border" />
                  )}
                  <div className="text-xs font-mono truncate" title={r.name}>{r.name}</div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
                    {r.language && <Badge variant="outline" className="text-[10px]">{r.language}</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px]" onClick={() => toggleEnabled(r)}>
                      {r.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => remove(r)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}