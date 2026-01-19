import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FarmBanner } from "@/components/FarmBanner";
import { Zap, TrendingUp, Clock, Shield, ArrowRight, Mail } from "lucide-react";

export default function BumpBotLanding() {
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
            <Zap className="h-12 w-12 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold">BumpBot</h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Automated token bumping service for Solana meme coins. Keep your token visible and trending on pump.fun and other platforms.
          </p>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                Stay Trending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Keep your token at the top of the "King of the Hill" rankings with strategic, timed bumps that maximize visibility.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-500" />
                Automated Scheduling
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Set it and forget it. Configure your bump schedule and let the bot handle the timing for optimal exposure.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-purple-500" />
                Secure Execution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                All transactions are executed securely with minimal gas fees and maximum reliability.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                Cost Effective
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Competitive pricing with transparent fee structures. Only pay for what you use.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Coming Soon CTA */}
        <Card className="bg-muted/30 border-primary/20">
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">Interested in Early Access?</h2>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
              BumpBot is currently in development and pending public release. Contact us to express interest or request early access.
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
