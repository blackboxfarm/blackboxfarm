import { Shield, AlertTriangle, CheckCircle, HelpCircle, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeveloperReputation } from "@/hooks/useDeveloperReputation";
import { Skeleton } from "@/components/ui/skeleton";

interface DeveloperRiskBadgeProps {
  creatorWallet?: string;
  className?: string;
  showDetails?: boolean;
}

export const DeveloperRiskBadge = ({ creatorWallet, className = "", showDetails = false }: DeveloperRiskBadgeProps) => {
  const { data: reputation, isLoading } = useDeveloperReputation(creatorWallet);

  if (!creatorWallet) {
    return null;
  }

  if (isLoading) {
    return <Skeleton className="h-6 w-24" />;
  }

  if (!reputation?.found) {
    return showDetails ? (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className={`gap-1 ${className}`}>
              <HelpCircle className="h-3 w-3" />
              Unknown Developer
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>This developer is not in our intelligence database</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : null;
  }

  const { risk, profile, stats } = reputation;

  const getBadgeVariant = (level: string) => {
    switch (level) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'destructive';
      case 'medium':
        return 'outline';
      case 'low':
        return 'secondary';
      case 'verified':
        return 'default';
      default:
        return 'outline';
    }
  };

  const getIcon = (level: string) => {
    switch (level) {
      case 'critical':
        return <Ban className="h-3 w-3" />;
      case 'high':
        return <AlertTriangle className="h-3 w-3" />;
      case 'medium':
        return <Shield className="h-3 w-3" />;
      case 'low':
        return <CheckCircle className="h-3 w-3" />;
      case 'verified':
        return <CheckCircle className="h-3 w-3" />;
      default:
        return <HelpCircle className="h-3 w-3" />;
    }
  };

  const tooltipContent = (
    <div className="space-y-2 max-w-xs">
      {profile?.displayName && (
        <p className="font-semibold">{profile.displayName}</p>
      )}
      {risk?.warning && (
        <p className="text-destructive">{risk.warning}</p>
      )}
      {stats && (
        <div className="space-y-1 text-xs">
          <p>Reputation Score: {stats.reputationScore}/100</p>
          <p>Total Tokens: {stats.totalTokens}</p>
          <p>Successful: {stats.successfulTokens} | Failed: {stats.failedTokens}</p>
          {stats.rugPulls > 0 && (
            <p className="text-destructive font-semibold">⚠️ Rug Pulls: {stats.rugPulls}</p>
          )}
          {stats.slowDrains > 0 && (
            <p className="text-destructive font-semibold">⚠️ Slow Drains: {stats.slowDrains}</p>
          )}
        </div>
      )}
      {profile?.kycVerified && (
        <p className="text-xs text-green-600">✓ KYC Verified</p>
      )}
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge 
            variant={getBadgeVariant(risk?.level || 'unknown')} 
            className={`gap-1 ${className}`}
          >
            {getIcon(risk?.level || 'unknown')}
            {showDetails ? (
              <>
                {risk?.level === 'critical' && 'BLACKLISTED'}
                {risk?.level === 'high' && 'High Risk'}
                {risk?.level === 'medium' && 'Medium Risk'}
                {risk?.level === 'low' && 'Low Risk'}
                {risk?.level === 'verified' && 'Verified Dev'}
                {(!risk?.level || risk?.level === 'unknown') && 'Unknown'}
              </>
            ) : (
              <span className="text-xs">{risk?.score || '?'}</span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
