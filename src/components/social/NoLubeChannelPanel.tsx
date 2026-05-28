import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, RotateCcw, Send, Copy, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { EmojiPickerPopover } from '@/components/admin/telegram/EmojiPickerPopover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { NoLubeProcessPanel } from './NoLubeProcessPanel';

import {
  DEFAULT_TEMPLATES,
  processTemplate,
  type TokenShareData,
  type TemplateName,
} from '@/lib/share-template';

export type NoLubeChannelKind = 'default' | 'public' | 'private' | 'snapshot';

export const NO_LUBE_LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French' },
  { code: 'ar', label: 'Arabic' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese (Mandarin)' },
  { code: 'tr', label: 'Turkish' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)' },
  { code: 'ko', label: 'Korean' },
  { code: 'id', label: 'Indonesian' },
  { code: 'es', label: 'Spanish' },
  { code: 'ru', label: 'Russian' },
  { code: 'vi', label: 'Vietnamese' },
];

interface ChannelProfile {
  kind: 'default' | 'public' | 'private' | 'snapshot';
  telegram_chat_id: string | null;
  telegram_chat_title: string | null;
  telegram_chat_username: string | null;
  tab_nickname: string | null;
  telegram_link: string | null;
  trade_bot_username?: string | null;
  access_purchase_url?: string | null;
  cta_button_text?: string | null;
}

interface Props {
  kind: NoLubeChannelKind;
  templateName: TemplateName;        // 'no_lube' | 'no_lube_public' | 'no_lube_private'
  templateText: string;
  onTemplateChange: (text: string) => void;
  onSaveTemplate: () => Promise<void> | void;
  onResetTemplate: () => void;
  isSaving: boolean;
  previewData: TokenShareData;
}

