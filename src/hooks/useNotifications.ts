import { useEffect, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';

export interface NotificationEvent {
  type: 'campaign' | 'transaction' | 'wallet' | 'security' | 'system';
  level: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  data?: any;
}

export const useNotifications = () => {
  // Request browser notification permission on hook init
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
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
        tag: event.type, // Prevents duplicate notifications of same type
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

  return {
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
};