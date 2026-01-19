import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { FarmBanner } from "@/components/FarmBanner";
import { 
  BookOpen, 
  Code2, 
  Terminal,
  FileCode,
  Clock,
  Mail,
  ExternalLink,
  Layers,
  Braces
} from "lucide-react";

export default function ApiDocsLanding() {
  const docSections = [
    {
      icon: <Terminal className="w-5 h-5" />,
      title: "Getting Started",
      description: "Quick start guide, authentication setup, and your first API call."
    },
    {
      icon: <Braces className="w-5 h-5" />,
      title: "API Reference",
      description: "Complete endpoint documentation with request/response schemas."
    },
    {
      icon: <FileCode className="w-5 h-5" />,
      title: "Code Examples",
      description: "Sample code in JavaScript, Python, Rust, and more."
    },
    {
      icon: <Layers className="w-5 h-5" />,
      title: "SDKs & Libraries",
      description: "Official client libraries for easy integration."
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
            <BookOpen className="w-12 h-12 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary via-accent to-primary/60 bg-clip-text text-transparent">
              API Documentation
            </h1>
          </div>
          
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Comprehensive documentation for integrating BlackBox Farm APIs into your projects.
          </p>
        </div>

        {/* Coming Soon Notice */}
        <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-2 text-amber-400">
                <Clock className="w-5 h-5" />
                <span className="font-semibold">Documentation Coming Soon</span>
              </div>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Our API documentation portal at <code className="text-primary">docs.blackbox.farm</code> is 
                being developed alongside our API infrastructure. Sign up to be notified when it launches.
              </p>
              <div className="pt-2">
                <Button asChild>
                  <Link to="/contact">
                    <Mail className="w-4 h-4 mr-2" />
                    Get Notified
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Planned Documentation */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-center">What to Expect</h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            {docSections.map((section, index) => (
              <Card key={index} className="border-border/50">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      {section.icon}
                    </div>
                    <CardTitle className="text-lg">{section.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{section.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Documentation Preview */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code2 className="w-5 h-5" />
              Documentation Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4 font-mono text-sm overflow-auto">
              <div className="text-muted-foreground mb-2"># Example: Get Token Holders</div>
              <div className="text-primary">GET</div> <span className="text-muted-foreground">/api/v1/tokens/</span><span className="text-amber-400">{"{mint}"}</span><span className="text-muted-foreground">/holders</span>
              <div className="mt-4 text-muted-foreground">
                <div># Response</div>
                <pre className="text-xs mt-2 text-foreground/80">{`{
  "token": {
    "mint": "...",
    "symbol": "TOKEN",
    "totalHolders": 1234
  },
  "holders": [
    {
      "address": "...",
      "balance": 1000000,
      "percentage": 5.2
    }
  ]
}`}</pre>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subdomain Info */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <ExternalLink className="w-8 h-8 text-primary flex-shrink-0" />
                <div>
                  <h3 className="font-bold mb-2">docs.blackbox.farm</h3>
                  <p className="text-sm text-muted-foreground">
                    Interactive API documentation with live examples, request builders, and response schemas.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <ExternalLink className="w-8 h-8 text-primary flex-shrink-0" />
                <div>
                  <h3 className="font-bold mb-2">api.blackbox.farm</h3>
                  <p className="text-sm text-muted-foreground">
                    Production API endpoint. All API calls will be made to this subdomain.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* CTA */}
        <div className="text-center space-y-4 pb-8">
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg">
              <Link to="/api">
                Learn About Our API
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/contact">
                Request Early Access
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
