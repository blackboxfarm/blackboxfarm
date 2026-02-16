import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Bell, X, Check, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

// Request browser notification permission
const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    console.log('Browser does not support notifications');
    return false;
  }
  
  if (Notification.permission === 'granted') {
    return true;
  }
  
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  
  return false;
};

// Show browser notification
const showBrowserNotification = (title: string, message: string, type: string) => {
  if (Notification.permission !== 'granted') return;
  
  const icon = type === 'new_signup' ? '👤' : type === 'banner_purchase' ? '🎨' : '🔔';
  
  const notification = new Notification(`${icon} ${title}`, {
    body: message,
    icon: '/favicon.ico',
    tag: `admin-${Date.now()}`,
    requireInteraction: true,
  });
  
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
  
  // Auto-close after 10 seconds
  setTimeout(() => notification.close(), 10000);
};

export function AdminNotificationsBadge() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchNotifications = useCallback(async () => {
    const { data, error } = await (supabase
      .from('admin_notifications' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50) as any);

    if (!error && data) {
      setNotifications(data as AdminNotification[]);
      setUnreadCount((data as AdminNotification[]).filter((n) => !n.is_read).length);
    }
  }, []);

  // Debounced version to prevent rapid-fire refetches from realtime events
  const debouncedFetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchNotifications, 2000);
  }, [fetchNotifications]);

  useEffect(() => {
    // Request notification permission on mount
    requestNotificationPermission().then(setHasPermission);
    
    fetchNotifications();

    // Subscribe to realtime updates (debounced to prevent CPU spikes)
    const channel = supabase
      .channel('admin_notifications_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_notifications' },
        (payload) => {
          const newNotification = payload.new as AdminNotification;
          showBrowserNotification(
            newNotification.title,
            newNotification.message,
            newNotification.notification_type
          );
          debouncedFetch();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'admin_notifications' },
        () => {
          debouncedFetch();
        }
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications, debouncedFetch]);

  const markAsRead = async (id: string) => {
    await (supabase
      .from('admin_notifications' as any)
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id) as any);
    
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    await (supabase
      .from('admin_notifications' as any)
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in('id', unreadIds) as any);

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const getTypeEmoji = (type: string) => {
    switch (type) {
      case 'banner_purchase':
        return '🎨';
      case 'new_signup':
        return '👤';
      case 'payment_confirmed':
        return '💰';
      default:
        return '🔔';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'banner_purchase':
        return 'bg-green-500/20 text-green-500';
      case 'new_signup':
        return 'bg-blue-500/20 text-blue-500';
      case 'payment_confirmed':
        return 'bg-yellow-500/20 text-yellow-500';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

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
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold">Notifications</h3>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="text-xs"
              >
                <CheckCheck className="h-4 w-4 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Bell className="h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-muted/50 transition-colors ${
                    !notification.is_read ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl">{getTypeEmoji(notification.notification_type)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm truncate">
                          {notification.title}
                        </span>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${getTypeColor(notification.notification_type)}`}
                        >
                          {notification.notification_type.replace('_', ' ')}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-line">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    {!notification.is_read && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => markAsRead(notification.id)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
