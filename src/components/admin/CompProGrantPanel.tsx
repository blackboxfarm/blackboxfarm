import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Gift, Send, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface GrantResult {
  ok: boolean;
  subscription_id?: string;
  already_active?: boolean;
  expires_at?: string;
  linked_user_id?: string | null;
  dm_status?: 'sent' | 'failed' | 'no_token';
  dm_error?: string | null;
  promo?: { code: string; trial_days: number; tier: string; expires_at: string } | null;
  error?: string;
}

export function CompProGrantPanel() {
  const [tgId, setTgId] = useState('7112908136');
  const [name, setName] = useState('Mike');
  const [customMsg, setCustomMsg] = useState('');
  const [promoCode, setPromoCode] = useState('DM10');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GrantResult | null>(null);

  async function handleGrant() {
    if (!tgId.trim()) {
      toast.error('Telegram user ID required');
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('tg-comp-grant', {
        body: {
          telegram_user_id: tgId.trim(),
          display_name: name.trim() || undefined,
          custom_message: customMsg.trim() || undefined,
          promo_code: promoCode.trim() || undefined,
        },
      });
      if (error) throw error;
      setResult(data);
      if (data.ok) {
        if (data.dm_status === 'sent') {
          toast.success(`✅ Pro granted to TG ${tgId} & DM sent`);
        } else if (data.dm_status === 'failed') {
          toast.warning(`Pro granted but DM failed: ${data.dm_error}`);
        } else {
          toast.success(`Pro granted to TG ${tgId}`);
        }
      } else {
        toast.error(data.error || 'Grant failed');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Grant failed');
      setResult({ ok: false, error: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-yellow-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-amber-500" />
          Comp Pro Grant — Telegram
        </CardTitle>
        <CardDescription>
          Grant a yearly Pro subscription to a Telegram user and auto-DM them via @holdersintel_bot.
          The user must have started a chat with the bot first (sent <code>/start</code>), otherwise the DM will fail.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="tg-id">Telegram User ID</Label>
            <Input
              id="tg-id"
              value={tgId}
              onChange={(e) => setTgId(e.target.value)}
              placeholder="e.g. 7112908136"
              className="font-mono"
            />
          </div>
          <div>
            <Label htmlFor="display-name">Display Name (optional)</Label>
            <Input
              id="display-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mike"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="custom-msg">Custom DM Message (optional — overrides default)</Label>
          <Textarea
            id="custom-msg"
            value={customMsg}
            onChange={(e) => setCustomMsg(e.target.value)}
            placeholder="Leave blank to send the standard welcome message"
            rows={3}
          />
        </div>
        <Button onClick={handleGrant} disabled={busy} className="w-full">
          <Send className="h-4 w-4 mr-2" />
          {busy ? 'Granting…' : 'Grant Pro & Send DM'}
        </Button>

        {result && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
            {result.ok ? (
              <>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="font-medium">Grant successful</span>
                  {result.already_active && <Badge variant="secondary">Extended existing</Badge>}
                </div>
                <div className="text-muted-foreground">
                  Expires: <span className="font-mono">{result.expires_at && new Date(result.expires_at).toLocaleString()}</span>
                </div>
                {result.linked_user_id && (
                  <div className="text-muted-foreground">
                    Linked website account upgraded: <span className="font-mono text-xs">{result.linked_user_id}</span>
                  </div>
                )}
                <div>
                  DM:{' '}
                  {result.dm_status === 'sent' ? (
                    <Badge className="bg-green-500/20 text-green-700 dark:text-green-400">Sent ✅</Badge>
                  ) : result.dm_status === 'failed' ? (
                    <Badge variant="destructive">Failed — {result.dm_error}</Badge>
                  ) : (
                    <Badge variant="outline">No bot token configured</Badge>
                  )}
                </div>
                {result.dm_status === 'failed' && result.dm_error?.includes('bot can') && (
                  <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 mt-2">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>
                      User has not started a chat with the bot yet. Ask them to send <code>/start</code> to @holdersintel_bot, then click Grant again — the Pro tier is already active, only the DM will retry.
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {result.error}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
