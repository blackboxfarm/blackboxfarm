import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from './AuthContext';
import { toast } from '@/hooks/use-toast';

export type Notification = {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: boolean;
  metadata: Record<string, any>;
  created_at: string;
};

export interface NotificationEvent {
  type: 'campaign' | 'transaction' | 'wallet' | 'security' | 'system';
  level: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  data?: any;
}

interface NotificationsContextValue {
  notifications: Notification[];
  loading: boolean;
  unreadCount: number;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  refresh: () => Promise<void>;
  showNotification: (event: NotificationEvent) => void;
  notifyCampaignStarted: (campaignName: string) => void;
  notifyCampaignStopped: (campaignName: string) => void;
  notifyCampaignError: (campaignName: string, error: string) => void;
  notifyTransactionSuccess: (hash: string, amount?: string) => void;
  notifyTransactionFailed: (error: string) => void;
  notifyWalletFunded: (walletAddress: string, amount: string) => void;
  notifyLowBalance: (walletAddress: string, balance: string) => void;
  notifySecurityAlert: (message: string) => void;
  notifyLoginDetected: (location?: string) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export const NotificationsProvider = ({ children }: { children: ReactNode }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthContext();

  const loadNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications((data || []).map(item => ({
        id: item.id,
        title: item.title,
        message: item.message,
        type: item.type as 'info' | 'success' | 'warning' | 'error',
        is_read: item.is_read,
        metadata: (item.metadata as Record<string, any>) || {},
        created_at: item.created_at
      })));
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    // Load initial notifications
    loadNotifications();

    // Set up real-time subscription
    const channel = supabase
      .channel('notifications-global')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setNotifications(prev => [payload.new as Notification, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setNotifications(prev => 
              prev.map(n => n.id === payload.new.id ? payload.new as Notification : n)
            );
          } else if (payload.eventType === 'DELETE') {
            setNotifications(prev => prev.filter(n => n.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    // Request browser notification permission on init
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadNotifications]);

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  }, [user]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  }, []);

  const showNotification = useCallback((event: NotificationEvent) => {
    // Show in-app toast
    toast({
      title: event.title,
      description: event.message,
      variant: event.level === 'error' ? 'destructive' : 'default',
    });

    // Show browser notification for important events
    if (
      'Notification' in window && 
      Notification.permission === 'granted' &&
      (event.level === 'error' || event.type === 'security' || event.type === 'campaign')
    ) {
      new Notification(event.title, {
        body: event.message,
        icon: '/favicon-barn.png',
        tag: event.type,
      });
    }
  }, []);

  // Campaign notifications
  const notifyCampaignStarted = useCallback((campaignName: string) => {
    showNotification({
      type: 'campaign',
      level: 'success',
      title: 'Campaign Started',
      message: `${campaignName} is now running`,
    });
  }, [showNotification]);

  const notifyCampaignStopped = useCallback((campaignName: string) => {
    showNotification({
      type: 'campaign',
      level: 'info',
      title: 'Campaign Stopped',
      message: `${campaignName} has been stopped`,
    });
  }, [showNotification]);

  const notifyCampaignError = useCallback((campaignName: string, error: string) => {
    showNotification({
      type: 'campaign',
      level: 'error',
      title: 'Campaign Error',
      message: `${campaignName}: ${error}`,
    });
  }, [showNotification]);

  // Transaction notifications
  const notifyTransactionSuccess = useCallback((hash: string, amount?: string) => {
    showNotification({
      type: 'transaction',
      level: 'success',
      title: 'Transaction Confirmed',
      message: amount ? `${amount} SOL transaction confirmed` : `Transaction ${hash.slice(0, 8)}... confirmed`,
    });
  }, [showNotification]);

  const notifyTransactionFailed = useCallback((error: string) => {
    showNotification({
      type: 'transaction',
      level: 'error',
      title: 'Transaction Failed',
      message: error,
    });
  }, [showNotification]);

  // Wallet notifications
  const notifyWalletFunded = useCallback((walletAddress: string, amount: string) => {
    showNotification({
      type: 'wallet',
      level: 'success',
      title: 'Wallet Funded',
      message: `${amount} SOL received in ${walletAddress.slice(0, 8)}...`,
    });
  }, [showNotification]);

  const notifyLowBalance = useCallback((walletAddress: string, balance: string) => {
    showNotification({
      type: 'wallet',
      level: 'warning',
      title: 'Low Wallet Balance',
      message: `Wallet ${walletAddress.slice(0, 8)}... has ${balance} SOL remaining`,
    });
  }, [showNotification]);

  // Security notifications
  const notifySecurityAlert = useCallback((message: string) => {
    showNotification({
      type: 'security',
      level: 'warning',
      title: 'Security Alert',
      message,
    });
  }, [showNotification]);

  const notifyLoginDetected = useCallback((location?: string) => {
    showNotification({
      type: 'security',
      level: 'info',
      title: 'Login Detected',
      message: location ? `Login from ${location}` : 'New login detected',
    });
  }, [showNotification]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const value: NotificationsContextValue = {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refresh: loadNotifications,
    showNotification,
    notifyCampaignStarted,
    notifyCampaignStopped,
    notifyCampaignError,
    notifyTransactionSuccess,
    notifyTransactionFailed,
    notifyWalletFunded,
    notifyLowBalance,
    notifySecurityAlert,
    notifyLoginDetected,
  };

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};

export const useNotificationsContext = () => {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotificationsContext must be used within a NotificationsProvider');
  }
  return context;
};
