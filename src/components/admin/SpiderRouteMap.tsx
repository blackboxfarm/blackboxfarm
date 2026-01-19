import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Copy, Check, Globe, Lock, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RouteInfo {
  path: string;
  label: string;
  category: "public" | "admin" | "legal" | "marketing" | "dynamic";
  description?: string;
}

// All routes from App.tsx
const ALL_ROUTES: RouteInfo[] = [
  // Public/Main
  { path: "/", label: "Home (BlackBox)", category: "public", description: "Main landing page" },
  { path: "/auth", label: "Auth", category: "public", description: "Login/signup page" },
  { path: "/holders", label: "Holders Report", category: "public", description: "Token holder analysis" },
  { path: "/holders-marketing", label: "Holders Marketing", category: "marketing", description: "Marketing page for holder reports" },
  { path: "/holders-info", label: "Holders Landing", category: "marketing", description: "Holders tool info page" },
  { path: "/blackbox", label: "BlackBox", category: "public", description: "Alternative landing" },
  { path: "/demo", label: "Demo", category: "public", description: "Demo page" },
  { path: "/share-card-demo", label: "Share Card Demo", category: "public", description: "Social share card generator" },
  { path: "/token-analysis", label: "Token Analysis", category: "public", description: "Token analysis download" },
  
  // Apps & Services
  { path: "/bumpbot", label: "BumpBot Landing", category: "marketing", description: "Token bumping service (PENDING)" },
  { path: "/volumebot", label: "Volume Bot Landing", category: "marketing", description: "Trading volume service (PENDING)" },
  { path: "/holders-bot", label: "Holders Bot", category: "marketing", description: "TG holder analysis bot (In Dev)" },
  { path: "/security", label: "Security", category: "legal", description: "Platform security info" },
  
  // API & Docs
  { path: "/api", label: "API", category: "public", description: "API overview (In Dev)" },
  { path: "/api-docs", label: "API Docs", category: "public", description: "API documentation (In Dev)" },
  
  // Advertising
  { path: "/buy-banner", label: "Buy Banner", category: "marketing", description: "Banner ad purchase" },
  { path: "/banner-checkout/:orderId", label: "Banner Checkout", category: "dynamic", description: "Checkout flow" },
  { path: "/banner-preview/:orderId", label: "Banner Preview", category: "dynamic", description: "Preview banner before purchase" },
  { path: "/adverts", label: "Adverts", category: "marketing", description: "Advertising info" },
  
  // Tools
  { path: "/copy-trading", label: "Copy Trading", category: "public", description: "Copy trading tool" },
  { path: "/breadcrumbs", label: "BreadCrumbs", category: "public", description: "Wallet tracking" },
  { path: "/helius-usage", label: "Helius Usage", category: "admin", description: "API usage stats" },
  { path: "/competitive-analysis", label: "Competitive Analysis", category: "public", description: "Token competition analysis" },
  { path: "/community-wallet", label: "Community Wallet", category: "public", description: "Community funding" },
  
  // Admin
  { path: "/admin", label: "Admin (Index)", category: "admin", description: "Old admin page" },
  { path: "/super-admin", label: "Super Admin", category: "admin", description: "Main admin dashboard" },
  { path: "/developer/:walletAddress", label: "Developer Profile", category: "dynamic", description: "Dev wallet analysis" },
  
  // Auth
  { path: "/reset-password", label: "Reset Password", category: "public", description: "Password reset" },
  
  // Legal
  { path: "/terms", label: "Terms of Service", category: "legal", description: "Terms page" },
  { path: "/tos", label: "TOS", category: "legal", description: "Terms of service" },
  { path: "/privacy", label: "Privacy Policy", category: "legal", description: "Privacy policy" },
  { path: "/policy", label: "Policy", category: "legal", description: "Privacy policy alt" },
  { path: "/whitepaper", label: "Whitepaper", category: "legal", description: "Project whitepaper" },
  { path: "/cookies", label: "Cookies Policy", category: "legal", description: "Cookie policy" },
  { path: "/email-abuse", label: "Email Abuse", category: "legal", description: "Email abuse policy" },
  { path: "/about", label: "About Us", category: "legal", description: "About page" },
  { path: "/contact", label: "Contact Us", category: "legal", description: "Contact page" },
  { path: "/web3-manifesto", label: "Web3 Manifesto", category: "legal", description: "Web3 manifesto" },
  
  // BumpBot
  { path: "/bb", label: "BumpBot", category: "public", description: "Bump bot tool" },
];

