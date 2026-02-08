import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOracleClassifications, useTriggerAutoClassifier } from "@/hooks/useOracleLookup";
import { RefreshCw, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const OracleClassificationsFeed = () => {
  const { data: classifications, isLoading, refetch } = useOracleClassifications(50);
  const triggerClassifier = useTriggerAutoClassifier();

  const handleRunClassifier = async () => {
    try {
      const result = await triggerClassifier.mutateAsync({ processNewTokens: true });
      toast.success(`Processed ${result.processed} wallets: ${result.blacklisted} blacklisted, ${result.whitelisted} whitelisted`);
      refetch();
    } catch (error) {
      toast.error("Failed to run auto-classifier");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                📊 Auto-Classifications Feed
              </CardTitle>
              <CardDescription>
                Real-time feed of automatically classified developers
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button 
                size="sm" 
                onClick={handleRunClassifier}
                disabled={triggerClassifier.isPending}
              >
                {triggerClassifier.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Running...
                  </>
                ) : (
                  'Run Classifier Now'
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading classifications...</p>
          </CardContent>
        </Card>
      ) : classifications && classifications.length > 0 ? (
        <div className="space-y-3">
          {classifications.map((entry) => {
            // Get wallet address from either blacklist or whitelist entry format
            const walletAddress = 'primary_wallet' in entry ? entry.primary_wallet : 
                                  'entity_value' in entry ? entry.entity_value : 'Unknown';
            // Get reason text from various possible fields
            const reasonText = 'blacklist_reason' in entry ? entry.blacklist_reason :
                               'reason_notes' in entry ? entry.reason_notes : 
                               'Auto-classified by Oracle';
            
            return (
            <Card 
              key={entry.id} 
              className={entry.type === 'blacklist' ? 'border-red-500/30' : 'border-green-500/30'}
            >
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    {entry.type === 'blacklist' ? (
                      <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
                    ) : (
                      <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">
                          {typeof walletAddress === 'string' ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}` : 'Unknown'}
                        </span>
                        <Badge 
                          variant={entry.type === 'blacklist' ? 'destructive' : 'default'}
                          className={entry.type === 'whitelist' ? 'bg-green-500/20 text-green-500' : ''}
                        >
                          {entry.type === 'blacklist' ? 'BLACKLISTED' : 'WHITELISTED'}
                        </Badge>
                        {entry.classification_score !== null && (
                          <Badge variant="outline">
                            Score: {entry.classification_score}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {String(reasonText)}
                      </p>
                      {entry.recommendation_text && (
                        <p className="text-xs text-muted-foreground mt-2 p-2 bg-muted/50 rounded">
                          {entry.recommendation_text}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No auto-classifications yet. Run the classifier to analyze new tokens.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OracleClassificationsFeed;
