import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Flag, ShieldAlert, Info } from 'lucide-react';

interface SecurityAlert {
  type: 'critical' | 'warning' | 'info';
  message: string;
  flagged?: boolean;
}

interface SecurityAlertsCardProps {
  alerts: SecurityAlert[];
}

export function SecurityAlertsCard({ alerts }: SecurityAlertsCardProps) {
  if (alerts.length === 0) return null;

  const criticalCount = alerts.filter(a => a.type === 'critical').length;
  const warningCount = alerts.filter(a => a.type === 'warning').length;

  const getBorderColor = () => {
    if (criticalCount > 0) return 'border-red-500/30 bg-red-500/5';
    if (warningCount > 0) return 'border-orange-500/30 bg-orange-500/5';
    return 'border-blue-500/30 bg-blue-500/5';
  };

  const getAlertStyles = (type: SecurityAlert['type']) => {
    switch (type) {
      case 'critical':
        return 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300';
      case 'warning':
        return 'bg-orange-500/10 border-orange-500/20 text-orange-700 dark:text-orange-300';
      case 'info':
        return 'bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300';
    }
  };

  const getAlertIcon = (type: SecurityAlert['type']) => {
    switch (type) {
      case 'critical':
        return <ShieldAlert className="h-4 w-4 flex-shrink-0" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 flex-shrink-0" />;
      case 'info':
        return <Info className="h-4 w-4 flex-shrink-0" />;
    }
  };

  return (
    <Card className={`border-2 ${getBorderColor()}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          Security Alerts
          {criticalCount > 0 && (
            <span className="text-xs bg-red-500/20 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">
              {criticalCount} Critical
            </span>
          )}
          {warningCount > 0 && (
            <span className="text-xs bg-orange-500/20 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full">
              {warningCount} Warning
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.map((alert, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-lg text-sm flex items-start gap-2 border ${getAlertStyles(alert.type)}`}
          >
            {getAlertIcon(alert.type)}
            <span className="flex-1">
              {alert.flagged && <Flag className="inline h-3 w-3 mr-1" />}
              {alert.message}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