const CATEGORY_CONFIG = {
  public: { color: "bg-green-500/20 text-green-400 border-green-500/30", icon: Globe, label: "Public" },
  admin: { color: "bg-red-500/20 text-red-400 border-red-500/30", icon: Shield, label: "Admin" },
  legal: { color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Lock, label: "Legal" },
  marketing: { color: "bg-purple-500/20 text-purple-400 border-purple-500/30", icon: Globe, label: "Marketing" },
  dynamic: { color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: Globe, label: "Dynamic" },
};

export function SpiderRouteMap() {
  const { toast } = useToast();
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const baseUrl = "https://blackbox.farm";

  const copyToClipboard = async (path: string) => {
    const fullUrl = `${baseUrl}${path}`;
    await navigator.clipboard.writeText(fullUrl);
    setCopiedPath(path);
    toast({ title: "Copied!", description: fullUrl });
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const openInNewTab = (path: string) => {
    const fullUrl = `${baseUrl}${path}`;
    window.open(fullUrl, "_blank");
  };

  const filteredRoutes = filter === "all" 
    ? ALL_ROUTES 
    : ALL_ROUTES.filter(r => r.category === filter);

  const categoryCounts = ALL_ROUTES.reduce((acc, route) => {
    acc[route.category] = (acc[route.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🕷️ Spider Route Map
            <Badge variant="outline" className="ml-2">{ALL_ROUTES.length} Routes</Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            All exposed routes - click to open in new tab, copy for testing in incognito
          </p>
        </CardHeader>
        <CardContent>
          {/* Filter buttons */}
          <div className="flex flex-wrap gap-2 mb-6">
            <Button 
              size="sm" 
              variant={filter === "all" ? "default" : "outline"}
              onClick={() => setFilter("all")}
            >
              All ({ALL_ROUTES.length})
            </Button>
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
              <Button 
                key={key}
                size="sm" 
                variant={filter === key ? "default" : "outline"}
                onClick={() => setFilter(key)}
                className={filter === key ? "" : config.color}
              >
                {config.label} ({categoryCounts[key] || 0})
              </Button>
            ))}
          </div>

          {/* Routes grid */}
          <div className="grid gap-2">
            {filteredRoutes.map((route) => {
              const config = CATEGORY_CONFIG[route.category];
              const Icon = config.icon;
              const isCopied = copiedPath === route.path;
              
              return (
                <div 
                  key={route.path}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-muted/30 transition-all group"
                >
                  <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  
                  <Badge variant="outline" className={`${config.color} text-xs flex-shrink-0`}>
                    {config.label}
                  </Badge>
                  
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => openInNewTab(route.path)}
                      className="text-left hover:text-primary transition-colors"
                    >
                      <code className="text-sm font-mono text-primary">{route.path}</code>
                    </button>
                    <p className="text-xs text-muted-foreground truncate">
                      {route.label} - {route.description}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(route.path)}
                      className="h-8 w-8 p-0"
                    >
                      {isCopied ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openInNewTab(route.path)}
                      className="h-8 w-8 p-0"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick Copy All */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Copy - All Public URLs</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-48">
            {ALL_ROUTES.filter(r => r.category === "public" || r.category === "marketing" || r.category === "legal")
              .map(r => `${baseUrl}${r.path}`)
              .join("\n")}
          </pre>
          <Button 
            className="mt-3"
            onClick={async () => {
              const urls = ALL_ROUTES
                .filter(r => r.category === "public" || r.category === "marketing" || r.category === "legal")
                .map(r => `${baseUrl}${r.path}`)
                .join("\n");
              await navigator.clipboard.writeText(urls);
              toast({ title: "Copied all public URLs!" });
            }}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy All Public URLs
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
