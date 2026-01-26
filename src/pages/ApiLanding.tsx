import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { FarmBanner } from "@/components/FarmBanner";
import { 
  Zap, 
  Code, 
  Shield, 
  Globe,
  Server,
  Database,
  ArrowRight,
  Clock,
  Mail
} from "lucide-react";
import { usePageTracking } from "@/hooks/usePageTracking";

export default function ApiLanding() {
  usePageTracking('api');
  
  const apiServices = [
    {
      icon: <Database className="w-6 h-6" />,
      title: "Token Metadata API",
      description: "Real-time token data, holder counts, liquidity info, and market metrics for any Solana token.",
      status: "planned"
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: "Holder Analysis API",
      description: "Comprehensive wallet distribution analysis, whale detection, and holder behavior insights.",
      status: "planned"
    },
    {
      icon: <Server className="w-6 h-6" />,
      title: "BumpBot API",
      description: "Programmatic access to our token bumping service for automated marketing campaigns.",
      status: "planned"
    },
    {
      icon: <Globe className="w-6 h-6" />,
      title: "Volume Bot API",
      description: "Integrate trading volume generation into your own applications and platforms.",
      status: "planned"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <FarmBanner />
      
      <div className="container mx-auto py-8 px-4 max-w-6xl space-y-12">
        {/* Header */}
        <div className="text-center space-y-6">
          <Badge variant="outline" className="border-amber-500/50 text-amber-400 px-4 py-1">
            <Clock className="w-3 h-3 mr-2 inline" />
            In Development
          </Badge>
          
          <div className="flex items-center justify-center gap-3">
            <Code className="w-12 h-12 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary via-accent to-primary/60 bg-clip-text text-transparent">
              BlackBox API
            </h1>
          </div>
          
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Powerful APIs to integrate BlackBox Farm's tools directly into your applications, 
            bots, and trading platforms.
          </p>
        </div>

        {/* Coming Soon Notice */}
        <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-2 text-amber-400">
                <Clock className="w-5 h-5" />
                <span className="font-semibold">API Access Coming Soon</span>
              </div>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                We're building out our API infrastructure to give developers programmatic access to 
                all of BlackBox Farm's powerful tools. Join the waitlist to be notified when we launch.
              </p>
              <div className="pt-2">
                <Button asChild>
                  <Link to="/contact">
                    <Mail className="w-4 h-4 mr-2" />
                    Join API Waitlist
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Planned API Services */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-center">Planned API Services</h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            {apiServices.map((service, index) => (
              <Card key={index} className="border-border/50 hover:border-primary/30 transition-colors">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      {service.icon}
                    </div>
                    <CardTitle className="text-lg">{service.title}</CardTitle>
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      Planned
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{service.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Future Architecture */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              API Architecture Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                <h4 className="font-semibold mb-2">api.blackbox.farm</h4>
                <p className="text-sm text-muted-foreground">
                  REST API endpoints for all services with comprehensive rate limiting and authentication.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                <h4 className="font-semibold mb-2">dev.blackbox.farm</h4>
                <p className="text-sm text-muted-foreground">
                  Developer portal with API keys, usage dashboards, and integration guides.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                <h4 className="font-semibold mb-2">docs.blackbox.farm</h4>
                <p className="text-sm text-muted-foreground">
                  Complete API documentation, SDKs, and code examples for all supported languages.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card className="border-green-500/20 bg-gradient-to-br from-green-500/5 to-transparent">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <Shield className="w-10 h-10 text-green-400 flex-shrink-0" />
              <div>
                <h3 className="text-xl font-bold mb-2">Enterprise-Grade Security</h3>
                <p className="text-muted-foreground">
                  All API access will be secured with API keys, OAuth2 authentication, rate limiting, 
                  and full audit logging. Your integrations will be protected by the same security 
                  standards we use for our own platform.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CTA */}
        <div className="text-center space-y-4 pb-8">
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg">
              <Link to="/api-docs">
                View API Docs
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/contact">
                Contact for Early Access
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
