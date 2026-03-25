import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FarmBanner } from "@/components/FarmBanner";
import { 
  Bot, 
  MessageCircle, 
  Users, 
  Zap, 
  Shield, 
  ArrowRight, 
  Mail,
  Coins,
  Crown
} from "lucide-react";
import { usePageTracking } from "@/hooks/usePageTracking";

export default function HoldersBotLanding() {
  usePageTracking('holders-bot');
  
  return (
    <div className="min-h-screen bg-background">
      <FarmBanner />
      
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Status Banner */}
        <div className="text-center mb-8">
          <Badge variant="outline" className="text-green-500 border-green-500/50 bg-green-500/10 text-lg px-4 py-2">
            ✅ Live Now
          </Badge>
        </div>

        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Bot className="h-12 w-12 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold">Holders Bot</h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Bring real-time token holder analysis directly to your Telegram. Quick wallet insights for traders and community managers.
          </p>
        </div>

        {/* Personal Use Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              For Individual Traders
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Chat directly with the Holders Bot in your private Telegram. Simply send any Solana token address 
              and receive an instant holder analysis report – no website needed.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Quick Analysis</Badge>
              <Badge variant="secondary">Private Chat</Badge>
              <Badge variant="secondary">Instant Results</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Community Use Section */}
        <Card className="mb-8 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              For Group & Channel Admins
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">
              Supercharge your crypto community with real-time holder analysis. Install the Holders Bot 
              in your Telegram Group or Channel and give your members instant access to token due diligence.
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Community Benefits
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Members can verify tokens before buying</li>
                  <li>• Reduce scam victims in your community</li>
                  <li>• Add value that sets your group apart</li>
                  <li>• Real-time analysis without leaving Telegram</li>
                </ul>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-blue-500" />
                  How It Works
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Any member posts a token address</li>
                  <li>• Bot replies with holder analysis</li>
                  <li>• Shows distribution, risks, and health score</li>
                  <li>• Links to full report on BlackBox Farm</li>
                </ul>
              </div>
            </div>

            {/* Pricing */}
            <div className="bg-background/50 rounded-lg p-4 border">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold flex items-center gap-2">
                    <Coins className="h-4 w-4 text-green-400" />
                    Free Channel Installation
                  </h4>
                  <p className="text-sm text-muted-foreground">Register your channel — no payment required</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-green-400">FREE</div>
                  <p className="text-xs text-muted-foreground">Just register & add bot</p>
                </div>
              </div>
            </div>
            {/* Upgrade Tier */}
            <div className="bg-amber-500/5 rounded-lg p-4 border border-amber-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-400" />
                    Upgrade Tier
                    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">Coming Soon</Badge>
                  </h4>
                  <p className="text-sm text-muted-foreground">Fast Base Dev Token MINT Alerts and more</p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-amber-400">TBA</div>
                  <p className="text-xs text-muted-foreground">Advanced features</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-4 mb-12">
          <Card>
            <CardContent className="p-4 text-center">
              <Zap className="h-8 w-8 text-amber-500 mx-auto mb-2" />
              <h3 className="font-semibold">Instant Results</h3>
              <p className="text-sm text-muted-foreground">Analysis in seconds, not minutes</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 text-center">
              <Shield className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <h3 className="font-semibold">Risk Detection</h3>
              <p className="text-sm text-muted-foreground">Spot red flags before buying</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 text-center">
              <MessageCircle className="h-8 w-8 text-blue-500 mx-auto mb-2" />
              <h3 className="font-semibold">Native Telegram</h3>
              <p className="text-sm text-muted-foreground">No apps or websites needed</p>
            </CardContent>
          </Card>
        </div>

        {/* Telegram Channel Promo */}
        <Card className="mb-8 border-blue-500/20 bg-blue-500/5">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="shrink-0 w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-blue-400" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">📢 Holders Intel Channel</p>
              <p className="text-sm text-muted-foreground">Live alerts, alpha drops, and token intel — straight to your Telegram.</p>
            </div>
            <a href="https://t.me/HoldersIntel" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="border-blue-400/30 text-blue-400 gap-1">
                Join <ArrowRight className="w-3 h-3" />
              </Button>
            </a>
          </CardContent>
        </Card>

        {/* CTA */}
        <Card className="bg-muted/30 border-primary/20">
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">Start Using the Holders Bot</h2>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
              The Holders Bot is live. Open it in Telegram and paste any contract address to get instant alpha.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <a href="https://t.me/holdersintel_bot" target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="gap-2">
                  <MessageCircle className="h-4 w-4" />
                  Open @holdersintel_bot
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
              <Link to="/tgbot">
                <Button size="lg" variant="outline" className="gap-2">
                  Learn More <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
