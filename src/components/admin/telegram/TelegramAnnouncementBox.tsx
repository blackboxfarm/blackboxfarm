import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Megaphone, Send, Loader2, AlertTriangle, UserCheck, CreditCard, Gift, UserX, History, SquarePen } from 'lucide-react';
import { toast } from 'sonner';

interface TelegramAnnouncementBoxProps {
  audience: 'accounts' | 'hosted';
}

type AudienceKey = 'all_registered' | 'subscribers_only' | 'free_only' | 'unregistered';

const AUDIENCE_OPTIONS: { value: AudienceKey; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'all_registered', label: 'All Registered', icon: <UserCheck className="w-3 h-3" />, desc: 'All users with a web account' },
  { value: 'subscribers_only', label: 'Subscribers', icon: <CreditCard className="w-3 h-3" />, desc: 'Paid/subscribed users only' },
  { value: 'free_only', label: 'Free Users', icon: <Gift className="w-3 h-3" />, desc: 'Registered but not subscribed' },
  { value: 'unregistered', label: 'Unregistered', icon: <UserX className="w-3 h-3" />, desc: 'TG users without a web account' },
];

interface LogEntry {
  id: string;
  message_text: string;
  audiences: string[];
  sent_count: number;
  failed_count: number;
  created_at: string;
}

export function TelegramAnnouncementBox({ audience }: TelegramAnnouncementBoxProps) {
  const [message, setMessage] = useState('');
  const [testOnly, setTestOnly] = useState(false);
  const [selectedAudiences, setSelectedAudiences] = useState<Set<AudienceKey>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null);
  const [activeTab, setActiveTab] = useState<string>('compose');
  const [history, setHistory] = useState<LogEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const allSelected = AUDIENCE_OPTIONS.every(o => selectedAudiences.has(o.value));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedAudiences(new Set());
    } else {
      setSelectedAudiences(new Set(AUDIENCE_OPTIONS.map(o => o.value)));
    }
  };

  const toggleOne = (key: AudienceKey) => {
    const next = new Set(selectedAudiences);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedAudiences(next);
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data } = await supabase
        .from('telegram_announcement_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      setHistory((data as LogEntry[]) || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
  }, [activeTab]);

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error('Write a message first');
      return;
    }

    const audienceList = audience === 'hosted'
      ? ['hosted']
      : Array.from(selectedAudiences);

    if (audienceList.length === 0) {
      toast.error('Select at least one audience');
      return;
    }

    const confirmMsg = testOnly
      ? 'Send this announcement ONLY to @system_reset?'
      : `Broadcast to ${audienceList.length} audience group(s)? This cannot be undone.`;

    if (!confirm(confirmMsg)) return;

    setIsSending(true);
    setLastResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('telegram-announcement-broadcast', {
        body: {
          message: message.trim(),
          audiences: audienceList,
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

  // ─── Hosted view (simple, no audience picker) ───
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
          <div className="space-y-3">
            <Textarea
              placeholder={'Write an announcement for group/channel admins...\n\nSupports Telegram Markdown: *bold*, _italic_, `code`'}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="text-sm"
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={testOnly} onCheckedChange={(v) => setTestOnly(v === true)} />
                <span className="text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-yellow-500" />
                  Only Notify @system_reset
                </span>
              </label>
              <Button size="sm" onClick={handleSend} disabled={isSending || !message.trim()} className="gap-1">
                {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                {testOnly ? 'Test Send' : 'Broadcast'}
              </Button>
            </div>
            {lastResult && (
              <div className="text-xs text-muted-foreground flex gap-3 pt-1">
                <span className="text-green-500">✓ Sent: {lastResult.sent}</span>
                {lastResult.failed > 0 && <span className="text-red-500">✗ Failed: {lastResult.failed}</span>}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Accounts view with checkboxes + history ───
  return (
    <Card className="border-dashed border-yellow-500/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-yellow-500" />
          Announce to Users
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-3">
            <TabsTrigger value="compose" className="text-xs gap-1">
              <SquarePen className="w-3 h-3" /> Compose
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs gap-1">
              <History className="w-3 h-3" /> History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compose">
            {/* Audience checkboxes */}
            <div className="space-y-2 mb-3">
              <label className="flex items-center gap-2 text-xs cursor-pointer font-medium">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                <span>ALL</span>
              </label>
              <div className="grid grid-cols-2 gap-1.5 pl-4">
                {AUDIENCE_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={selectedAudiences.has(opt.value)}
                      onCheckedChange={() => toggleOne(opt.value)}
                    />
                    <span className="flex items-center gap-1 text-muted-foreground">
                      {opt.icon} {opt.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <Textarea
              placeholder={'Write an announcement...\n\nSupports Telegram Markdown: *bold*, _italic_, `code`'}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="text-sm"
            />

            <div className="flex items-center justify-between mt-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={testOnly} onCheckedChange={(v) => setTestOnly(v === true)} />
                <span className="text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-yellow-500" />
                  Only Notify @system_reset
                </span>
              </label>
              <Button
                size="sm"
                onClick={handleSend}
                disabled={isSending || !message.trim() || selectedAudiences.size === 0}
                className="gap-1"
              >
                {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                {testOnly ? 'Test Send' : 'Broadcast'}
              </Button>
            </div>

            {lastResult && (
              <div className="text-xs text-muted-foreground flex gap-3 pt-2">
                <span className="text-green-500">✓ Sent: {lastResult.sent}</span>
                {lastResult.failed > 0 && <span className="text-red-500">✗ Failed: {lastResult.failed}</span>}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history">
            {loadingHistory ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : history.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No broadcasts sent yet</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {history.map(entry => (
                  <div key={entry.id} className="border rounded-md p-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1 flex-wrap">
                        {(entry.audiences || []).map(a => (
                          <Badge key={a} variant="outline" className="text-[10px]">{a}</Badge>
                        ))}
                      </div>
                      <span className="text-muted-foreground text-[10px]">
                        {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-muted-foreground line-clamp-2">{entry.message_text}</p>
                    <div className="flex gap-3">
                      <span className="text-green-500">✓ {entry.sent_count}</span>
                      {entry.failed_count > 0 && <span className="text-red-500">✗ {entry.failed_count}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
