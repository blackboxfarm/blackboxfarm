import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { 
  MousePointerClick,
  Target,
  BarChart3,
  DollarSign,
  Megaphone
} from "lucide-react";
import { FarmBanner } from "@/components/FarmBanner";
import { SolPriceDisplay } from "@/components/SolPriceDisplay";

export default function Adverts() {
  const navigate = useNavigate();

  const adBenefits = [
    {
      icon: <MousePointerClick className="w-5 h-5" />,
      title: "High-Intent Traffic",
      description: "Users actively researching tokens before buying - ready to engage"
    },
    {
      icon: <Target className="w-5 h-5" />,
      title: "Perfect Audience",
      description: "Solana traders, degens, and investors making buy decisions"
    },
    {
      icon: <BarChart3 className="w-5 h-5" />,
      title: "Premium Placements",
      description: "Top-of-page visibility on every holder analysis report"
    },
    {
      icon: <DollarSign className="w-5 h-5" />,
      title: "Performance Tracking",
      description: "Track impressions, clicks, and conversions on your campaigns"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <FarmBanner />
      
      <div className="mx-auto py-8 px-4 max-w-6xl space-y-12">
        
        {/* Hero Section */}
        <div className="text-center space-y-6">
          <div className="flex items-center justify-center gap-3">
            <img 
              src="/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png" 
              alt="BlackBox Cube Logo" 
              className="w-16 h-16"
            />
            <h1 className="text-5xl font-bold bg-gradient-to-r from-primary via-accent to-primary/60 bg-clip-text text-transparent">
              Advertise With Us
            </h1>
          </div>
          <p className="text-2xl text-muted-foreground max-w-3xl mx-auto">
            Get in front of active traders at the exact moment they're making buy decisions
          </p>
          <SolPriceDisplay size="lg" className="justify-center" />
        </div>

        {/* Why Advertise Here */}
        <div className="space-y-6">
          <div className="text-center space-y-4">
            <h2 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Why Advertise Here?
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Reach serious traders during their research phase - the most valuable moment in the buying journey
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {adBenefits.map((benefit, index) => (
              <Card key={index} className="border-primary/20 hover:border-primary/40 transition-colors">
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 text-primary">
                      {benefit.icon}
                    </div>
                    <h3 className="text-lg font-semibold">{benefit.title}</h3>
                  </div>
                  <p className="text-muted-foreground">{benefit.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/30">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-start gap-4">
                <Megaphone className="w-12 h-12 text-primary flex-shrink-0" />
                <div className="space-y-2">
                  <h3 className="text-xl font-bold">Perfect For:</h3>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>🚀 New token launches looking for visibility</li>
                    <li>📊 Trading tools and platforms</li>
                    <li>💼 Web3 services targeting active traders</li>
                    <li>🎯 Projects wanting to reach decision-makers at point of purchase</li>
                  </ul>
                </div>
              </div>
              <div className="pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  <strong>Prime banner placement</strong> appears on every holder analysis page.
                  Users spend 30-60 seconds reviewing reports - perfect for brand awareness and clicks.
                </p>
                <Button 
                  onClick={() => navigate("/contact-us")}
                  variant="default"
                  size="lg"
                  className="w-full"
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Get Banner Space →
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Additional Details */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-2xl">Advertising Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <h4 className="font-semibold text-lg">📍 Placement</h4>
                <p className="text-muted-foreground text-sm">
                  Top banner on all holder analysis pages. Guaranteed visibility on every token lookup.
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-lg">👥 Audience</h4>
                <p className="text-muted-foreground text-sm">
                  Active Solana traders researching tokens before buying - highly engaged and decision-ready.
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-lg">📊 Analytics</h4>
                <p className="text-muted-foreground text-sm">
                  Full transparency with impression counts, click-through rates, and conversion tracking.
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-lg">💰 Pricing</h4>
                <p className="text-muted-foreground text-sm">
                  Flexible options: daily, weekly, or monthly campaigns. Contact us for custom packages.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CTA */}
        <div className="text-center space-y-4 pb-8">
          <Button 
            onClick={() => navigate("/contact-us")}
            size="lg"
            className="text-lg px-8 py-6"
          >
            <DollarSign className="w-5 h-5 mr-2" />
            Contact Us About Advertising
          </Button>
          <p className="text-sm text-muted-foreground">
            Quick response • Custom packages available • Professional support
          </p>
        </div>
      </div>
    </div>
  );
}
