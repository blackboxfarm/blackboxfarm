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

export default function HoldersBotLanding() {
  return (
    <div className="min-h-screen bg-background">
      <FarmBanner />
      
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Status Banner */}
        <div className="text-center mb-8">
          <Badge variant="outline" className="text-blue-500 border-blue-500/50 bg-blue-500/10 text-lg px-4 py-2">
            🔧 In Development
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
                    <Coins className="h-4 w-4 text-primary" />
                    One-Time Installation Fee
                  </h4>
                  <p className="text-sm text-muted-foreground">Lifetime access for your group/channel</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-primary">0.20 SOL</div>
                  <p className="text-xs text-muted-foreground">No monthly fees</p>
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

        {/* CTA */}
        <Card className="bg-muted/30 border-primary/20">
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">Interested in the Holders Bot?</h2>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
              The Holders Bot is currently in development. Contact us to express interest, 
              provide feedback, or join the early access waitlist.
            </p>
            <Link to="/contact">
              <Button size="lg" className="gap-2">
                <Mail className="h-4 w-4" />
                Join the Waitlist
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
