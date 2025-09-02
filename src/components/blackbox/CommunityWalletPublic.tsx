import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'BlackBox Farm Community Campaigns',
        text: 'Join our community campaigns for collaborative token pumping!',
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
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
          <h3 className="text-lg font-semibold mb-2">No Active Contributions</h3>
          <p className="text-sm text-muted-foreground">
            You haven't joined any community campaigns yet
          </p>
        </Card>

        <Card className="text-center p-6 border-2 border-primary/20 bg-primary/5">
          <Search className="h-12 w-12 text-primary mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Search Campaigns</h3>
          <p className="text-sm text-muted-foreground">
            Browse active community campaigns to join
          </p>
        </Card>

        <Card className="text-center p-6 border-2 border-primary/20 bg-primary/5">
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
    </div>
  );
}