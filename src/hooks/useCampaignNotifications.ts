import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface NotificationCooldown {
  campaignId: string;
  canNotify: boolean;
  nextNotificationTime?: Date;
}

interface CampaignTiming {
  id: string;
  campaign_id: string;
  campaign_type: string;
  started_at?: string;
  paused_at?: string;
  total_runtime_minutes: number;
  state_changes: any;
}

export function useCampaignNotifications() {
  const [cooldowns, setCooldowns] = useState<Record<string, NotificationCooldown>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [campaignTimings, setCampaignTimings] = useState<Record<string, CampaignTiming>>({});
  const { toast } = useToast();

  useEffect(() => {
    loadCampaignTimings();
  }, []);

  const loadCampaignTimings = async () => {
    try {
      const { data, error } = await supabase
        .from('campaign_timing')
        .select('*');

      if (error) throw error;

      const timingsMap: Record<string, CampaignTiming> = {};
      data?.forEach(timing => {
        timingsMap[timing.campaign_id] = {
          ...timing,
          state_changes: timing.state_changes || []
        };
      });
      setCampaignTimings(timingsMap);
    } catch (error) {
      console.error('Error loading campaign timings:', error);
    }
  };

  const checkNotificationCooldown = async (campaignId: string, campaignType: 'blackbox' | 'community') => {
    try {
      const { data, error } = await supabase.rpc('check_notification_cooldown', {
        p_campaign_id: campaignId,
        p_campaign_type: campaignType,
        p_hours: 1
      });

      if (error) throw error;

      const cooldown: NotificationCooldown = {
        campaignId,
        canNotify: data,
        nextNotificationTime: data ? undefined : new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
      };

      setCooldowns(prev => ({ ...prev, [campaignId]: cooldown }));
      return cooldown;
    } catch (error) {
      console.error('Error checking notification cooldown:', error);
      return { campaignId, canNotify: false };
    }
  };

  const sendCampaignNotification = async (
    campaignId: string, 
    campaignType: 'blackbox' | 'community',
    notificationType: 'manual_start' | 'manual_restart',
    campaignTitle?: string,
    tokenAddress?: string
  ) => {
    setIsLoading(true);
    
    try {
      // Check cooldown first
      const cooldown = await checkNotificationCooldown(campaignId, campaignType);
      
      if (!cooldown.canNotify) {
        toast({
          title: "Notification on cooldown",
          description: "Please wait before sending another notification",
          variant: "destructive"
        });
        return false;
      }

      const { data, error } = await supabase.functions.invoke('send-campaign-notification', {
        body: {
          campaignId,
          campaignType,
          notificationType,
          campaignTitle,
          tokenAddress
        }
      });

      if (error) throw error;

      if (data.error) {
        toast({
          title: "Failed to send notification",
          description: data.error,
          variant: "destructive"
        });
        return false;
      }

      toast({
        title: "Notification sent! ✅",
        description: `Sent to ${data.recipients_count} contributors`
      });

      // Update cooldown state
      await checkNotificationCooldown(campaignId, campaignType);
      
      return true;
    } catch (error) {
      console.error('Error sending campaign notification:', error);
      toast({
        title: "Error sending notification",
        description: error instanceof Error ? error.message : "Failed to send notification",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const getNotificationButtonText = (campaignId: string, isActive: boolean) => {
    const timing = campaignTimings[campaignId];
    const cooldown = cooldowns[campaignId];

    if (cooldown && !cooldown.canNotify) {
      const timeRemaining = cooldown.nextNotificationTime 
        ? Math.ceil((cooldown.nextNotificationTime.getTime() - Date.now()) / (1000 * 60))
        : 60;
      return `Next notification in ${timeRemaining}m`;
    }

    // Check restart criteria: campaign ran 15+ minutes and was intended for 20+ minutes
    if (!isActive && timing) {
      const ranLongEnough = timing.total_runtime_minutes >= 15;
      const stateChanges = Array.isArray(timing.state_changes) ? timing.state_changes : [];
      const wasLongCampaign = stateChanges.length > 0; // Simplify for now
      
      if (ranLongEnough && wasLongCampaign) {
        return "Notify Donors Campaign Restarted";
      }
    }

    return isActive ? "Notify Donors Campaign Started" : "Notify Donors Campaign Started";
  };

  const canSendNotification = (campaignId: string) => {
    const cooldown = cooldowns[campaignId];
    return !cooldown || cooldown.canNotify;
  };

  return {
    sendCampaignNotification,
    checkNotificationCooldown,
    getNotificationButtonText,
    canSendNotification,
    isLoading,
    cooldowns,
    campaignTimings,
    loadCampaignTimings
  };
}