import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Save, Plus, Trash2, ArrowUp, ArrowDown, Pencil, KeyRound, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { NO_LUBE_LANGUAGES } from './NoLubeChannelPanel';

export const NO_LUBE_STYLES: { code: string; label: string; hint: string }[] = [
  { code: 'business',   label: 'Business',           hint: 'measured, suit-and-tie analyst tone' },
  { code: 'degen',      label: 'Degen',              hint: 'fast, slangy, casino energy' },
  { code: 'old_school', label: 'Old School',         hint: '2017 CT vibe, careful TA language' },
  { code: 'gamer',      label: 'Gamer',              hint: 'GG/clutch/raid party vernacular' },
  { code: 'sv',         label: 'Silicon Valley',     hint: 'product-launch / VC deck phrasing' },
  { code: 'alpha_inner', label: 'Alpha — Inner Circle', hint: 'whispered, "for the family" coded leaks' },
  { code: 'alpha_pro',  label: 'Alpha — Pro Desk',   hint: 'desk-style risk callouts, clinical' },
  { code: 'alpha_street', label: 'Alpha — Street',   hint: 'street-talk, blunt, no euphemism' },
];

const PLATFORMS = ['x', 'instagram', 'tiktok', 'youtube', 'threads', 'facebook', 'discord', 'telegram', 'other'] as const;

interface SocialRow {
  id: string;
  platform: string;
  handle: string;
  display_order: number;
  password_ciphertext: string | null;
}

