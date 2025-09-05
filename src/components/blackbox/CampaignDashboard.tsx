import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Settings, Bell, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { CampaignWallets } from "./CampaignWallets";
import { CampaignActivationGuide } from "./CampaignActivationGuide";
import { LiveActivityMonitor } from "./LiveActivityMonitor";
import { useCampaignNotifications } from "@/hooks/useCampaignNotifications";
import { TokenValidationInput } from "@/components/token/TokenValidationInput";
import { TokenMetadataDisplay } from "@/components/token/TokenMetadataDisplay";
import { TokenPriceDisplay } from "@/components/token/TokenPriceDisplay";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { Switch } from "@/components/ui/switch";

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
  }, []);

  useEffect(() => {
    // Check cooldowns for all campaigns when they load
    campaigns.forEach(campaign => {
      checkNotificationCooldown(campaign.id, 'blackbox');
    });
  }, [campaigns, checkNotificationCooldown]);

  const loadCampaigns = async () => {
    const { data, error } = await supabase
      .from('blackbox_campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: "Error loading campaigns", description: error.message });
      return;
    }

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
    if (campaignsWithMetadata && campaignsWithMetadata.length > 0 && !selectedCampaign) {
      setSelectedCampaign(campaignsWithMetadata[0]);
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
      toast({ title: "Error creating campaign", description: error.message });
      return;
    }

    // Add token metadata to the created campaign
    const campaignWithMetadata = {
      ...data,
      token_metadata: tokenData
    };

    toast({ title: "Campaign created", description: `${newCampaign.nickname} is ready` });
    setNewCampaign({ nickname: "", token_address: "" });
    setIsValidToken(false);
    setTokenData(null);
    setShowCreateForm(false);
    loadCampaigns();
    setSelectedCampaign(campaignWithMetadata);
  };

  const toggleCampaign = async (campaign: Campaign) => {
    const { error } = await supabase
      .from('blackbox_campaigns')
      .update({ is_active: !campaign.is_active })
      .eq('id', campaign.id);

    if (error) {
      toast({ title: "Error updating campaign", description: error.message });
      return;
    }

    toast({ 
      title: campaign.is_active ? "Campaign disabled" : "Campaign enabled", 
      description: `${campaign.nickname} is now ${campaign.is_active ? "disabled" : "enabled"}` 
    });
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
    if (!confirm(`Are you sure you want to delete campaign "${campaign.nickname}"? The wallets and commands will be preserved for reuse.`)) {
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
      // First, detach wallets from the campaign by setting campaign_id to null
      const { error: walletError } = await supabase
        .from('blackbox_wallets')
        .update({ campaign_id: null })
        .eq('campaign_id', campaign.id);

      if (walletError) {
        toast({ title: "Error detaching wallets", description: walletError.message });
        return;
      }

      // Then delete the campaign
      const { error } = await supabase
        .from('blackbox_campaigns')
        .delete()
        .eq('id', campaign.id);

      if (error) {
        toast({ title: "Error deleting campaign", description: error.message });
        return;
      }

      const endTime = Date.now();
      const actualDuration = ((endTime - startTime) / 1000).toFixed(1);
      
      toast({ 
        title: "Campaign deleted", 
        description: `${campaign.nickname} deleted in ${actualDuration}s. Wallets and commands preserved for reuse.` 
      });
      
      // Clear countdown interval
      clearInterval(countdownInterval);
      
      // Immediately update local state for responsive UI
      setCampaigns(prevCampaigns => prevCampaigns.filter(c => c.id !== campaign.id));
      
      // Reset selected campaign if it was the deleted one
      if (selectedCampaign?.id === campaign.id) {
        const remainingCampaigns = campaigns.filter(c => c.id !== campaign.id);
        setSelectedCampaign(remainingCampaigns.length > 0 ? remainingCampaigns[0] : null);
      }
    } finally {
      // Clear loading state
      setDeletingCampaignId(null);
      setDeletionCountdown(20);
    }
  };

  return (
    <div className="space-y-6">
      {/* Campaign List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Your Campaigns</CardTitle>
            <Button onClick={() => setShowCreateForm(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Campaign
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No campaigns yet. Create your first BumpBot campaign to get started.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className={`relative p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedCampaign?.id === campaign.id 
                      ? "border-primary bg-primary/5" 
                      : "hover:border-primary/50"
                  } ${deletingCampaignId === campaign.id ? "pointer-events-none" : ""}`}
                  onClick={() => setSelectedCampaign(campaign)}
                >
                  {deletingCampaignId === campaign.id && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-lg flex items-center justify-center z-10">
                      <div className="text-center">
                        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3"></div>
                        <p className="text-lg font-semibold mb-1">Deleting campaign...</p>
                        <p className="text-2xl font-bold text-primary">{deletionCountdown}</p>
                        <p className="text-xs text-muted-foreground mt-1">seconds remaining</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium mb-2">{campaign.nickname}</h3>
                      <div className="space-y-2">
                        <button
                          onClick={() => navigator.clipboard.writeText(campaign.token_address)}
                          className="text-sm text-muted-foreground font-mono hover:text-foreground transition-colors cursor-pointer"
                          title="Click to copy full address"
                        >
                          {campaign.token_address}
                        </button>
                        <TokenPriceDisplay 
                          tokenMint={campaign.token_address}
                          size="sm"
                          showDetails={true}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant={campaign.is_active ? "default" : "secondary"}>
                        {campaign.is_active ? "Enabled" : "Disabled"}
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
                      >
                        <Bell className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteCampaign(campaign);
                        }}
                        disabled={deletingCampaignId === campaign.id}
                        title="Delete campaign (preserves wallets and commands)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium">
                          {campaign.is_active ? "Enabled" : "Disabled"}
                        </label>
                        <Switch
                          checked={campaign.is_active}
                          onCheckedChange={(checked) => {
                            toggleCampaign(campaign);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Campaign Form */}
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
                value={newCampaign.nickname}
                onChange={(e) => setNewCampaign(prev => ({ ...prev, nickname: e.target.value }))}
                placeholder="My Token Pump"
              />
            </div>
            <TokenValidationInput
              value={newCampaign.token_address}
              onChange={(value) => setNewCampaign(prev => ({ ...prev, token_address: value }))}
              onValidationChange={(isValid, data) => {
                setIsValidToken(isValid);
                setTokenData(data);
              }}
            />
            <div className="flex gap-2">
              <Button 
                onClick={createCampaign} 
                disabled={!newCampaign.nickname || !newCampaign.token_address}
              >
                Create Campaign {/* Temporarily removed !isValidToken requirement due to edge function issues */}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowCreateForm(false);
                  setNewCampaign({ nickname: "", token_address: "" });
                  setIsValidToken(false);
                  setTokenData(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Selected Campaign Details */}
      {selectedCampaign && (
        <>
          <CampaignActivationGuide campaign={selectedCampaign} />
          <LiveActivityMonitor campaignId={selectedCampaign.id} />
          <CampaignWallets campaign={selectedCampaign} />
        </>
      )}
    </div>
  );
}