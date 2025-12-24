import { useNotificationsContext, Notification, NotificationEvent } from '@/contexts/NotificationsContext';

export type { Notification, NotificationEvent };

/**
 * Hook to access notifications.
 * This is now a thin wrapper around NotificationsContext for backwards compatibility.
 */
export const useNotifications = () => {
  return useNotificationsContext();
};
