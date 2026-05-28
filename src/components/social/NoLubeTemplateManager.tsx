import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Trash2, Upload, RefreshCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

type TplRow = {
  id: string;
  profile_kind: 'private' | 'public';
  language: string;
  aspect: string;
  template_name: string;
  template_url: string;
  enabled: boolean;
  is_default: boolean;
  font_family: string | null;
  font_url: string | null;
  safe_zones: Record<string, { x: number; y: number; w: number; h: number; shape?: string }> | null;
  show_url: boolean;
  url_to_show: string | null;
  show_ca: boolean;
  exif_owner: string | null;
  exif_copyright: string | null;
  exif_description: string | null;
};

const DEFAULT_SAFE_ZONES = {
  mint_pfp: { x: 60, y: 140, w: 140, h: 140, shape: 'circle' },
  ticker: { x: 220, y: 150, w: 500, h: 80 },
  ca: { x: 220, y: 230, w: 500, h: 30 },
  multiplier: { x: 60, y: 320, w: 200, h: 110 },
  entry_label: { x: 60, y: 480, w: 200, h: 30 },
  entry_value: { x: 60, y: 520, w: 200, h: 60 },
  current_label: { x: 300, y: 480, w: 200, h: 30 },
  current_value: { x: 300, y: 520, w: 200, h: 60 },
  character: { x: 680, y: 60, w: 340, h: 560 },
  show_url: { x: 30, y: 600, w: 964, h: 28 },
};

const ZONE_COLORS: Record<string, string> = {
  mint_pfp: '#22d3ee',
  ticker: '#facc15',
  ca: '#94a3b8',
  multiplier: '#f472b6',
  entry_label: '#a3e635',
  entry_value: '#84cc16',
  current_label: '#fb923c',
  current_value: '#f97316',
  character: '#a78bfa',
  show_url: '#38bdf8',
};

type ChannelSetting = {
  profile_kind: 'public' | 'private';
  active_template_id: string | null;
  rotation_mode: 'sticky' | 'random' | 'round_robin';
};

