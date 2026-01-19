import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FarmBanner } from "@/components/FarmBanner";
import { Activity, BarChart3, Wallet, Settings, ArrowRight, Mail } from "lucide-react";

export default function VolumeBotLanding() {
  return (
    <div className="min-h-screen bg-background">
      <FarmBanner />
      
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Status Banner */}
        <div className="text-center mb-8">
          <Badge variant="outline" className="text-amber-500 border-amber-500/50 bg-amber-500/10 text-lg px-4 py-2">
            ⏳ PENDING for Public Use
          </Badge>
        </div>

        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Activity className="h-12 w-12 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold">Volume Bot</h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Generate organic-looking trading volume for your Solana tokens. Boost visibility and attract genuine traders with smart volume strategies.
          </p>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-green-500" />
                Smart Volume Generation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Create natural-looking trading patterns that blend with organic market activity. Avoid detection with randomized timing and amounts.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-blue-500" />
                Multi-Wallet Support
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Distribute volume across multiple wallets for authentic trading patterns. Automatic wallet management and fund distribution.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-purple-500" />
                Customizable Parameters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Fine-tune volume targets, trade sizes, frequency, and timing windows. Full control over your volume generation strategy.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-amber-500" />
                Real-time Analytics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Monitor your volume campaigns with detailed analytics. Track performance, costs, and ROI in real-time.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Coming Soon CTA */}
        <Card className="bg-muted/30 border-primary/20">
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">Interested in Early Access?</h2>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
              Volume Bot is currently in development and pending public release. Contact us to express interest or request early access.
            </p>
            <Link to="/contact">
              <Button size="lg" className="gap-2">
                <Mail className="h-4 w-4" />
                Contact Us for Access
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
