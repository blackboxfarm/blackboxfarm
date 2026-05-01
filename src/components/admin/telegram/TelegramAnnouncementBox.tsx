import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Megaphone, Send, Loader2, AlertTriangle, UserCheck, CreditCard, Gift, UserX, History, SquarePen, ChevronDown, ChevronUp, RotateCw, ImagePlus, X } from 'lucide-react';
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

interface RecipientEntry {
  id: string;
  telegram_user_id: string;
  linked_user_id: string | null;
  delivery_status: string;
}

interface LogEntry {
  id: string;
  message_text: string;
  audiences: string[];
  sent_count: number;
  failed_count: number;
  created_at: string;
  resend_of_id?: string | null;
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
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<Record<string, RecipientEntry[]>>({});
  const [loadingRecipients, setLoadingRecipients] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking same file
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please pick an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB (Telegram URL limit)');
      return;
    }
    setUploadingImage(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('announcement-images')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('announcement-images').getPublicUrl(path);
      setImageUrl(pub.publicUrl);
      toast.success('Image attached');
    } catch (err: any) {
      console.error('Image upload failed:', err);
      toast.error(err.message || 'Image upload failed');
    } finally {
      setUploadingImage(false);
    }
  };

  const clearImage = () => setImageUrl(null);

  const handleResendToNew = async (entry: LogEntry) => {
    setResendingId(entry.id);
    try {
      // Step 1: dry run for preview count
      const { data: preview, error: previewErr } = await supabase.functions.invoke(
        'telegram-announcement-broadcast',
        { body: { resendOfAnnouncementId: entry.id, dryRun: true } }
      );
      if (previewErr) throw previewErr;

      const newCount = preview?.newRecipients ?? 0;
      const already = preview?.alreadyReceived ?? 0;

      if (newCount === 0) {
        toast.info(`No new recipients. ${already} users already received this.`);
        return;
      }

      if (!confirm(`${newCount} new user(s) match the original audience and haven't received this yet (${already} already got it). Send now?`)) {
        return;
      }

      // Step 2: actual send
      const { data, error } = await supabase.functions.invoke(
        'telegram-announcement-broadcast',
        { body: { resendOfAnnouncementId: entry.id } }
      );
      if (error) throw error;

      toast.success(`Resent to ${data?.sent ?? 0} new user(s)`);
      loadHistory();
    } catch (err: any) {
      console.error('Resend error:', err);
      toast.error(err.message || 'Failed to resend');
    } finally {
      setResendingId(null);
    }
  };

  const allSelected = AUDIENCE_OPTIONS.every(o => selectedAudiences.has(o.value));

  const toggleAll = () => {
    if (allSelected) setSelectedAudiences(new Set());
    else setSelectedAudiences(new Set(AUDIENCE_OPTIONS.map(o => o.value)));
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

  const loadRecipients = async (announcementId: string) => {
    if (recipients[announcementId]) {
      setExpandedEntry(expandedEntry === announcementId ? null : announcementId);
      return;
    }
    setLoadingRecipients(announcementId);
    setExpandedEntry(announcementId);
    try {
      const { data } = await supabase
        .from('telegram_announcement_recipients')
        .select('*')
        .eq('announcement_id', announcementId)
        .order('created_at', { ascending: true });
      const entries = (data as RecipientEntry[]) || [];
      
      // Resolve TG usernames
      if (entries.length > 0) {
        const tgIds = [...new Set(entries.map(e => e.telegram_user_id))];
        const { data: interactions } = await supabase
          .from('telegram_bot_interactions')
          .select('telegram_user_id, telegram_username, first_name')
          .in('telegram_user_id', tgIds.slice(0, 200));
        const nameMap = new Map<string, string>();
        for (const i of interactions || []) {
          if (i.telegram_username && !nameMap.has(i.telegram_user_id)) {
            nameMap.set(i.telegram_user_id, `@${i.telegram_username}`);
          } else if (i.first_name && !nameMap.has(i.telegram_user_id)) {
            nameMap.set(i.telegram_user_id, i.first_name);
          }
        }
        for (const e of entries) {
          (e as any).display_name = nameMap.get(e.telegram_user_id) || null;
        }
      }
      
      setRecipients(prev => ({ ...prev, [announcementId]: entries }));
    } catch (err) {
      console.error('Failed to load recipients:', err);
    } finally {
      setLoadingRecipients(null);
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

    if (!testOnly && audienceList.length === 0) {
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
          image_url: imageUrl,
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

  // ─── Hosted view (simple) ───
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
            <ImageAttacher
              imageUrl={imageUrl}
              uploading={uploadingImage}
              onPick={() => fileInputRef.current?.click()}
              onClear={clearImage}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleImagePick}
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
                Send Message
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
            <ImageAttacher
              imageUrl={imageUrl}
              uploading={uploadingImage}
              onPick={() => fileInputRef.current?.click()}
              onClear={clearImage}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleImagePick}
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
                disabled={isSending || !message.trim() || (!testOnly && selectedAudiences.size === 0)}
                className="gap-1"
              >
                {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Send Message
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
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {history.map(entry => (
                  <div key={entry.id} className="border rounded-md p-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1 flex-wrap items-center">
                        {entry.resend_of_id && (
                          <Badge variant="secondary" className="text-[10px] gap-0.5">
                            <RotateCw className="w-2.5 h-2.5" /> Resend
                          </Badge>
                        )}
                        {(entry.audiences || []).map(a => (
                          <Badge key={a} variant="outline" className="text-[10px]">{a}</Badge>
                        ))}
                      </div>
                      <span className="text-muted-foreground text-[10px]">
                        {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-muted-foreground line-clamp-2">{entry.message_text}</p>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex gap-3">
                        <span className="text-green-500">✓ {entry.sent_count}</span>
                        {entry.failed_count > 0 && <span className="text-red-500">✗ {entry.failed_count}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleResendToNew(entry)}
                          disabled={resendingId === entry.id}
                          className="text-[10px] text-yellow-500 hover:text-yellow-400 flex items-center gap-0.5 transition-colors disabled:opacity-50"
                          title="Send this same message to users who match the audience but haven't received it yet"
                        >
                          {resendingId === entry.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <><RotateCw className="w-3 h-3" /> Resend to new only</>
                          )}
                        </button>
                        <button
                          onClick={() => loadRecipients(entry.id)}
                          className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
                        >
                          {loadingRecipients === entry.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : expandedEntry === entry.id ? (
                            <>Hide <ChevronUp className="w-3 h-3" /></>
                          ) : (
                            <>Show <ChevronDown className="w-3 h-3" /></>
                          )}
                        </button>
                      </div>
                    </div>
                    {expandedEntry === entry.id && recipients[entry.id] && (
                      <div className="mt-1 border-t pt-1 space-y-0.5">
                        {recipients[entry.id].length === 0 ? (
                          <p className="text-[10px] text-muted-foreground italic">No recipient data</p>
                        ) : (
                          recipients[entry.id].map(r => (
                            <div key={r.id} className="flex items-center justify-between text-[10px]">
                              <span className="font-mono text-muted-foreground truncate max-w-[200px]">
                                {(r as any).display_name || `TG:${r.telegram_user_id}`}
                              </span>
                              <span className={r.delivery_status === 'sent' ? 'text-green-500' : 'text-red-500'}>
                                {r.delivery_status}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
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