export function NoLubeChannelPanel({
  kind, templateName, templateText, onTemplateChange,
  onSaveTemplate, onResetTemplate, isSaving, previewData,
}: Props) {
  // Per-tab profile (nickname + telegram link) — applies to all 3 sub-tabs
  const [profile, setProfile] = useState<ChannelProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [resolvingChat, setResolvingChat] = useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Compose & push for THIS channel
  const [mint, setMint] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [composedText, setComposedText] = useState<string | null>(null);
  const [isPushing, setIsPushing] = useState(false);
  const [eligible, setEligible] = useState(true);
  const [verdictClass, setVerdictClass] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [logId, setLogId] = useState<string | null>(null);

  useEffect(() => {
    void loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const loadProfile = async () => {
    setProfileLoading(true);
    try {
      // Snapshot is a post-kind, not its own channel — it always rides the
      // Private channel's chat config. Load the private profile for display so
      // the operator can see where snapshot posts will be delivered.
      const profileKey = kind === 'snapshot' ? 'private' : kind;
      const { data, error } = await (supabase as any)
        .from('no_lube_channel_profiles')
        .select('*')
        .eq('kind', profileKey)
        .maybeSingle();
      if (error) throw error;
      setProfile(
        (data as ChannelProfile | null) ?? {
          kind,
          telegram_chat_id: '',
          telegram_chat_title: '',
          telegram_chat_username: '',
          tab_nickname:
            kind === 'default' ? 'Default'
            : kind === 'public' ? 'Public Channel'
            : kind === 'snapshot' ? 'Snapshot Post (Private)'
            : 'Private Channel',
          telegram_link: '',
        },
      );
    } catch (e: any) {
      toast.error(`Failed to load profile: ${e.message}`);
    } finally {
      setProfileLoading(false);
    }
  };

  const saveProfile = async () => {
    if (!profile) return;
    setProfileSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('no_lube_channel_profiles')
        .upsert({
          ...profile,
          kind,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'kind' });
      if (error) throw error;
      toast.success('Tab profile saved');
    } catch (e: any) {
      toast.error(`Save failed: ${e.message}`);
    } finally {
      setProfileSaving(false);
    }
  };

  const resolveChannelName = async () => {
    if (!profile?.telegram_chat_id) {
      toast.error('Enter a Telegram channel ID first');
      return;
    }
    setResolvingChat(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-get-chat', {
        body: { chat_id: profile.telegram_chat_id.trim() },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'lookup failed');
      setProfile(p => p ? {
        ...p,
        telegram_chat_title: data.title || null,
        telegram_chat_username: data.username || null,
      } : p);
      toast.success(`Resolved: ${data.title || data.username || 'unknown'}`);
    } catch (e: any) {
      toast.error(`Lookup failed: ${e.message}`);
    } finally {
      setResolvingChat(false);
    }
  };

  const handleCompose = async () => {
    const m = mint.trim();
    if (!m) { toast.error('Enter a token address'); return; }
    setIsComposing(true);
    setComposedText(null); setVerdictClass(null); setBlockReason(null); setLogId(null); setEligible(true);
    try {
      // Snapshot is a post-kind that always targets the Private channel with
      // the minimal {no_lube_snapshot_private} template.
      const composeChannel = kind === 'snapshot' ? 'private' : kind;
      const composeKind = kind === 'snapshot' ? 'snapshot' : 'big_picture';
      const { data, error } = await supabase.functions.invoke('no-lube-compose', {
        body: { mint: m, channel: composeChannel, kind: composeKind },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'compose failed');
      setComposedText(data.text);
      setEligible(!!data.post_eligible);
      setVerdictClass(data.verdict_class || null);
      setBlockReason(data.block_reason || null);
      setLogId(data.log_id || null);
      data.post_eligible
        ? toast.success('Composed — review and Push when ready')
        : toast.warning(`Blocked: ${data.block_reason || data.verdict_class}`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to compose');
    } finally {
      setIsComposing(false);
    }
  };

  const handlePush = async () => {
    if (!composedText) return;
    setIsPushing(true);
    try {
      const pushChannel = kind === 'snapshot' ? 'private' : kind;
      const { data, error } = await supabase.functions.invoke('no-lube-push', {
        body: { text: composedText, log_id: logId, channel: pushChannel },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error?.description || data?.error || 'push failed');
      toast.success(`Posted (msg ${data.message_id})`);
    } catch (e: any) {
      toast.error(typeof e.message === 'string' ? e.message : 'Failed to push');
    } finally {
      setIsPushing(false);
    }
  };

  const previewRendered = processTemplate(templateText, previewData);

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) { onTemplateChange(templateText + emoji); return; }
    const start = el.selectionStart ?? templateText.length;
    const end = el.selectionEnd ?? templateText.length;
    const next = templateText.slice(0, start) + emoji + templateText.slice(end);
    onTemplateChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const body = (
    <div className="space-y-4">
      {/* Per-tab profile: nickname + Telegram link + chat ID lookup.
          Hidden on snapshot — snapshot inherits the Private channel config. */}
      {kind !== 'snapshot' && (
      <Card className="bg-card/60 border-border">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Tab settings
            </Label>
            <Button size="sm" variant="outline" onClick={saveProfile} disabled={profileSaving || profileLoading}>
              {profileSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
              Save Tab
            </Button>
          </div>
          {profileLoading || !profile ? (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Tab nickname</Label>
                  <Input
                    value={profile.tab_nickname || ''}
                    onChange={e => setProfile({ ...profile, tab_nickname: e.target.value })}
                    placeholder="e.g. Insiders Lounge"
                  />
                </div>
                <div>
                  <Label className="text-xs">Telegram channel link</Label>
                  <Input
                    value={profile.telegram_link || ''}
                    onChange={e => setProfile({ ...profile, telegram_link: e.target.value })}
                    placeholder="https://t.me/yourchannel"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                <div>
                  <Label className="text-xs">Telegram Channel ID</Label>
                  <Input
                    placeholder="-1001234567890 or @channelname"
                    value={profile.telegram_chat_id || ''}
                    onChange={e => setProfile({ ...profile, telegram_chat_id: e.target.value })}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="flex items-end">
                  <Button variant="outline" size="sm" onClick={resolveChannelName} disabled={resolvingChat}>
                    {resolvingChat
                      ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Fetching…</>
                      : <><Search className="h-3 w-3 mr-1" />Fetch Name</>}
                  </Button>
                </div>
              </div>
              {(profile.telegram_chat_title || profile.telegram_chat_username) && (
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="border-pink-500/50 text-pink-300">
                    {profile.telegram_chat_title || '—'}
                  </Badge>
                  {profile.telegram_chat_username && (
                    <span className="text-muted-foreground">@{profile.telegram_chat_username}</span>
                  )}
                </div>
              )}

              {kind !== 'default' && (
                <div className="pt-3 mt-3 border-t border-border/50 space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Trade bot &amp; CTA (per-profile)
                  </Label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Trade bot username</Label>
                      <Input
                        placeholder="MyInsidersTradeBot"
                        value={profile.trade_bot_username || ''}
                        onChange={e => setProfile({ ...profile, trade_bot_username: e.target.value })}
                        className="font-mono text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Access purchase URL (overrides bot)</Label>
                      <Input
                        placeholder="https://… or t.me/Bot?start=access"
                        value={profile.access_purchase_url || ''}
                        onChange={e => setProfile({ ...profile, access_purchase_url: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">CTA button text</Label>
                      <Input
                        placeholder="🚀 Buy / Get Access"
                        value={profile.cta_button_text || ''}
                        onChange={e => setProfile({ ...profile, cta_button_text: e.target.value })}
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {kind === 'public'
                      ? 'Public re-sighting posts (2X+) attach an AI hype card image and this CTA button.'
                      : 'Reserved for per-profile private bot (phase 2).'}
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      )}

      {kind === 'snapshot' && (
        <Card className="bg-pink-500/5 border-pink-500/30">
          <CardContent className="pt-4">
            <Label className="text-xs font-semibold text-pink-300">
              📸 Snapshot Post — fast first-touch
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              Posted to the <strong>Private</strong> channel on the very first sighting, before
              enrichment completes. Mirrors the bot&apos;s Quick Stats reply. Token mint image is
              attached as the header when the global toggle is on.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Template editor + Preview — side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">
              Template — <code className="text-xs bg-muted px-1 rounded">{templateName}</code>
            </Label>
            <div className="flex gap-2">
              <EmojiPickerPopover onPick={insertEmoji} />
              <Button variant="outline" size="sm" onClick={onResetTemplate}>
                <RotateCcw className="h-3 w-3 mr-1" />Reset
              </Button>
              <Button size="sm" onClick={() => onSaveTemplate()} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                Save
              </Button>
            </div>
          </div>
          <Textarea
            ref={textareaRef}
            value={templateText}
            onChange={e => onTemplateChange(e.target.value)}
            rows={28}
            className="font-mono text-xs min-h-[640px]"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Preview (mock data)</Label>
            <Button
              variant="outline" size="sm"
              onClick={() => { navigator.clipboard.writeText(previewRendered); toast.success('Copied'); }}
            >
              <Copy className="h-3 w-3 mr-1" />Copy
            </Button>
          </div>
          <pre className="p-3 rounded border border-border bg-muted/30 text-xs whitespace-pre-wrap font-mono min-h-[640px] max-h-[640px] overflow-auto">
            {previewRendered}
          </pre>
        </div>
      </div>

      {/* Compose + Push for THIS channel */}
      <Card className="bg-card/60 border-border">
        <CardContent className="pt-4 space-y-3">
          <Label className="font-medium">
            Compose & Push to {
              kind === 'default' ? 'No Lube (Default channel)'
              : kind === 'public' ? 'No Lube Public Channel'
              : kind === 'snapshot' ? 'No Lube Private Channel (snapshot)'
              : 'No Lube Private Channel'
            }
          </Label>
          <div className="flex gap-2">
            <Input
              placeholder="Paste token address (mint)..."
              value={mint}
              onChange={e => setMint(e.target.value)}
              className="font-mono text-sm"
            />
            <Button onClick={handleCompose} disabled={isComposing || !mint.trim()}>
              {isComposing ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Composing…</> : <>Compose</>}
            </Button>
          </div>
          {composedText && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className={
                    verdictClass === 'healthy' ? 'border-green-500 text-green-400' :
                    verdictClass === 'crazy' ? 'border-orange-500 text-orange-400' :
                    verdictClass === 'dead' ? 'border-red-500 text-red-400' : ''
                  }
                >
                  {verdictClass === 'healthy' && '✅ Healthy'}
                  {verdictClass === 'crazy' && '🤯 Crazy Anomaly'}
                  {verdictClass === 'dead' && '☠️ Dead'}
                </Badge>
                {blockReason && <span className="text-xs text-muted-foreground">{blockReason}</span>}
              </div>
              <pre className="p-3 rounded border border-border bg-muted/30 text-xs whitespace-pre-wrap font-mono max-h-64 overflow-auto">
                {composedText}
              </pre>
              <Button
                className="w-full bg-pink-600 hover:bg-pink-700"
                onClick={handlePush}
                disabled={isPushing || !eligible}
                title={!eligible ? (blockReason || 'Blocked') : 'Push'}
              >
                {isPushing
                  ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Pushing…</>
                  : !eligible
                    ? <>⛔ Blocked — {blockReason}</>
                    : <><Send className="h-4 w-4 mr-1" />Push to {
                        kind === 'default' ? 'No Lube'
                        : kind === 'public' ? 'Public'
                        : kind === 'snapshot' ? 'Private (snapshot)'
                        : 'Private'
                      }</>}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );

  if (kind !== 'private') return body;

  return (
    <Tabs defaultValue="compose" className="space-y-3">
      <TabsList>
        <TabsTrigger value="compose">Compose &amp; Settings</TabsTrigger>
        <TabsTrigger value="process">Process</TabsTrigger>
      </TabsList>
      <TabsContent value="compose">{body}</TabsContent>
      <TabsContent value="process">
        <NoLubeProcessPanel />
      </TabsContent>
    </Tabs>
  );
}