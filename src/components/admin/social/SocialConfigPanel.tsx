import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw, CheckCircle, XCircle, ExternalLink } from "lucide-react";

interface PlatformConfig {
  name: string;
  icon: string;
  color: string;
  functionName: string;
  secrets: string[];
  docsUrl: string;
  notes: string;
}

const PLATFORMS: PlatformConfig[] = [
  {
    name: "Threads",
    icon: "🧵",
    color: "bg-purple-500/20 text-purple-300",
    functionName: "post-to-threads",
    secrets: ["THREADS_ACCESS_TOKEN", "THREADS_USER_ID"],
    docsUrl: "https://developers.facebook.com/docs/threads",
    notes: "Meta Graph API. Token from Meta Developer Console → Threads API.",
  },
  {
    name: "Instagram",
    icon: "📸",
    color: "bg-pink-500/20 text-pink-300",
    functionName: "post-to-instagram",
    secrets: ["INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_USER_ID"],
    docsUrl: "https://developers.facebook.com/docs/instagram-api",
    notes: "Requires Facebook Page linked to IG Business account. Image-only posts.",
  },
  {
    name: "Facebook",
    icon: "📘",
    color: "bg-blue-500/20 text-blue-300",
    functionName: "post-to-facebook",
    secrets: ["FACEBOOK_PAGE_ACCESS_TOKEN", "FACEBOOK_PAGE_ID"],
    docsUrl: "https://developers.facebook.com/docs/pages-api",
    notes: "Page Access Token with pages_manage_posts permission.",
  },
  {
    name: "Twitter / X",
    icon: "🐦",
    color: "bg-sky-500/20 text-sky-300",
    functionName: "post-share-card-twitter",
    secrets: ["TWITTER_CONSUMER_KEY", "TWITTER_CONSUMER_SECRET", "TWITTER_ACCESS_TOKEN", "TWITTER_ACCESS_TOKEN_SECRET"],
    docsUrl: "https://developer.x.com/en/docs/x-api",
    notes: "OAuth 1.0a. Needs Read+Write permissions. New account TBD.",
  },
  {
    name: "TikTok",
    icon: "🎵",
    color: "bg-rose-500/20 text-rose-300",
    functionName: "",
    secrets: ["TIKTOK_ACCESS_TOKEN", "TIKTOK_OPEN_ID"],
    docsUrl: "https://developers.tiktok.com/doc/content-posting-api-get-started",
    notes: "Content Posting API. Requires approved TikTok developer app. Video upload only.",
  },
];

export function SocialConfigPanel() {
  const [checking, setChecking] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, { connected: boolean; profile?: any }>>({});

  const checkConnection = async (platform: PlatformConfig) => {
    if (!platform.functionName) {
      toast.info(`${platform.name} edge function not yet created`);
      return;
    }
    setChecking(platform.name);
    try {
      const { data, error } = await supabase.functions.invoke(platform.functionName, {
        body: { action: "get_profile" },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      setStatuses((prev) => ({ ...prev, [platform.name]: { connected: true, profile: data.profile } }));
      toast.success(`${platform.name} connected!`);
    } catch (err: any) {
      setStatuses((prev) => ({ ...prev, [platform.name]: { connected: false } }));
      toast.error(`${platform.name}: ${err.message}`);
    } finally {
      setChecking(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>🔧 Social Platform Config</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Each platform requires API secrets set in{" "}
          <a
            href="https://supabase.com/dashboard/project/apxauapuusmgwbbzjgfl/settings/functions"
            target="_blank"
            rel="noopener"
            className="underline text-primary"
          >
            Edge Function Secrets
          </a>
        </p>

        {PLATFORMS.map((platform) => {
          const status = statuses[platform.name];
          return (
            <div key={platform.name} className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{platform.icon}</span>
                  <span className="font-semibold">{platform.name}</span>
                  {status && (
                    status.connected ? (
                      <Badge className="bg-green-500/20 text-green-300">
                        <CheckCircle className="h-3 w-3 mr-1" /> Connected
                      </Badge>
                    ) : (
                      <Badge className="bg-red-500/20 text-red-300">
                        <XCircle className="h-3 w-3 mr-1" /> Not Connected
                      </Badge>
                    )
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => checkConnection(platform)}
                    disabled={checking === platform.name}
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${checking === platform.name ? 'animate-spin' : ''}`} />
                    Test
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <a href={platform.docsUrl} target="_blank" rel="noopener">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                <p>{platform.notes}</p>
                <p className="mt-1">
                  <span className="font-medium">Required secrets:</span>{" "}
                  {platform.secrets.map((s) => (
                    <code key={s} className="bg-muted px-1 rounded mr-1">{s}</code>
                  ))}
                </p>
              </div>

              {status?.connected && status.profile && (
                <div className="text-xs bg-muted/30 rounded p-2">
                  <pre className="whitespace-pre-wrap">{JSON.stringify(status.profile, null, 2)}</pre>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
