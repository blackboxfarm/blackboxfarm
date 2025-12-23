import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Mail } from "lucide-react";

export const CronStatusPanel = () => {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-primary" />
          Cron Monitoring
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>Every 5 minutes</span>
          <span className="text-muted-foreground/50">•</span>
          <span className="flex items-center gap-1">
            <Mail className="h-3 w-3" /> Email alerts on new mints
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