export function NoLubeTemplateManager() {
  const [rows, setRows] = useState<TplRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [profileKind, setProfileKind] = useState<'private' | 'public'>('public');
  const [language, setLanguage] = useState('en');
  const [templateName, setTemplateName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [settings, setSettings] = useState<Record<string, ChannelSetting>>({});

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('no_lube_card_templates')
        .select('*')
        .order('profile_kind', { ascending: true })
        .order('language', { ascending: true });
      if (error) throw error;
      setRows((data || []) as TplRow[]);
      const { data: s } = await (supabase as any)
        .from('no_lube_channel_settings').select('*');
      const map: Record<string, ChannelSetting> = {};
      for (const r of (s || []) as ChannelSetting[]) map[r.profile_kind] = r;
      setSettings(map);
    } catch (e: any) {
      toast.error(`Load failed: ${e.message}`);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const saveSetting = async (kind: 'public' | 'private', patch: Partial<ChannelSetting>) => {
    const current = settings[kind] || { profile_kind: kind, active_template_id: null, rotation_mode: 'sticky' };
    const next = { ...current, ...patch, profile_kind: kind };
    try {
      const { error } = await (supabase as any)
        .from('no_lube_channel_settings')
        .upsert(next, { onConflict: 'profile_kind' });
      if (error) throw error;
      setSettings(prev => ({ ...prev, [kind]: next }));
      toast.success('Channel settings saved');
    } catch (e: any) { toast.error(`Save failed: ${e.message}`); }
  };

  const handleUpload = async () => {
    if (!file) { toast.error('Pick a PNG'); return; }
    if (!templateName.trim()) { toast.error('Name required'); return; }
    setUploading(true);
    try {
      const path = `${profileKind}/${language}/${Date.now()}-${templateName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      const { error: upErr } = await supabase.storage.from('no-lube-card-templates').upload(path, file, {
        contentType: file.type || 'image/png', upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('no-lube-card-templates').getPublicUrl(path);
      const { error: insErr } = await (supabase as any).from('no_lube_card_templates').insert({
        profile_kind: profileKind,
        language: language.trim() || 'universal',
        aspect: 'landscape_tg',
        template_name: templateName.trim(),
        template_url: pub.publicUrl,
        enabled: true,
        is_default: false,
        safe_zones: DEFAULT_SAFE_ZONES,
        show_url: profileKind === 'public',
        show_ca: true,
      });
      if (insErr) throw insErr;
      toast.success('Template uploaded');
      setTemplateName(''); setFile(null);
      void load();
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message}`);
    } finally { setUploading(false); }
  };

  const handleDelete = async (row: TplRow) => {
    if (!confirm(`Delete template "${row.template_name}"?`)) return;
    try {
      const { error } = await (supabase as any).from('no_lube_card_templates').delete().eq('id', row.id);
      if (error) throw error;
      toast.success('Deleted');
      void load();
    } catch (e: any) { toast.error(`Delete failed: ${e.message}`); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">Upload background template (1024×640 PNG)</Label>
            <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <Label className="text-xs">Profile kind</Label>
              <select
                value={profileKind}
                onChange={(e) => setProfileKind(e.target.value as 'private' | 'public')}
                className="w-full h-9 rounded-md bg-background border border-input px-2 text-sm"
              >
                <option value="public">public</option>
                <option value="private">private</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Language</Label>
              <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en / ko / universal" />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Template name</Label>
              <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="public-en-default" />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">PNG file</Label>
              <Input type="file" accept="image/png" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span className="ml-2">Upload</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Default safe-zones get attached automatically — edit per-template below. Logo and channel-name decorations can be baked into the PNG.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <Label className="text-base font-semibold">Active background per channel</Label>
          <p className="text-xs text-muted-foreground">
            Sticky = always use the selected template. Random = pick any enabled template for this channel on every render. Round-robin = cycle through enabled templates in order.
          </p>
          {(['public','private'] as const).map(kind => {
            const opts = rows.filter(r => r.profile_kind === kind && r.enabled);
            const cur = settings[kind] || { profile_kind: kind, active_template_id: null, rotation_mode: 'sticky' as const };
            return (
              <div key={kind} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end border-t pt-3 first:border-t-0 first:pt-0">
                <div>
                  <Label className="text-xs uppercase">{kind} channel</Label>
                  <Badge variant={kind === 'private' ? 'default' : 'secondary'}>{kind}</Badge>
                </div>
                <div>
                  <Label className="text-xs">Active template</Label>
                  <select
                    value={cur.active_template_id || ''}
                    onChange={(e) => saveSetting(kind, { active_template_id: e.target.value || null })}
                    className="w-full h-9 rounded-md bg-background border border-input px-2 text-sm"
                  >
                    <option value="">— none (fallback to default) —</option>
                    {opts.map(o => (
                      <option key={o.id} value={o.id}>{o.template_name} [{o.language}]</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Rotation mode</Label>
                  <select
                    value={cur.rotation_mode}
                    onChange={(e) => saveSetting(kind, { rotation_mode: e.target.value as ChannelSetting['rotation_mode'] })}
                    className="w-full h-9 rounded-md bg-background border border-input px-2 text-sm"
                  >
                    <option value="sticky">sticky (always active)</option>
                    <option value="random">random</option>
                    <option value="round_robin">round-robin</option>
                  </select>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No templates yet. Upload one above.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <TemplateEditor key={r.id} row={r} onChange={load} onDelete={() => handleDelete(r)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateEditor({ row, onChange, onDelete }: { row: TplRow; onChange: () => void; onDelete: () => void }) {
  const [draft, setDraft] = useState<TplRow>(row);
  const [saving, setSaving] = useState(false);
  const [zonesText, setZonesText] = useState(JSON.stringify(row.safe_zones ?? DEFAULT_SAFE_ZONES, null, 2));
  const [zonesValid, setZonesValid] = useState(true);

  useEffect(() => { setDraft(row); setZonesText(JSON.stringify(row.safe_zones ?? DEFAULT_SAFE_ZONES, null, 2)); }, [row.id]);

  const parsedZones = useMemo(() => {
    try {
      const z = JSON.parse(zonesText);
      setZonesValid(true);
      return z as Record<string, { x: number; y: number; w: number; h: number; shape?: string }>;
    } catch { setZonesValid(false); return null; }
  }, [zonesText]);

  const save = async () => {
    if (!zonesValid) { toast.error('Safe zones JSON invalid'); return; }
    setSaving(true);
    try {
      const { error } = await (supabase as any).from('no_lube_card_templates').update({
        template_name: draft.template_name,
        enabled: draft.enabled,
        is_default: draft.is_default,
        font_family: draft.font_family,
        font_url: draft.font_url,
        safe_zones: parsedZones,
        show_url: draft.show_url,
        url_to_show: draft.url_to_show,
        show_ca: draft.show_ca,
        exif_owner: draft.exif_owner,
        exif_copyright: draft.exif_copyright,
        exif_description: draft.exif_description,
      }).eq('id', row.id);
      if (error) throw error;
      toast.success('Saved');
      onChange();
    } catch (e: any) { toast.error(`Save failed: ${e.message}`); }
    finally { setSaving(false); }
  };

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={draft.profile_kind === 'private' ? 'default' : 'secondary'}>{draft.profile_kind}</Badge>
            <Badge variant="outline">{draft.language}</Badge>
            <Badge variant="outline">{draft.aspect}</Badge>
            <Input
              value={draft.template_name}
              onChange={(e) => setDraft({ ...draft, template_name: e.target.value })}
              className="h-7 w-64"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-xs"><Switch checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} /> enabled</label>
            <label className="flex items-center gap-1 text-xs"><Switch checked={draft.is_default} onCheckedChange={(v) => setDraft({ ...draft, is_default: v })} /> default</label>
            <Button variant="destructive" size="sm" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="relative w-full rounded-md overflow-hidden border bg-black" style={{ aspectRatio: '1024 / 640' }}>
              {draft.template_url && (
                <img src={draft.template_url} alt={draft.template_name} className="absolute inset-0 w-full h-full object-cover" />
              )}
              {parsedZones && Object.entries(parsedZones).map(([k, z]) => (
                <div key={k}
                  className="absolute border-2 text-[10px] font-mono leading-none"
                  style={{
                    left: `${(z.x / 1024) * 100}%`,
                    top: `${(z.y / 640) * 100}%`,
                    width: `${(z.w / 1024) * 100}%`,
                    height: `${(z.h / 640) * 100}%`,
                    borderColor: ZONE_COLORS[k] ?? '#fff',
                    background: `${ZONE_COLORS[k] ?? '#fff'}22`,
                    borderRadius: z.shape === 'circle' ? '9999px' : undefined,
                  }}
                >
                  <span className="bg-black/70 px-1 text-white">{k}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Font family</Label>
                <Input value={draft.font_family ?? ''} onChange={(e) => setDraft({ ...draft, font_family: e.target.value })} placeholder="Bebas Neue" />
              </div>
              <div>
                <Label className="text-xs">Font URL (.ttf, optional)</Label>
                <Input value={draft.font_url ?? ''} onChange={(e) => setDraft({ ...draft, font_url: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-xs"><Switch checked={draft.show_url} onCheckedChange={(v) => setDraft({ ...draft, show_url: v })} /> show URL</label>
              <label className="flex items-center gap-2 text-xs"><Switch checked={draft.show_ca} onCheckedChange={(v) => setDraft({ ...draft, show_ca: v })} /> show CA</label>
              <div className="col-span-2">
                <Label className="text-xs">URL to show (overrides profile default)</Label>
                <Input value={draft.url_to_show ?? ''} onChange={(e) => setDraft({ ...draft, url_to_show: e.target.value })} placeholder="t.me/yourchannel" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Safe zones JSON {!zonesValid && <span className="text-destructive">(invalid)</span>}</Label>
            <Textarea
              value={zonesText}
              onChange={(e) => setZonesText(e.target.value)}
              className="font-mono text-xs h-72"
            />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">EXIF owner</Label>
                <Input value={draft.exif_owner ?? ''} onChange={(e) => setDraft({ ...draft, exif_owner: e.target.value })} placeholder="BlackBox Farm" />
              </div>
              <div>
                <Label className="text-xs">EXIF copyright</Label>
                <Input value={draft.exif_copyright ?? ''} onChange={(e) => setDraft({ ...draft, exif_copyright: e.target.value })} placeholder="© BlackBox" />
              </div>
              <div>
                <Label className="text-xs">EXIF description</Label>
                <Input value={draft.exif_description ?? ''} onChange={(e) => setDraft({ ...draft, exif_description: e.target.value })} placeholder="No Lube card" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span className="ml-2">Save template</span>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}