import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Settings, Play, Pause, Trash2, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { CampaignWallets } from "./CampaignWallets";
import { CampaignActivationGuide } from "./CampaignActivationGuide";
import { useCampaignNotifications } from "@/hooks/useCampaignNotifications";
import { TokenValidationInput } from "@/components/token/TokenValidationInput";
import { TokenMetadataDisplay } from "@/components/token/TokenMetadataDisplay";
import { TokenPriceDisplay } from "@/components/token/TokenPriceDisplay";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";

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
      title: campaign.is_active ? "Campaign paused" : "Campaign started", 
      description: `${campaign.nickname} is now ${campaign.is_active ? "inactive" : "active"}` 
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
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedCampaign?.id === campaign.id 
                      ? "border-primary bg-primary/5" 
                      : "hover:border-primary/50"
                  }`}
                  onClick={() => setSelectedCampaign(campaign)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium mb-2">{campaign.nickname}</h3>
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground font-mono">
                          {campaign.token_address.slice(0, 8)}...{campaign.token_address.slice(-6)}
                        </p>
                        <TokenPriceDisplay 
                          tokenMint={campaign.token_address}
                          size="sm"
                          showDetails={true}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={campaign.is_active ? "default" : "secondary"}>
                        {campaign.is_active ? "Active" : "Paused"}
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
                          toggleCampaign(campaign);
                        }}
                      >
                        {campaign.is_active ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
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
          <CampaignWallets campaign={selectedCampaign} />
        </>
      )}
    </div>
  );
}