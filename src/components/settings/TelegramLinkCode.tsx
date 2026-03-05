import { useState, useEffect } from 'react';
import { Copy, Check, MessageCircle, RefreshCw, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface LinkCodeData {
  link_code: string;
  telegram_user_id: string | null;
  telegram_username: string | null;
  linked_at: string | null;
}

export function TelegramLinkCode({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const [linkData, setLinkData] = useState<LinkCodeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadLinkCode();
  }, [user]);

  const loadLinkCode = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('telegram_link_codes')
        .select('link_code, telegram_user_id, telegram_username, linked_at')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setLinkData(data as LinkCodeData);
      }
    } catch {
      // No code yet
    } finally {
      setLoading(false);
    }
  };

  const generateCode = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.rpc('generate_telegram_link_code', {
        p_user_id: user.id,
      });

      if (error) throw error;

      await loadLinkCode();
      toast.success('Telegram link code generated!');
    } catch (err: any) {
      toast.error('Failed to generate code: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const copyCode = () => {
    if (!linkData) return;
    navigator.clipboard.writeText(linkData.link_code);
    setCopied(true);
    toast.success('Code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const unlinkTelegram = async () => {
    if (!user || !linkData) return;
    try {
      await supabase
        .from('telegram_link_codes')
        .update({ telegram_user_id: null, telegram_username: null, linked_at: null })
        .eq('user_id', user.id);

      await loadLinkCode();
      toast.success('Telegram unlinked');
    } catch {
      toast.error('Failed to unlink');
    }
  };

  if (!user) return null;

  if (compact) {
    return (
      <div className="px-2 py-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">Telegram Link</span>
        </div>
        {loading ? (
          <p className="text-[10px] text-muted-foreground">Loading...</p>
        ) : linkData ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono">
                {linkData.link_code}
              </code>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 w-5 p-0"
                onClick={copyCode}
              >
                {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
            {linkData.telegram_user_id ? (
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-[9px] h-4 bg-green-500/10 text-green-500 border-green-500/30">
                  Linked: @{linkData.telegram_username || 'unknown'}
                </Badge>
                <Button size="sm" variant="ghost" className="h-4 w-4 p-0" onClick={unlinkTelegram}>
                  <Unlink className="h-2.5 w-2.5 text-destructive" />
                </Button>
              </div>
            ) : (
              <p className="text-[9px] text-muted-foreground">Send this code to @BlackBoxFarmBot</p>
            )}
          </div>
        ) : (
          <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={generateCode} disabled={generating}>
            {generating ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : null}
            Generate Code
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className="tech-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          Telegram Bot Link
        </CardTitle>
        <CardDescription className="text-xs">
          Connect your Telegram to receive tier-appropriate notifications
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : linkData ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Your code:</span>
              <code className="text-sm bg-muted px-2 py-1 rounded font-mono font-bold tracking-wider">
                {linkData.link_code}
              </code>
              <Button size="sm" variant="outline" className="h-7" onClick={copyCode}>
                {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>

            {linkData.telegram_user_id ? (
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                  ✅ Linked: @{linkData.telegram_username || 'unknown'}
                </Badge>
                <Button size="sm" variant="ghost" className="text-destructive text-xs h-7" onClick={unlinkTelegram}>
                  <Unlink className="h-3 w-3 mr-1" />
                  Unlink
                </Button>
              </div>
            ) : (
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium">How to link:</p>
                <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Open Telegram and search for @BlackBoxFarmBot</li>
                  <li>Send /start to the bot</li>
                  <li>Paste your code: <code className="bg-background px-1 rounded">{linkData.link_code}</code></li>
                  <li>Done! Your bot access matches your subscription tier</li>
                </ol>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-3">
            <p className="text-xs text-muted-foreground mb-2">
              Generate a code to link your Telegram account
            </p>
            <Button size="sm" onClick={generateCode} disabled={generating}>
              {generating ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <MessageCircle className="h-3 w-3 mr-1" />}
              Generate Link Code
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