export function NoLubeProfileHeader() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [language, setLanguage] = useState('en');
  const [style, setStyle] = useState('degen');
  const [snapshotUseMintImage, setSnapshotUseMintImage] = useState(true);

  const [socials, setSocials] = useState<SocialRow[]>([]);
  const [pwEditing, setPwEditing] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: g }, { data: s }] = await Promise.all([
        (supabase as any).from('no_lube_global_profile').select('*').eq('id', 'singleton').maybeSingle(),
        (supabase as any).from('no_lube_socials').select('*').order('display_order', { ascending: true }),
      ]);
      if (g) {
        setLanguage(g.language || 'en');
        setStyle(g.style || 'degen');
        setSnapshotUseMintImage(g.snapshot_use_mint_image !== false);
      }
      setSocials((s as SocialRow[]) || []);
    } catch (e: any) {
      toast.error(`Failed to load: ${e.message}`);
    } finally { setLoading(false); }
  };

  const saveGlobal = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('no_lube_global_profile')
        .upsert({
          id: 'singleton',
          language,
          style,
          snapshot_use_mint_image: snapshotUseMintImage,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      if (error) throw error;
      toast.success('Profile saved');
    } catch (e: any) { toast.error(`Save failed: ${e.message}`); }
    finally { setSaving(false); }
  };

  const addSocial = async () => {
    const nextOrder = (socials[socials.length - 1]?.display_order ?? -1) + 1;
    const { data, error } = await (supabase as any)
      .from('no_lube_socials')
      .insert({ platform: 'x', handle: '', display_order: nextOrder })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    setSocials([...socials, data as SocialRow]);
  };

  const updateRow = async (id: string, patch: Partial<SocialRow>) => {
    setSocials(socials.map(r => r.id === id ? { ...r, ...patch } : r));
    const { error } = await (supabase as any)
      .from('no_lube_socials').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) toast.error(error.message);
  };

  const removeRow = async (id: string) => {
    const { error } = await (supabase as any).from('no_lube_socials').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    setSocials(socials.filter(r => r.id !== id));
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= socials.length) return;
    const a = socials[idx], b = socials[j];
    const next = [...socials];
    next[idx] = { ...b, display_order: a.display_order };
    next[j]   = { ...a, display_order: b.display_order };
    setSocials(next);
    await Promise.all([
      (supabase as any).from('no_lube_socials').update({ display_order: a.display_order }).eq('id', b.id),
      (supabase as any).from('no_lube_socials').update({ display_order: b.display_order }).eq('id', a.id),
    ]);
  };

  const openPassword = (id: string) => { setPwEditing(id); setPwValue(''); };
  const cancelPassword = () => { setPwEditing(null); setPwValue(''); };

  const savePassword = async (id: string, clear = false) => {
    setPwSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('no-lube-social-credential', {
        body: clear ? { id, clear: true } : { id, password: pwValue },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'failed');
      toast.success(clear ? 'Password cleared' : 'Password saved (encrypted server-side)');
      // Refresh just this row's has_password flag
      const { data: row } = await (supabase as any)
        .from('no_lube_socials').select('password_ciphertext').eq('id', id).maybeSingle();
      setSocials(s => s.map(r => r.id === id ? { ...r, password_ciphertext: row?.password_ciphertext ?? null } : r));
      cancelPassword();
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`);
    } finally { setPwSaving(false); }
  };

  return (
    <Card className="bg-pink-500/5 border-pink-500/30">
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-semibold text-pink-300">
              🐸 No Lube — Master / Public / Private
            </Label>
            <p className="text-xs text-muted-foreground">
              Shared across all three sub-tabs. Style controls the AI tone for natural-language inserts;
              language is applied to every push.
            </p>
          </div>
          <Button size="sm" onClick={saveGlobal} disabled={saving || loading}>
            {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
            Save
          </Button>
        </div>

        {loading ? (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Channel Style</Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NO_LUBE_STYLES.map(s => (
                      <SelectItem key={s.code} value={s.code}>
                        <span className="font-medium">{s.label}</span>
                        <span className="text-muted-foreground ml-2 text-[11px]">— {s.hint}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Post Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NO_LUBE_LANGUAGES.map(l => (
                      <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-start justify-between gap-3 p-3 rounded border border-border bg-card/40">
              <div className="space-y-0.5">
                <Label className="text-xs font-semibold">Use token mint image on snapshot posts</Label>
                <p className="text-[11px] text-muted-foreground">
                  Attaches the token's mint artwork as the Telegram photo header on the
                  fast first-touch (snapshot) post. Big-picture follow-ups keep using the
                  AI-rendered card pipeline.
                </p>
              </div>
              <Switch
                checked={snapshotUseMintImage}
                onCheckedChange={setSnapshotUseMintImage}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Socials (ordered)</Label>
                <Button size="sm" variant="outline" onClick={addSocial}>
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              {socials.length === 0 && (
                <p className="text-[11px] text-muted-foreground">No socials yet. Add X, Instagram, TikTok, etc.</p>
              )}
              <div className="space-y-1.5">
                {socials.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-1.5 p-2 rounded border border-border bg-card/40">
                    <div className="flex flex-col">
                      <button className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                              onClick={() => move(i, -1)} disabled={i === 0} title="Move up">
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                              onClick={() => move(i, +1)} disabled={i === socials.length - 1} title="Move down">
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>
                    <Select value={s.platform} onValueChange={(v) => updateRow(s.id, { platform: v })}>
                      <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      value={s.handle}
                      onChange={(e) => setSocials(socials.map(r => r.id === s.id ? { ...r, handle: e.target.value } : r))}
                      onBlur={(e) => updateRow(s.id, { handle: e.target.value })}
                      placeholder="@handle"
                      className="h-8 text-xs"
                    />
                    {pwEditing === s.id ? (
                      <>
                        <Input
                          type="password"
                          value={pwValue}
                          onChange={(e) => setPwValue(e.target.value)}
                          placeholder="Password"
                          className="h-8 text-xs w-44"
                          autoFocus
                        />
                        <Button size="sm" variant="outline" className="h-8 px-2"
                                onClick={() => savePassword(s.id)} disabled={pwSaving || !pwValue}>
                          {pwSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={cancelPassword}>
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Badge variant="outline" className={s.password_ciphertext
                          ? 'border-green-500/50 text-green-400 text-[10px] h-6'
                          : 'border-muted-foreground/40 text-muted-foreground text-[10px] h-6'}>
                          <KeyRound className="h-2.5 w-2.5 mr-1" />
                          {s.password_ciphertext ? 'set' : 'none'}
                        </Badge>
                        <Button size="sm" variant="ghost" className="h-8 px-2"
                                title="Edit password (encrypted server-side)"
                                onClick={() => openPassword(s.id)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        {s.password_ciphertext && (
                          <Button size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground"
                                  title="Clear password" onClick={() => savePassword(s.id, true)}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </>
                    )}
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-red-400 hover:text-red-300"
                            onClick={() => removeRow(s.id)} title="Remove">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Passwords are encrypted server-side (AES-256-GCM). The browser only sees that one is set.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}