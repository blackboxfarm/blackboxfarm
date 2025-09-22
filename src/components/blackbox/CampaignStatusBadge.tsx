import React from "react";
import { Badge } from "@/components/ui/badge";
import { Activity, Pause, AlertTriangle } from "lucide-react";

interface CampaignStatusBadgeProps {
  isActive: boolean;
  hasRecentActivity?: boolean;
  lastActivityTime?: Date | null;
  className?: string;
}

export function CampaignStatusBadge({ 
  isActive, 
  hasRecentActivity = false, 
  lastActivityTime,
  className 
}: CampaignStatusBadgeProps) {
  if (!isActive) {
    return (
      <Badge variant="secondary" className={`flex items-center gap-1 ${className}`}>
        <Pause className="h-3 w-3" />
        Paused
      </Badge>
    );
  }

  // Check if campaign is stalled (no activity in 10+ minutes)
  const isStalled = lastActivityTime && 
    (Date.now() - lastActivityTime.getTime()) > 10 * 60 * 1000;

  if (isStalled) {
    return (
      <Badge variant="destructive" className={`flex items-center gap-1 ${className}`}>
        <AlertTriangle className="h-3 w-3" />
        Stalled
      </Badge>
    );
  }

  if (hasRecentActivity) {
    return (
      <Badge variant="default" className={`flex items-center gap-1 animate-pulse ${className}`}>
        <Activity className="h-3 w-3" />
        Active
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={`flex items-center gap-1 ${className}`}>
      <Activity className="h-3 w-3" />
      Running
    </Badge>
  );
}