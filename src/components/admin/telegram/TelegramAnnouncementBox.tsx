import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Megaphone, Send, Loader2, AlertTriangle, UserCheck, CreditCard, Gift, UserX } from 'lucide-react';
import { toast } from 'sonner';

interface TelegramAnnouncementBoxProps {
  audience: 'accounts' | 'hosted';
}

type AccountSubAudience = 'all_registered' | 'subscribers_only' | 'free_only' | 'unregistered';

const ACCOUNT_TABS: { value: AccountSubAudience; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'all_registered', label: 'All Registered', icon: <UserCheck className="w-3 h-3" />, desc: 'All users with a web account' },
  { value: 'subscribers_only', label: 'Subscribers', icon: <CreditCard className="w-3 h-3" />, desc: 'Paid/subscribed users only' },
  { value: 'free_only', label: 'Free Users', icon: <Gift className="w-3 h-3" />, desc: 'Registered but not subscribed' },
  { value: 'unregistered', label: 'Unregistered', icon: <UserX className="w-3 h-3" />, desc: 'TG users without a web account' },
];

export function TelegramAnnouncementBox({ audience }: TelegramAnnouncementBoxProps) {
  const [messages, setMessages] = useState<Record<string, string>>({
    all_registered: '',
    subscribers_only: '',
    free_only: '',
    unregistered: '',
    hosted: '',
  });
  const [testOnly, setTestOnly] = useState<Record<string, boolean>>({
    all_registered: false,
    subscribers_only: false,
    free_only: false,
    unregistered: false,
    hosted: false,
  });
  const [isSending, setIsSending] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<string>(audience === 'hosted' ? 'hosted' : 'all_registered');
  const [lastResult, setLastResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null);

  const currentKey = audience === 'hosted' ? 'hosted' : activeSubTab;
  const currentMessage = messages[currentKey] || '';
  const currentTestOnly = testOnly[currentKey] || false;

  const handleSend = async () => {
    if (!currentMessage.trim()) {
      toast.error('Write a message first');
      return;
    }

    const labelMap: Record<string, string> = {
      all_registered: 'All Registered Users',
      subscribers_only: 'Subscribers Only',
      free_only: 'Free Users Only',
      unregistered: 'Unregistered TG Users',
      hosted: 'Hosted Admins',
    };

    const confirmMsg = currentTestOnly
      ? 'Send this announcement ONLY to @system_reset?'
      : `Broadcast this to ${labelMap[currentKey]}? This cannot be undone.`;

    if (!confirm(confirmMsg)) return;

    setIsSending(true);
    setLastResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('telegram-announcement-broadcast', {
        body: {
          message: currentMessage.trim(),
          audience: audience === 'hosted' ? 'hosted' : currentKey,
          testOnly: currentTestOnly,
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

  const renderTextArea = (key: string, placeholder: string) => (
    <div className="space-y-3">
      <Textarea
        placeholder={placeholder}
        value={messages[key] || ''}
        onChange={(e) => setMessages(prev => ({ ...prev, [key]: e.target.value }))}
        rows={4}
        className="text-sm"
      />

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={testOnly[key] || false}
            onCheckedChange={(v) => setTestOnly(prev => ({ ...prev, [key]: v === true }))}
          />
          <span className="text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-yellow-500" />
            Only Notify @system_reset
          </span>
        </label>

        <Button
          size="sm"
          onClick={handleSend}
          disabled={isSending || !(messages[key] || '').trim()}
          className="gap-1"
        >
          {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          {(testOnly[key]) ? 'Test Send' : 'Broadcast'}
        </Button>
      </div>

      {lastResult && (
        <div className="text-xs text-muted-foreground flex gap-3 pt-1">
          <span className="text-green-500">✓ Sent: {lastResult.sent}</span>
          {lastResult.failed > 0 && <span className="text-red-500">✗ Failed: {lastResult.failed}</span>}
          {lastResult.skipped > 0 && <span>Skipped: {lastResult.skipped}</span>}
        </div>
      )}
    </div>
  );

  if (audience === 'hosted') {
    return (
      <Card className="border-dashed border-yellow-500/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-yellow-500" />
            Announce to Hosted Admins
            <Badge variant="outline" className="text-[10px] ml-auto">Group/Channel Admin DMs</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {renderTextArea('hosted', 'Write an announcement for group/channel admins...\n\nSupports Telegram Markdown: *bold*, _italic_, `code`')}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-dashed border-yellow-500/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-yellow-500" />
          Announce to Users
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
          <TabsList className="mb-3 h-auto flex-wrap">
            {ACCOUNT_TABS.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} className="text-xs gap-1">
                {tab.icon} {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {ACCOUNT_TABS.map(tab => (
            <TabsContent key={tab.value} value={tab.value}>
              <p className="text-[11px] text-muted-foreground mb-2">{tab.desc}</p>
              {renderTextArea(tab.value, `Write an announcement for ${tab.label}...\n\nSupports Telegram Markdown: *bold*, _italic_, \`code\``)}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
