import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Megaphone, Send, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface TelegramAnnouncementBoxProps {
  /** 'accounts' = DM users WITHOUT hosted installs, 'hosted' = DM users WITH hosted installs */
  audience: 'accounts' | 'hosted';
}

export function TelegramAnnouncementBox({ audience }: TelegramAnnouncementBoxProps) {
  const [message, setMessage] = useState('');
  const [testOnly, setTestOnly] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null);

  const label = audience === 'accounts' ? 'Registered Users' : 'Hosted Admins';

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error('Write a message first');
      return;
    }

    const confirmMsg = testOnly
      ? 'Send this announcement ONLY to @system_reset?'
      : `Broadcast this to ALL ${label}? This cannot be undone.`;

    if (!confirm(confirmMsg)) return;

    setIsSending(true);
    setLastResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('telegram-announcement-broadcast', {
        body: {
          message: message.trim(),
          audience,
          testOnly,
        },
      });

      if (error) throw error;

      setLastResult({
        sent: data?.sent ?? 0,
        failed: data?.failed ?? 0,
        skipped: data?.skipped ?? 0,
      });

      toast.success(`Sent to ${data?.sent ?? 0} user(s)`);
    } catch (err: any) {
      console.error('Announcement error:', err);
      toast.error(err.message || 'Failed to send announcement');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card className="border-dashed border-yellow-500/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-yellow-500" />
          Announce to {label}
          <Badge variant="outline" className="text-[10px] ml-auto">
            {audience === 'accounts' ? 'Non-Admin DMs' : 'Group Admin DMs'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          placeholder={`Write an announcement for ${label}...\n\nSupports Telegram Markdown: *bold*, _italic_, \`code\``}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className="text-sm"
        />

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={testOnly}
              onCheckedChange={(v) => setTestOnly(v === true)}
            />
            <span className="text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-yellow-500" />
              Only Notify @system_reset
            </span>
          </label>

          <Button
            size="sm"
            onClick={handleSend}
            disabled={isSending || !message.trim()}
            className="gap-1"
          >
            {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            {testOnly ? 'Test Send' : 'Broadcast'}
          </Button>
        </div>

        {lastResult && (
          <div className="text-xs text-muted-foreground flex gap-3 pt-1">
            <span className="text-green-500">✓ Sent: {lastResult.sent}</span>
            {lastResult.failed > 0 && <span className="text-red-500">✗ Failed: {lastResult.failed}</span>}
            {lastResult.skipped > 0 && <span>Skipped: {lastResult.skipped}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
