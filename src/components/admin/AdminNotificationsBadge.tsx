import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Bell, X, Check, CheckCheck, UserPlus, ArrowRightLeft, AlertTriangle, HelpCircle, ClipboardCheck, Ticket, Archive, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

interface AdminNotification {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

type TabCategory = 'signups' | 'transactions' | 'audit' | 'tickets';

const SIGNUP_TYPES = ['new_signup', 'user_registered', 'account_created'];
const TRANSACTION_TYPES = ['banner_purchase', 'payment_confirmed', 'transaction', 'fantasy_buy', 'fantasy_sell', 'swap'];
const TICKET_TYPES = ['support_ticket', 'ticket_reply'];
const AUDIT_TYPES = ['api_failure_critical', 'api_failure_warning', 'quota_critical', 'quota_warning', 'repeated_failure', 'table_bloat', 'security', 'error', 'rug_pull_detected'];

function categorize(type: string): TabCategory {
  if (SIGNUP_TYPES.includes(type)) return 'signups';
  if (TRANSACTION_TYPES.includes(type)) return 'transactions';
  if (TICKET_TYPES.includes(type)) return 'tickets';
  return 'audit';
}

// Request browser notification permission
const requestNotificationPermission = async () => {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
};

const showBrowserNotification = (title: string, message: string, type: string) => {
  if (Notification.permission !== 'granted') return;
  const icon = type === 'new_signup' ? '👤' : type === 'banner_purchase' ? '🎨' : '🔔';
  const notification = new Notification(`${icon} ${title}`, {
    body: message,
    icon: '/favicon.ico',
    tag: `admin-${Date.now()}`,
    requireInteraction: true,
  });
  notification.onclick = () => { window.focus(); notification.close(); };
  setTimeout(() => notification.close(), 10000);
};

export function AdminNotificationsBadge() {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabCategory>('signups');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyAuditPrompt = useCallback((notification: AdminNotification) => {
    const meta = notification.metadata ? JSON.stringify(notification.metadata, null, 2) : 'none';
    const prompt = `Explain this audit alert from my admin dashboard:\n\nTitle: ${notification.title}\nMessage: ${notification.message}\nType: ${notification.notification_type}\nMetadata: ${meta}\n\nWhat does this mean, what caused it, and what should I do about it?`;
    navigator.clipboard.writeText(prompt).then(() => {
      toast({ title: 'Copied to clipboard', description: 'Paste into chat to get an explanation' });
    });
  }, [toast]);

  const fetchNotifications = useCallback(async () => {
    const { data, error } = await (supabase
      .from('admin_notifications' as any)
      .select('*')
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(100) as any);

    if (!error && data) {
      setNotifications(data as AdminNotification[]);
      setUnreadCount((data as AdminNotification[]).filter((n) => !n.is_read).length);
    }
  }, []);

  const debouncedFetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchNotifications, 2000);
  }, [fetchNotifications]);

  useEffect(() => {
    requestNotificationPermission();
    fetchNotifications();

    const channel = supabase
      .channel('admin_notifications_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_notifications' }, (payload) => {
        const n = payload.new as AdminNotification;
        showBrowserNotification(n.title, n.message, n.notification_type);
        debouncedFetch();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'admin_notifications' }, () => debouncedFetch())
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications, debouncedFetch]);

  const markAsRead = async (id: string) => {
    await (supabase.from('admin_notifications' as any).update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id) as any);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await (supabase.from('admin_notifications' as any).update({ is_read: true, read_at: new Date().toISOString() }).in('id', unreadIds) as any);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const archiveNotification = async (id: string) => {
    await (supabase.from('admin_notifications' as any).update({ is_archived: true }).eq('id', id) as any);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setUnreadCount((prev) => {
      const wasUnread = notifications.find((n) => n.id === id && !n.is_read);
      return wasUnread ? Math.max(0, prev - 1) : prev;
    });
  };

  const archiveAllInTab = async () => {
    const tabNotifs = getTabNotifs();
    if (!tabNotifs || tabNotifs.length === 0) return;
    const ids = tabNotifs.map((n) => n.id);
    await (supabase.from('admin_notifications' as any).update({ is_archived: true }).in('id', ids) as any);
    setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
    setUnreadCount((prev) => {
      const unreadArchived = tabNotifs.filter((n) => !n.is_read).length;
      return Math.max(0, prev - unreadArchived);
    });
  };

  const getTypeEmoji = (type: string) => {
    switch (type) {
      case 'new_signup': case 'user_registered': case 'account_created': return '👤';
      case 'banner_purchase': return '🎨';
      case 'payment_confirmed': return '💰';
      case 'fantasy_buy': return '📈';
      case 'fantasy_sell': return '📉';
      case 'api_failure_critical': return '🔴';
      case 'api_failure_warning': return '🟡';
      case 'quota_critical': case 'quota_warning': return '📊';
      case 'repeated_failure': return '🔁';
      case 'table_bloat': return '💾';
      case 'support_ticket': return '🎫';
      case 'ticket_reply': return '📩';
      default: return '🔔';
    }
  };

  // Filter by tab
  const signupNotifs = notifications.filter(n => categorize(n.notification_type) === 'signups');
  const transactionNotifs = notifications.filter(n => categorize(n.notification_type) === 'transactions');
  const ticketNotifs = notifications.filter(n => categorize(n.notification_type) === 'tickets');
  const auditNotifs = notifications.filter(n => categorize(n.notification_type) === 'audit');

  const signupUnread = signupNotifs.filter(n => !n.is_read).length;
  const transactionUnread = transactionNotifs.filter(n => !n.is_read).length;
  const ticketUnread = ticketNotifs.filter(n => !n.is_read).length;
  const auditUnread = auditNotifs.filter(n => !n.is_read).length;

  const getTabNotifs = () => {
    switch (activeTab) {
      case 'signups': return signupNotifs;
      case 'transactions': return transactionNotifs;
      case 'tickets': return ticketNotifs;
      case 'audit': return auditNotifs;
    }
  };

  const renderNotificationList = (items: AdminNotification[], category?: TabCategory) => (
    <ScrollArea className="h-[350px]">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
          <Bell className="h-10 w-10 mb-2 opacity-50" />
          <p className="text-sm">No notifications</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((notification) => (
            <div
              key={notification.id}
              className={`p-3 hover:bg-muted/50 transition-colors overflow-hidden ${!notification.is_read ? 'bg-primary/5' : ''}`}
            >
              <div className="flex items-start gap-2 max-w-full overflow-hidden">
                <span className="text-lg mt-0.5 shrink-0">{getTypeEmoji(notification.notification_type)}</span>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-sm truncate text-foreground">
                      {notification.title}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-2 break-all overflow-hidden">
                    {notification.message}
                  </p>
                  {notification.metadata && Object.keys(notification.metadata).length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(notification.metadata as Record<string, unknown>).email && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                          📧 {String((notification.metadata as Record<string, unknown>).email)}
                        </span>
                      )}
                      {(notification.metadata as Record<string, unknown>).provider && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                          🔐 {String((notification.metadata as Record<string, unknown>).provider)}
                        </span>
                      )}
                      {(notification.metadata as Record<string, unknown>).tier && (
                        <span className="text-[10px] bg-primary/20 px-1.5 py-0.5 rounded text-primary font-medium">
                          ⭐ {String((notification.metadata as Record<string, unknown>).tier).toUpperCase()}
                        </span>
                      )}
                      {(notification.metadata as Record<string, unknown>).amount && (
                        <span className="text-[10px] bg-green-500/20 px-1.5 py-0.5 rounded text-green-500 font-medium">
                          💰 {String((notification.metadata as Record<string, unknown>).amount)}
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {categorize(notification.notification_type) === 'audit' && (
                    <>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 shrink-0 border-border/50 hover:bg-purple-500/20 hover:text-purple-300"
                        onClick={() => {
                          const question = `Morning Report alert — [${notification.notification_type.toUpperCase()}] ${notification.title}: ${notification.message}. What should I do about this? What's the root cause and recommended fix?`;
                          navigator.clipboard.writeText(question);
                          toast({ title: "Copied!", description: "Investigation question copied to clipboard" });
                        }}
                        title="Copy investigation question to clipboard"
                      >
                        <Search className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 shrink-0 border-border/50 hover:bg-amber-500/20 hover:text-amber-300"
                        onClick={() => copyAuditPrompt(notification)}
                        title="Copy audit help prompt"
                      >
                        <span className="text-sm font-bold leading-none">?</span>
                      </Button>
                    </>
                  )}
                  {!notification.is_read && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => markAsRead(notification.id)}>
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-yellow-500"
                    onClick={() => archiveNotification(notification.id)}
                    title="Archive this alert"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ScrollArea>
  );

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground font-bold animate-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="end">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-semibold text-foreground">Admin Alerts</h3>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={archiveAllInTab} className="text-xs text-muted-foreground hover:text-yellow-500" title="Archive all in current tab">
              <Archive className="h-4 w-4 mr-1" />
              Clear tab
            </Button>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs">
                <CheckCheck className="h-4 w-4 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabCategory)} className="w-full">
          <TabsList className="w-full rounded-none border-b border-border bg-transparent h-auto p-0">
            <TabsTrigger
              value="signups"
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-green-500 data-[state=active]:bg-transparent py-2.5 gap-1.5"
            >
              <UserPlus className="h-4 w-4 text-green-500" />
              <span className="text-xs">Signups</span>
              {signupUnread > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-green-500/20 text-green-500 border-0">
                  {signupUnread}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="transactions"
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent py-2.5 gap-1.5"
            >
              <ArrowRightLeft className="h-4 w-4 text-blue-500" />
              <span className="text-xs">Transactions</span>
              {transactionUnread > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-blue-500/20 text-blue-500 border-0">
                  {transactionUnread}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="audit"
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-red-500 data-[state=active]:bg-transparent py-2.5 gap-1.5"
            >
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-xs">Audit</span>
              {auditUnread > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-red-500/20 text-red-500 border-0">
                  {auditUnread}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="tickets"
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-teal-500 data-[state=active]:bg-transparent py-2.5 gap-1.5"
            >
              <Ticket className="h-4 w-4 text-teal-500" />
              <span className="text-xs">Tickets</span>
              {ticketUnread > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-teal-500/20 text-teal-500 border-0">
                  {ticketUnread}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="signups" className="mt-0">
            {renderNotificationList(signupNotifs, 'signups')}
          </TabsContent>
          <TabsContent value="transactions" className="mt-0">
            {renderNotificationList(transactionNotifs, 'transactions')}
          </TabsContent>
          <TabsContent value="tickets" className="mt-0">
            {renderNotificationList(ticketNotifs, 'tickets')}
          </TabsContent>
          <TabsContent value="audit" className="mt-0">
            {renderNotificationList(auditNotifs, 'audit')}
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}