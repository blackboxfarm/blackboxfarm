import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { AvatarUploader } from './AvatarUploader';
import { Loader2, ShieldCheck, Twitter, Mail } from 'lucide-react';

type Source = 'x' | 'google' | 'custom';

interface OAuthIdentity {
  provider: string;
  name?: string;
  handle?: string;
  avatar_url?: string;
}

function extractIdentities(user: any): { x?: OAuthIdentity; google?: OAuthIdentity } {
  const out: { x?: OAuthIdentity; google?: OAuthIdentity } = {};
  const ids = user?.identities || [];
  for (const id of ids) {
    const d = id.identity_data || {};
    if (id.provider === 'twitter' || id.provider === 'twitter_v2') {
      out.x = {
        provider: 'x',
        name: d.full_name || d.name || d.user_name,
        handle: d.user_name || d.preferred_username || d.screen_name,
        avatar_url: (d.avatar_url || d.picture || '').replace('_normal', ''),
      };
    } else if (id.provider === 'google') {
      out.google = {
        provider: 'google',
        name: d.full_name || d.name || d.email,
        avatar_url: d.avatar_url || d.picture,
      };
    }
  }
  return out;
}

export function ForumIdentityPicker({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState<Source>('custom');
  const [nickname, setNickname] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const oauth = useMemo(() => extractIdentities(user), [user]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('forum_identity_source, nickname, avatar_url, forum_display_name_cached, forum_avatar_url_cached')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.forum_identity_source) setSource(data.forum_identity_source as Source);
        else setSource(oauth.x ? 'x' : oauth.google ? 'google' : 'custom');
        setNickname(data?.nickname || '');
        setAvatarUrl(data?.avatar_url || null);
        setLoading(false);
      });
  }, [user, oauth.x, oauth.google]);

  if (!user) return null;

  const save = async () => {
    setSaving(true);
    try {
      const patch: any = { forum_identity_source: source };
      if (source === 'x' && oauth.x) {
        patch.forum_display_name_cached = oauth.x.handle ? `@${oauth.x.handle}` : oauth.x.name || null;
        patch.forum_avatar_url_cached = oauth.x.avatar_url || null;
      } else if (source === 'google' && oauth.google) {
        patch.forum_display_name_cached = oauth.google.name || null;
        patch.forum_avatar_url_cached = oauth.google.avatar_url || null;
      } else {
        // custom — validate nickname
        const n = nickname.trim();
        if (!/^[a-zA-Z0-9_-]{3,20}$/.test(n)) {
          toast.error('Nickname: 3–20 chars, letters/numbers/_/- only');
          setSaving(false); return;
        }
        patch.nickname = n;
      }
      const { error } = await supabase.from('profiles').update(patch).eq('user_id', user.id);
      if (error) throw error;
      toast.success('Forum identity saved');
    } catch (e) {
      toast.error((e as Error).message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" />Loading…</div>;

  const Option = ({ value, title, sub, icon, disabled, preview }: any) => (
    <label
      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
        source === value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input
        type="radio" name="forum-identity" value={value} checked={source === value}
        disabled={disabled}
        onChange={() => setSource(value)}
        className="mt-1 accent-primary"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium">{icon}{title}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
        {preview}
      </div>
    </label>
  );

  return (
    <Card className={compact ? 'p-3 space-y-3' : 'p-4 space-y-4'}>
      <div>
        <h4 className="text-sm font-semibold">How should other holders see you in the WTF Forum?</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Choose once, change anytime. We never post on your behalf.
        </p>
      </div>

      <div className="space-y-2">
        <Option
          value="x"
          disabled={!oauth.x}
          icon={<Twitter className="h-3.5 w-3.5 text-sky-500" />}
          title="Use my X handle and profile picture"
          sub={oauth.x
            ? `Linked: @${oauth.x.handle ?? ''} — your X avatar will show next to comments.`
            : 'Link X in Account Settings to enable this.'}
          preview={oauth.x?.avatar_url && (
            <div className="flex items-center gap-2 mt-2">
              <img src={oauth.x.avatar_url} alt="" className="h-7 w-7 rounded-full border border-border" />
              <Badge variant="secondary" className="text-[10px]">@{oauth.x.handle}</Badge>
            </div>
          )}
        />

        <Option
          value="google"
          disabled={!oauth.google}
          icon={<Mail className="h-3.5 w-3.5 text-amber-500" />}
          title="Use my Google name and profile picture"
          sub={oauth.google
            ? `Linked: ${oauth.google.name ?? ''} — your Google avatar will show.`
            : 'Link Google in Account Settings to enable this.'}
          preview={oauth.google?.avatar_url && (
            <div className="flex items-center gap-2 mt-2">
              <img src={oauth.google.avatar_url} alt="" className="h-7 w-7 rounded-full border border-border" />
              <Badge variant="secondary" className="text-[10px]">{oauth.google.name}</Badge>
            </div>
          )}
        />

        <Option
          value="custom"
          icon={<ShieldCheck className="h-3.5 w-3.5 text-primary" />}
          title="Use a custom forum identity"
          sub="Pick a unique nickname and upload a safe avatar (scanned for hidden content)."
          preview={source === 'custom' && (
            <div className="space-y-3 mt-3">
              <div className="space-y-1">
                <Label className="text-[11px]">Nickname</Label>
                <Input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value.slice(0, 20))}
                  placeholder="3–20 chars · letters/numbers/_/-"
                  className="h-8 text-sm"
                />
              </div>
              <AvatarUploader currentUrl={avatarUrl} onUploaded={(url) => setAvatarUrl(url)} />
            </div>
          )}
        />
      </div>

      <Button size="sm" onClick={save} disabled={saving} className="w-full">
        {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</> : 'Save forum identity'}
      </Button>
    </Card>
  );
}