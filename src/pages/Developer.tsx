import { useParams, Link } from "react-router-dom";
import { useDeveloperReputation } from "@/hooks/useDeveloperReputation";
import { useDeveloperIntegrity } from "@/hooks/useDeveloperIntegrity";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, ExternalLink, AlertTriangle, CheckCircle2, XCircle, Shield } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Developer() {
  const { walletAddress } = useParams<{ walletAddress: string }>();
  const { data: reputation, isLoading: reputationLoading } = useDeveloperReputation(walletAddress);

  // Fetch developer tokens
  const { data: tokens, isLoading: tokensLoading } = useQuery({
    queryKey: ['developer-tokens', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];

      const { data, error } = await supabase
        .from('developer_tokens')
        .select('*, developer_profiles!inner(display_name)')
        .eq('creator_wallet', walletAddress)
        .order('launch_date', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!walletAddress
  });

  if (!walletAddress) {
    return (
      <div className="container mx-auto p-8">
        <p className="text-muted-foreground">Invalid wallet address</p>
      </div>
    );
  }

  const getRiskBadgeVariant = (level: string) => {
    switch (level) {
      case 'verified': return 'default';
      case 'low': return 'secondary';
      case 'medium': return 'outline';
      case 'high': return 'destructive';
      case 'critical': return 'destructive';
      default: return 'outline';
    }
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'verified': return <CheckCircle2 className="h-4 w-4" />;
      case 'low': return <Shield className="h-4 w-4" />;
      case 'medium': return <AlertTriangle className="h-4 w-4" />;
      case 'high': return <AlertTriangle className="h-4 w-4" />;
      case 'critical': return <XCircle className="h-4 w-4" />;
      default: return <AlertTriangle className="h-4 w-4" />;
    }
  };

  return (
    <div className="container mx-auto p-8 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/super-admin">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Link>
        </Button>
      </div>

      {reputationLoading ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96 mt-2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      ) : reputation?.found ? (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-2xl">
                    {reputation.profile?.displayName || 'Unknown Developer'}
                    {reputation.profile?.kycVerified && (
                      <Badge variant="default" className="ml-2">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        KYC Verified
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-2">
                    <code className="text-xs">{walletAddress}</code>
                  </CardDescription>
                </div>
                <Badge variant={getRiskBadgeVariant(reputation.risk?.level || 'unknown')} className="gap-1">
                  {getRiskIcon(reputation.risk?.level || 'unknown')}
                  {reputation.risk?.level?.toUpperCase() || 'UNKNOWN'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {reputation.risk?.warning && (
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive">{reputation.risk.warning}</p>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Tokens</p>
                  <p className="text-2xl font-bold">{reputation.stats?.totalTokens || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Successful</p>
                  <p className="text-2xl font-bold text-green-500">{reputation.stats?.successfulTokens || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Rug Pulls</p>
                  <p className="text-2xl font-bold text-red-500">{reputation.stats?.rugPulls || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Reputation Score</p>
                  <p className="text-2xl font-bold">{reputation.stats?.reputationScore?.toFixed(1) || 'N/A'}</p>
                </div>
              </div>

              {reputation.profile?.tags && reputation.profile.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {reputation.profile.tags.map((tag: string) => (
                    <Badge key={tag} variant="outline">{tag}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Token History</CardTitle>
              <CardDescription>All tokens created by this developer</CardDescription>
            </CardHeader>
            <CardContent>
              {tokensLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : tokens && tokens.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Token Mint</TableHead>
                      <TableHead>Launch Date</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Launchpad</TableHead>
                      <TableHead>Lifespan</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tokens.map((token) => (
                      <TableRow key={token.id}>
                        <TableCell>
                          <code className="text-xs">{token.token_mint.slice(0, 8)}...</code>
                        </TableCell>
                        <TableCell className="text-sm">
                          {token.launch_date ? new Date(token.launch_date).toLocaleDateString() : 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={token.outcome === 'success' ? 'default' : token.outcome === 'rug_pull' ? 'destructive' : 'outline'}>
                            {token.outcome || 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{token.launchpad || 'Unknown'}</TableCell>
                        <TableCell className="text-sm">{token.lifespan_days} days</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" asChild>
                            <a href={`https://solscan.io/token/${token.token_mint}`} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No tokens found for this developer</p>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Developer Not Found</CardTitle>
            <CardDescription>
              <code className="text-xs">{walletAddress}</code>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This wallet address is not yet in our developer database. It may be a new creator or hasn't been analyzed yet.
            </p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <a href={`https://solscan.io/account/${walletAddress}`} target="_blank" rel="noopener noreferrer">
                View on Solscan
                <ExternalLink className="h-3 w-3 ml-2" />
              </a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}