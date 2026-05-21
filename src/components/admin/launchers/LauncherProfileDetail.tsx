import type { LauncherProfile } from "@/hooks/useLauncherProfiles";
import { invokeSpider } from "@/hooks/useLauncherProfiles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LauncherTradeRulesForm } from "./LauncherTradeRulesForm";
import { LauncherMintTimeline } from "./LauncherMintTimeline";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { RefreshCw } from "lucide-react";

export function LauncherProfileDetail({ profile }: { profile: LauncherProfile }) {
  const [respidering, setRespidering] = useState(false);
  const qc = useQueryClient();

  async function respider() {
    setRespidering(true);
    try {
      await invokeSpider({ profileId: profile.id, xHandle: profile.x_handle || undefined, devWallet: profile.primary_dev_wallet || undefined });
      qc.invalidateQueries({ queryKey: ["launcher-profiles"] });
      toast({ title: "Re-spidered" });
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally { setRespidering(false); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {profile.x_handle ? `@${profile.x_handle}` : profile.name}
            <span className="ml-2 text-xs text-muted-foreground font-normal">{profile.linked_wallets.length} wallets</span>
          </CardTitle>
          <Button variant="outline" size="sm" onClick={respider} disabled={respidering}>
            <RefreshCw className={`h-3 w-3 mr-1 ${respidering ? "animate-spin" : ""}`} /> Re-spider
          </Button>
        </CardHeader>
        <CardContent>
          <div className="text-xs space-y-1">
            <div><span className="text-muted-foreground">Primary dev:</span> <span className="font-mono">{profile.primary_dev_wallet || "—"}</span></div>
            {profile.kyc_root_wallet && <div><span className="text-muted-foreground">KYC root:</span> <span className="font-mono">{profile.kyc_root_wallet}</span></div>}
            <div className="text-muted-foreground">Last spidered: {profile.last_spidered_at ? new Date(profile.last_spidered_at).toLocaleString() : "never"}</div>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted-foreground">Linked wallets (ranked by recent activity)</summary>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1 max-h-64 overflow-y-auto text-[11px] font-mono">
              {profile.linked_wallets.map((w, i) => (
                <div key={w} className="px-2 py-1 rounded bg-muted/40">
                  <span className="text-muted-foreground mr-2">#{i + 1}</span>{w}
                </div>
              ))}
            </div>
          </details>
        </CardContent>
      </Card>

      <LauncherTradeRulesForm profileId={profile.id} />
      <LauncherMintTimeline profileId={profile.id} />
    </div>
  );
}