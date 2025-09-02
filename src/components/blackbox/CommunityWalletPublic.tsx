import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCommunityWallet } from "@/hooks/useCommunityWallet";
import { CampaignCreatorSetupDialog } from "@/components/dialogs/CampaignCreatorSetupDialog";
import { CampaignSearchModal } from "@/components/dialogs/CampaignSearchModal";
import { 
  Users, 
  Wallet, 
  Shield, 
  TrendingUp, 
  ArrowRight,
  Share2,
  LogIn,
  UserPlus,
  Search,
  Info
} from "lucide-react";
import { AuthButton } from "@/components/auth/AuthButton";

export function CommunityWalletPublic() {
  const { toast } = useToast();
  const { isAuthenticated, user } = useAuth();
  const { campaigns, myContributions, isLoading } = useCommunityWallet();
  const [showCreatorDialog, setShowCreatorDialog] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);

  const handleShare = async () => {
    const shareData = {
      title: 'BlackBox Farm - Community Campaigns',
      text: 'Join our community-powered token campaigns! Pool resources for bigger impact and better trading outcomes. 🚀',
      url: window.location.href,
    };

    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        toast({
          title: "Shared successfully!",
          description: "Your team can now join the community campaigns.",
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        toast({
          title: "Link copied!",
          description: "Share this link with your team to get started.",
        });
      }
    } catch (error) {
      console.error('Share failed:', error);
      // Fallback to clipboard
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast({
          title: "Link copied!",
          description: "Share this link with your team to get started.",
        });
      } catch (clipboardError) {
        toast({
          title: "Share failed",
          description: "Please copy the URL manually to share with your team.",
          variant: "destructive",
        });
      }
    }
  };

  const handleCreateCampaignClick = () => {
    if (!isAuthenticated) {
      // Show auth modal or redirect to login
      toast({
        title: "Authentication Required",
        description: "Please sign in or create an account to create campaigns",
      });
      return;
    }

    // Check if user is already a campaign creator (has created campaigns)
    const hasCreatedCampaigns = campaigns.some(campaign => campaign.creator_id === user?.id);
    
    if (hasCreatedCampaigns) {
      // User is already a creator, redirect to dashboard
      window.location.href = '/blackbox';
      return;
    }

    // User is authenticated but hasn't created campaigns yet, show upgrade dialog
    setShowCreatorDialog(true);
  };

  const handleCreatorSetup = () => {
    setShowCreatorDialog(false);
    // Here we would typically update user profile/role in the database
    // For now, redirect to dashboard
    toast({
      title: "Dashboard Account Created!",
      description: "Welcome to your campaign dashboard. You can now create and manage campaigns.",
    });
    window.location.href = '/blackbox';
  };

  const handleSearchCampaigns = () => {
    setShowSearchModal(true);
  };

  const handleSelectCampaign = (campaign: any) => {
    // Redirect to the specific campaign or open contribution modal
    toast({
      title: "Campaign Selected",
      description: `Viewing ${campaign.title}`,
    });
    // Could implement specific campaign view or contribution flow here
  };

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <Badge variant="secondary" className="px-4 py-2 text-sm">
          🤝 Community-Powered Campaigns
        </Badge>
        <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
          Join Forces, Amplify Results
        </h2>
        <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
          No active wallet contributions found. Ready to join a community campaign or create one with your team?
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="text-center p-6 border-dashed border-2 border-muted">
          <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            {isAuthenticated && myContributions.length > 0 
              ? `${myContributions.length} Active Contributions` 
              : "No Active Contributions"
            }
          </h3>
          <p className="text-sm text-muted-foreground">
            {isAuthenticated && myContributions.length > 0
              ? "You're contributing to community campaigns"
              : "You haven't joined any community campaigns yet"
            }
          </p>
        </Card>

        <Card 
          className="text-center p-6 border-2 border-primary/20 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors"
          onClick={handleSearchCampaigns}
        >
          <Search className="h-12 w-12 text-primary mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Search Campaigns</h3>
          <p className="text-sm text-muted-foreground">
            Browse active community campaigns to join
          </p>
        </Card>

        <Card 
          className="text-center p-6 border-2 border-primary/20 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors"
          onClick={handleCreateCampaignClick}
        >
          <Users className="h-12 w-12 text-primary mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Create Campaign</h3>
          <p className="text-sm text-muted-foreground">
            Start a new campaign with your team
          </p>
        </Card>
      </div>

      {/* How Community Campaigns Work */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            How Community Campaigns Work
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary">1</span>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Team Creates Campaign</h4>
                  <p className="text-sm text-muted-foreground">
                    Your team leader creates a community campaign with target goals and contribution limits
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary">2</span>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Members Contribute</h4>
                  <p className="text-sm text-muted-foreground">
                    Team members contribute SOL to the shared campaign wallet for maximum impact
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary">3</span>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Automated Execution</h4>
                  <p className="text-sm text-muted-foreground">
                    Once funded, our BumpBot executes coordinated trading strategies automatically
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary">4</span>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Real-Time Monitoring</h4>
                  <p className="text-sm text-muted-foreground">
                    Track campaign progress, contributions, and performance in real-time
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary">5</span>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Transparent Results</h4>
                  <p className="text-sm text-muted-foreground">
                    All transactions and results are visible to campaign contributors
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary">6</span>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Profit Distribution</h4>
                  <p className="text-sm text-muted-foreground">
                    Profits are distributed proportionally to contributors automatically
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Benefits */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="p-6 text-center">
          <Shield className="h-12 w-12 text-blue-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Secure & Transparent</h3>
          <p className="text-sm text-muted-foreground">
            All funds are secured in multi-sig wallets with full transaction transparency
          </p>
        </Card>

        <Card className="p-6 text-center">
          <TrendingUp className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Higher Impact</h3>
          <p className="text-sm text-muted-foreground">
            Pool resources for larger trades and more significant market impact
          </p>
        </Card>

        <Card className="p-6 text-center">
          <Users className="h-12 w-12 text-purple-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Community Power</h3>
          <p className="text-sm text-muted-foreground">
            Leverage collective knowledge and resources for better trading outcomes
          </p>
        </Card>
      </div>

      {/* Call to Action */}
      <div className="text-center bg-gradient-to-r from-primary/10 to-accent/10 p-8 rounded-lg space-y-6">
        <h3 className="text-2xl font-semibold mb-3">Ready to Join or Create a Campaign?</h3>
        <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
          Get started by creating an account or ask your team to create a campaign here. 
          Share this platform with your team to coordinate your next big pump!
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <div className="flex flex-col sm:flex-row gap-3">
            <AuthButton />
            <Button 
              variant="outline" 
              size="lg" 
              className="px-6"
              onClick={handleShare}
            >
              <Share2 className="mr-2 h-4 w-4" />
              Share with Team
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          💡 <strong>Tip:</strong> Share this link with your team so they can create campaigns and invite you to contribute
        </p>
      </div>

      {/* Dialogs */}
      <CampaignCreatorSetupDialog
        isOpen={showCreatorDialog}
        onClose={() => setShowCreatorDialog(false)}
        onConfirm={handleCreatorSetup}
        onCancel={() => setShowCreatorDialog(false)}
      />

      <CampaignSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        campaigns={campaigns}
        onSelectCampaign={handleSelectCampaign}
      />
    </div>
  );
}