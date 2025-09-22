import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Settings, Bell, Trash2, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { CampaignWallets } from "./CampaignWallets";
import { CampaignActivationGuide } from "./CampaignActivationGuide";
import { LiveActivityMonitor } from "./LiveActivityMonitor";
import { WalletRecovery } from "./WalletRecovery";
import { CampaignCommands } from "./CampaignCommands";
import { useCampaignNotifications } from "@/hooks/useCampaignNotifications";
import { TokenValidationInput } from "@/components/token/TokenValidationInput";
import { TokenMetadataDisplay } from "@/components/token/TokenMetadataDisplay";
import { TokenPriceDisplay } from "@/components/token/TokenPriceDisplay";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Campaign {
  id: string;
  nickname: string;
  token_address: string;
  is_active: boolean;
  created_at: string;
  token_metadata?: any;
}

export function CampaignDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ nickname: "", token_address: "" });
  const [isValidToken, setIsValidToken] = useState(false);
  const [tokenData, setTokenData] = useState<any>(null);
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null);
  const [deletionCountdown, setDeletionCountdown] = useState<number>(20);
  const [showCampaignSelector, setShowCampaignSelector] = useState(false);
  
  const {
    sendCampaignNotification,
    getNotificationButtonText,
    canSendNotification,
    isLoading: isNotificationLoading,
    checkNotificationCooldown
  } = useCampaignNotifications();

  const { fetchTokenMetadata } = useTokenMetadata();

  useEffect(() => {
    loadCampaigns();
    
    // Set up real-time campaign updates  
    const campaignChannel = supabase
      .channel('campaign-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'blackbox_campaigns'
      }, (payload) => {
        console.log('Campaign change detected:', payload);
        loadCampaigns(); // Refresh campaigns when there are changes
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'campaign_wallets'
      }, (payload) => {
        console.log('Campaign wallet change detected:', payload);
        loadCampaigns(); // Refresh campaigns when wallet assignments change
      })
      .subscribe();

    return () => {
      supabase.removeChannel(campaignChannel);
    };
  }, []);

  useEffect(() => {
    // Check cooldowns for all campaigns when they load
    campaigns.forEach(campaign => {
      checkNotificationCooldown(campaign.id, 'blackbox');
    });
  }, [campaigns, checkNotificationCooldown]);

  const loadCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from('blackbox_campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        toast({ title: "Error loading campaigns", description: error.message });
        return;
      }

      // Clear any stale localStorage campaign references
      const storedCampaignKeys = Object.keys(localStorage).filter(key => 
        key.startsWith('campaign_active_') || key.startsWith('campaign_state_')
      );
      
      const existingCampaignIds = new Set((data || []).map(c => c.id));
      
      // Remove stale campaign data from localStorage
      storedCampaignKeys.forEach(key => {
        const campaignId = key.split('_').pop();
        if (campaignId && !existingCampaignIds.has(campaignId)) {
          localStorage.removeItem(key);
          console.log(`🧹 Cleaned up stale campaign data: ${key}`);
        }
      });

      // Fetch token metadata for each campaign
      const campaignsWithMetadata = await Promise.all(
        (data || []).map(async (campaign) => {
          try {
            const { data: tokenInfo } = await supabase.functions.invoke('token-metadata', {
              body: { tokenMint: campaign.token_address }
            });
            return {
              ...campaign,
              token_metadata: tokenInfo?.success ? tokenInfo : null
            };
          } catch (error) {
            return campaign;
          }
        })
      );

      setCampaigns(campaignsWithMetadata);
      
      // Validate current selected campaign still exists
      if (selectedCampaign && !campaignsWithMetadata.find(c => c.id === selectedCampaign.id)) {
        console.log(`🚨 Selected campaign ${selectedCampaign.id} no longer exists, clearing selection`);
        setSelectedCampaign(null);
        toast({
          title: "Campaign Not Found",
          description: `Campaign "${selectedCampaign.nickname}" no longer exists and has been cleared from view.`,
          variant: "destructive"
        });
      }
      
      if (campaignsWithMetadata && campaignsWithMetadata.length > 0 && !selectedCampaign) {
        setSelectedCampaign(campaignsWithMetadata[0]);
      }
    } catch (error: any) {
      console.error('Error in loadCampaigns:', error);
      toast({ 
        title: "Critical Error", 
        description: "Failed to load campaigns. Please refresh the page.",
        variant: "destructive"
      });
    }
  }; 

  const keepOnlyCampaign = async (campaign: Campaign) => {
    if (!confirm(`Keep ONLY "${campaign.nickname}" and permanently delete all your other campaigns and data?`)) return;
    try {
      // Identify other campaigns
      const others = campaigns.filter(c => c.id !== campaign.id);
      if (others.length === 0) {
        toast({ title: 'Nothing to delete', description: 'No other campaigns found.' });
        return;
      }

      // Delete all others in parallel via cascade edge function
      const results = await Promise.allSettled(
        others.map(c => supabase.functions.invoke('delete-campaign', {
          body: { campaign_id: c.id, campaign_type: 'blackbox' }
        }))
      );

      const failures = results.filter(r => r.status === 'rejected' || ('value' in r && (r as any).value.error));
      if (failures.length > 0) {
        toast({ title: 'Partial failure', description: `${failures.length} deletions failed.`, variant: 'destructive' });
      }

      // Reload campaigns and keep the selected one
      await loadCampaigns();
      setSelectedCampaign(campaign);

      toast({ title: 'Purge complete', description: `Kept "${campaign.nickname}" and deleted ${others.length - failures.length} campaign(s).` });
    } catch (e: any) {
      console.error('Keep only campaign failed:', e);
      toast({ title: 'Failed to purge', description: e?.message || 'Unexpected error', variant: 'destructive' });
    }
  };

  const createCampaign = async () => {
    if (!newCampaign.nickname || !newCampaign.token_address) {
      toast({ title: "Missing fields", description: "Please fill in all fields" });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Not authenticated", description: "Please log in" });
      return;
    }

    try {
      // Validate token first with optimized timeout
      console.log('Validating token:', newCampaign.token_address);
      
      const validationStartTime = Date.now();
      const { data: tokenValidation, error: tokenError } = await supabase.functions.invoke('token-metadata', {
        body: { tokenMint: newCampaign.token_address }
      });
      
      const validationTime = Date.now() - validationStartTime;
      console.log(`Token validation completed in ${validationTime}ms`);

      if (tokenError) {
        console.error('Token validation error:', tokenError);
        throw new Error(`Token validation failed: ${tokenError.message}`);
      }

      if (!tokenValidation?.success) {
        console.error('Token metadata error:', tokenValidation?.error);
        throw new Error(tokenValidation?.error || 'Invalid token address');
      }

      console.log('Token validated successfully:', tokenValidation);

      // Create campaign
      const { data, error } = await supabase
        .from('blackbox_campaigns')
        .insert({
          user_id: user.id,
          nickname: newCampaign.nickname,
          token_address: newCampaign.token_address
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Add token metadata to the created campaign
      const campaignWithMetadata = {
        ...data,
        token_metadata: tokenValidation
      };

      toast({ title: "Campaign created", description: `${newCampaign.nickname} is ready` });
      setNewCampaign({ nickname: "", token_address: "" });
      setIsValidToken(false);
      setTokenData(null);
      setShowCreateForm(false);
      loadCampaigns();
      setSelectedCampaign(campaignWithMetadata);
    } catch (error: any) {
      console.error('Error creating campaign:', error);
      toast({ 
        title: "Error creating campaign", 
        description: error.message || "Failed to create campaign"
      });
    }
  };

  const toggleCampaign = async (campaign: Campaign) => {
    const newStatus = !campaign.is_active;

    const { error } = await supabase
      .from('blackbox_campaigns')
      .update({ is_active: newStatus })
      .eq('id', campaign.id);

    if (error) {
      toast({ title: "Error updating campaign", description: error.message });
      return;
    }

    // Optimistically sync local state so list and details stay in lockstep
    setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, is_active: newStatus } : c));
    setSelectedCampaign(prev => (prev && prev.id === campaign.id) ? { ...prev, is_active: newStatus } : prev);

    toast({ 
      title: newStatus ? "Campaign enabled" : "Campaign disabled", 
      description: `${campaign.nickname} is now ${newStatus ? "enabled" : "disabled"}` 
    });

    // Still refresh from database to stay authoritative
    loadCampaigns();
  };

  const handleNotifyDonors = async (campaign: Campaign) => {
    const notificationType = campaign.is_active ? 'manual_start' : 'manual_restart';
    await sendCampaignNotification(
      campaign.id,
      'blackbox',
      notificationType,
      campaign.nickname,
      campaign.token_address
    );
  };

  const deleteCampaign = async (campaign: Campaign) => {
    if (!confirm(`Are you sure you want to PERMANENTLY delete campaign "${campaign.nickname}"? This will delete ALL associated data including wallets, commands, and transaction history. This action CANNOT be undone.`)) {
      return;
    }

    // Set loading state and start countdown
    setDeletingCampaignId(campaign.id);
    setDeletionCountdown(20);
    
    // Start countdown timer
    const countdownInterval = setInterval(() => {
      setDeletionCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const startTime = Date.now();
    
    try {
      // Use the new delete cascade function for complete cleanup
      const { data, error } = await supabase.functions.invoke('delete-campaign', {
        body: {
          campaign_id: campaign.id,
          campaign_type: 'blackbox'
        }
      });

      if (error) {
        console.error('Campaign deletion failed:', error);
        toast({ 
          title: "Error deleting campaign", 
          description: error.message,
          variant: "destructive" 
        });
        // Clear countdown interval on error
        clearInterval(countdownInterval);
        // Clear loading state on error
        setDeletingCampaignId(null);
        setDeletionCountdown(20);
        return;
      }

      const endTime = Date.now();
      const actualDuration = ((endTime - startTime) / 1000).toFixed(1);
      
      toast({ 
        title: "Campaign completely deleted", 
        description: `${campaign.nickname} and ALL associated data deleted in ${actualDuration}s. Deleted: ${JSON.stringify(data.deleted_counts)}` 
      });
      
      // Clear countdown interval on success
      clearInterval(countdownInterval);
      
      // Immediately update local state for responsive UI
      setCampaigns(prevCampaigns => prevCampaigns.filter(c => c.id !== campaign.id));
      
      // Reset selected campaign if it was the deleted one
      if (selectedCampaign?.id === campaign.id) {
        const remainingCampaigns = campaigns.filter(c => c.id !== campaign.id);
        setSelectedCampaign(remainingCampaigns.length > 0 ? remainingCampaigns[0] : null);
      }
      
      // Clear loading state on success
      setDeletingCampaignId(null);
      setDeletionCountdown(20);
    } catch (error: any) {
      console.error('Campaign deletion exception:', error);
      toast({ 
        title: "Failed to delete campaign", 
        description: error.message || "An unexpected error occurred",
        variant: "destructive" 
      });
      // Clear countdown interval on exception
      clearInterval(countdownInterval);
      // Clear loading state on exception
      setDeletingCampaignId(null);
      setDeletionCountdown(20);
    }
  };

  // Add force refresh function
  const forceRefreshCampaigns = async () => {
    // Clear all campaign-related cache
    const allKeys = Object.keys(localStorage);
    allKeys.forEach(key => {
      if (key.startsWith('campaign_') || key.startsWith('wallet_') || key.startsWith('command_')) {
        localStorage.removeItem(key);
      }
    });
    
    // Clear selected campaign
    setSelectedCampaign(null);
    
    // Reload campaigns
    await loadCampaigns();
    
    toast({
      title: "Data Refreshed",
      description: "All campaign data has been refreshed from the database."
    });
  };

  return (
    <div className="space-y-6">
      {/* Campaign Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Campaign Dashboard</CardTitle>
            <div className="flex gap-2">
              <Button onClick={forceRefreshCampaigns} variant="outline" size="sm">
                Force Refresh
              </Button>
              <Button onClick={() => setShowCreateForm(true)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Campaign
              </Button>
            </div>
          </div>
        </CardHeader>
        {campaigns.length === 0 && (
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <p>No campaigns yet. Create your first BumpBot campaign to get started.</p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* New Campaign Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Campaign</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="nickname">Campaign Nickname</Label>
              <Input
                id="nickname"
                placeholder="e.g., My First Campaign"
                value={newCampaign.nickname}
                onChange={(e) => setNewCampaign({ ...newCampaign, nickname: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="token">Token Address</Label>
              <TokenValidationInput
                value={newCampaign.token_address}
                onChange={(value) => {
                  setNewCampaign({ ...newCampaign, token_address: value });
                }}
                placeholder="Enter Solana token address"
              />
            </div>
            {newCampaign.token_address && (
              <TokenPriceDisplay 
                tokenMint={newCampaign.token_address}
                size="md"
                showDetails={true}
              />
            )}
            <div className="flex gap-2">
              <Button onClick={createCampaign}>
                Create Campaign
              </Button>
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Campaign Management */}
      {campaigns.length > 0 && (
        <>
          {/* Campaign Selection */}
          <Card>
            <CardHeader>
              <Collapsible open={showCampaignSelector} onOpenChange={setShowCampaignSelector}>
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-3">
                      <CardTitle>
                        {selectedCampaign ? `Active: ${selectedCampaign.nickname}` : "Select Campaign"}
                      </CardTitle>
                      {selectedCampaign && (
                        <Badge variant={selectedCampaign.is_active ? "default" : "secondary"}>
                          {selectedCampaign.is_active ? "Active" : "Disabled"}
                        </Badge>
                      )}
                    </div>
                    <ChevronDown className={`h-4 w-4 transition-transform ${showCampaignSelector ? 'rotate-180' : ''}`} />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
                    {campaigns.map((campaign) => (
                      <div
                        key={campaign.id}
                        className={`relative p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedCampaign?.id === campaign.id 
                            ? "border-primary bg-primary/5" 
                            : "hover:border-primary/50"
                        } ${deletingCampaignId === campaign.id ? "pointer-events-none" : ""}`}
                        onClick={() => {
                          setSelectedCampaign(campaign);
                  setShowCampaignSelector(false);
                        }}
                      >
                        {deletingCampaignId === campaign.id && (
                          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-lg flex items-center justify-center z-10">
                            <div className="text-center">
                              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
                              <p className="text-sm font-semibold mb-1">Deleting...</p>
                              <p className="text-lg font-bold text-primary">{deletionCountdown}</p>
                            </div>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm">{campaign.nickname}</h4>
                            <p className="text-xs text-muted-foreground font-mono truncate">
                              {campaign.token_address}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={campaign.is_active ? "default" : "secondary"} className="text-xs">
                              {campaign.is_active ? "Active" : "Disabled"}
                            </Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleNotifyDonors(campaign);
                              }}
                              disabled={!canSendNotification(campaign.id) || isNotificationLoading}
                              title={getNotificationButtonText(campaign.id, campaign.is_active)}
                              className="h-6 w-6 p-0"
                            >
                              <Bell className="h-3 w-3" />
                            </Button>
                            {campaign.nickname === 'OrangTUAH' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const { data } = await supabase.functions.invoke('run-alda-test');
                                    console.log('🧪 ALDA Test Result:', data);
                                    toast({ title: `ALDA Test: ${data?.status || 'Completed'}`, description: 'Check console for details' });
                                  } catch (error) {
                                    console.error('❌ ALDA Test Failed:', error);
                                    toast({ title: 'ALDA test failed', description: 'Check console for details', variant: 'destructive' });
                                  }
                                }}
                                disabled={deletingCampaignId === campaign.id}
                                className="h-6 px-2 text-xs"
                              >
                                🧪 Test
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                keepOnlyCampaign(campaign);
                              }}
                              disabled={deletingCampaignId === campaign.id}
                              className="h-6 px-2 text-xs"
                            >
                              Keep Only
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteCampaign(campaign);
                              }}
                              disabled={deletingCampaignId === campaign.id}
                              className="h-6 w-6 p-0"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                            <Switch
                              checked={campaign.is_active}
                              onCheckedChange={() => toggleCampaign(campaign)}
                              disabled={deletingCampaignId === campaign.id}
                            />
                           </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardHeader>
          </Card>

          {selectedCampaign && (
            <>
              <CampaignActivationGuide 
                campaign={selectedCampaign} 
                onCampaignUpdate={(updatedCampaign) => {
                  setSelectedCampaign({...selectedCampaign, ...updatedCampaign});
                  setCampaigns(prev => prev.map(c => c.id === updatedCampaign.id ? {...c, ...updatedCampaign} : c));
                }}
              />
              <LiveActivityMonitor campaignId={selectedCampaign.id} />
              <CampaignCommands campaign={selectedCampaign} />
              <CampaignWallets campaign={selectedCampaign} />
            </>
          )}
        </>
      )}

      <WalletRecovery 
        campaigns={campaigns} 
        onWalletRecovered={() => {
          if (selectedCampaign) {
            loadCampaigns();
          }
        }} 
      />
    </div>
  );
}