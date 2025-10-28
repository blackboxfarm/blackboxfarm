import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export const DeveloperProfiles = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDeveloperId, setSelectedDeveloperId] = useState<string | null>(null);

  const { data: profiles, isLoading, refetch } = useQuery({
    queryKey: ["developer-profiles", searchQuery],
    queryFn: async () => {
      let query = supabase
        .from("developer_profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (searchQuery) {
        query = query.or(`master_wallet_address.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%,twitter_handle.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: selectedProfile } = useQuery({
    queryKey: ["developer-profile-detail", selectedDeveloperId],
    enabled: !!selectedDeveloperId,
    queryFn: async () => {
      if (!selectedDeveloperId) return null;

      const [profileRes, walletsRes, tokensRes] = await Promise.all([
        supabase.from("developer_profiles").select("*").eq("id", selectedDeveloperId).single(),
        supabase.from("developer_wallets").select("*").eq("developer_id", selectedDeveloperId).order("depth_level"),
        supabase.from("developer_tokens").select("*").eq("developer_id", selectedDeveloperId).order("launch_date", { ascending: false }),
      ]);

      if (profileRes.error) throw profileRes.error;
      return {
        profile: profileRes.data,
        wallets: walletsRes.data || [],
        tokens: tokensRes.data || [],
      };
    },
  });

  const getTrustBadge = (trustLevel: string) => {
    const variants = {
      trusted: { variant: "default" as const, icon: CheckCircle, className: "bg-green-500/20 text-green-500" },
      neutral: { variant: "secondary" as const, icon: AlertTriangle, className: "bg-yellow-500/20 text-yellow-500" },
      suspicious: { variant: "destructive" as const, icon: AlertTriangle, className: "bg-orange-500/20 text-orange-500" },
      scammer: { variant: "destructive" as const, icon: AlertTriangle, className: "bg-red-500/20 text-red-500" },
    };
    const config = variants[trustLevel as keyof typeof variants] || variants.neutral;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className={config.className}>
        <Icon className="h-3 w-3 mr-1" />
        {trustLevel}
      </Badge>
    );
  };

  const getReputationColor = (score: number) => {
    if (score >= 70) return "text-green-500";
    if (score >= 40) return "text-yellow-500";
    return "text-red-500";
  };

  const triggerRecalculation = async (developerId: string) => {
    try {
      const { error } = await supabase.functions.invoke("developer-reputation-calculator", {
        body: { developerId },
      });
      if (error) throw error;
      toast.success("Reputation recalculated successfully");
      refetch();
    } catch (error) {
      toast.error("Failed to recalculate reputation");
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Developer Intelligence Profiles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by wallet, name, or Twitter handle..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
            <Button onClick={() => refetch()} variant="outline">
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading profiles...</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wallet</TableHead>
                    <TableHead>Name/Handle</TableHead>
                    <TableHead>Trust Level</TableHead>
                    <TableHead>Reputation</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead>Success Rate</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles?.map((profile) => (
                    <TableRow key={profile.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-mono text-xs">
                        {profile.master_wallet_address.slice(0, 8)}...{profile.master_wallet_address.slice(-6)}
                      </TableCell>
                      <TableCell>
                        <div>
                          {profile.display_name && <div className="font-medium">{profile.display_name}</div>}
                          {profile.twitter_handle && <div className="text-xs text-muted-foreground">@{profile.twitter_handle}</div>}
                        </div>
                      </TableCell>
                      <TableCell>{getTrustBadge(profile.trust_level || "neutral")}</TableCell>
                      <TableCell>
                        <span className={`font-bold ${getReputationColor(profile.reputation_score || 50)}`}>
                          {profile.reputation_score?.toFixed(0) || 50}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <span className="text-green-500">{profile.successful_tokens || 0}</span>
                          <span className="text-muted-foreground"> / </span>
                          <span>{profile.total_tokens_created || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {profile.total_tokens_created > 0
                          ? `${((profile.successful_tokens / profile.total_tokens_created) * 100).toFixed(1)}%`
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setSelectedDeveloperId(profile.id)}>
                            View Details
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => triggerRecalculation(profile.id)}>
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedProfile && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Developer Details</CardTitle>
              <Button variant="outline" onClick={() => setSelectedDeveloperId(null)}>
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="wallets">Wallets ({selectedProfile.wallets.length})</TabsTrigger>
                <TabsTrigger value="tokens">Tokens ({selectedProfile.tokens.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">{selectedProfile.profile.total_tokens_created || 0}</div>
                      <div className="text-xs text-muted-foreground">Total Tokens</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-green-500">{selectedProfile.profile.successful_tokens || 0}</div>
                      <div className="text-xs text-muted-foreground">Successful</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-red-500">{selectedProfile.profile.rug_pull_count || 0}</div>
                      <div className="text-xs text-muted-foreground">Rug Pulls</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">${(selectedProfile.profile.total_volume_generated || 0).toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">Total Volume</div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="wallets">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Address</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Depth</TableHead>
                      <TableHead>Transactions</TableHead>
                      <TableHead>SOL Received/Sent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedProfile.wallets.map((wallet) => (
                      <TableRow key={wallet.id}>
                        <TableCell className="font-mono text-xs">{wallet.wallet_address}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{wallet.wallet_type}</Badge>
                        </TableCell>
                        <TableCell>{wallet.depth_level}</TableCell>
                        <TableCell>{wallet.transaction_count || 0}</TableCell>
                        <TableCell>
                          <div className="text-xs">
                            <div className="text-green-500">↓ {wallet.total_sol_received || 0} SOL</div>
                            <div className="text-red-500">↑ {wallet.total_sol_sent || 0} SOL</div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="tokens">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Token Mint</TableHead>
                      <TableHead>Launch Date</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Market Cap</TableHead>
                      <TableHead>Performance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedProfile.tokens.map((token) => (
                      <TableRow key={token.id}>
                        <TableCell className="font-mono text-xs">{token.token_mint}</TableCell>
                        <TableCell>{new Date(token.launch_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant={token.outcome === "success" ? "default" : "destructive"}>
                            {token.outcome || "pending"}
                          </Badge>
                        </TableCell>
                        <TableCell>${(token.current_market_cap_usd || 0).toLocaleString()}</TableCell>
                        <TableCell>
                          <span className={token.performance_score >= 50 ? "text-green-500" : "text-red-500"}>
                            {token.performance_score || 0}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
