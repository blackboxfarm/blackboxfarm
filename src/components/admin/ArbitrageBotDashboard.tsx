import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfigurationTab } from "./arb/ConfigurationTab";
import { BalancesTab } from "./arb/BalancesTab";
import { OpportunitiesTab } from "./arb/OpportunitiesTab";
import { ExecutionsTab } from "./arb/ExecutionsTab";
import { AnalyticsTab } from "./arb/AnalyticsTab";

export const ArbitrageBotDashboard = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">ETH/BASE Arbitrage Bot</h2>
        <p className="text-muted-foreground">
          Automated arbitrage trading between Ethereum Mainnet and Base L2
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <div className="space-y-2">
            <p className="font-semibold">Required API Keys & Setup:</p>
            <ul className="space-y-2 ml-4">
              <li className="flex items-center gap-2">
                <strong>ETH_RPC_URL & BASE_RPC_URL:</strong>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => window.open("https://www.alchemy.com/", "_blank")}
                >
                  Alchemy <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
                <span className="text-muted-foreground">or</span>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => window.open("https://www.infura.io/", "_blank")}
                >
                  Infura <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
                <span className="text-muted-foreground">or</span>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => window.open("https://www.quicknode.com/", "_blank")}
                >
                  QuickNode <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </li>
              <li className="flex items-center gap-2">
                <strong>ZERO_X_API_KEY:</strong>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => window.open("https://0x.org/docs/0x-swap-api/introduction", "_blank")}
                >
                  0x API Documentation <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </li>
              <li>
                <strong>ARB_WALLET_PRIVATE_KEY:</strong> Generate a new wallet using MetaMask or any Ethereum wallet
              </li>
            </ul>
            <p className="text-sm text-muted-foreground mt-2">
              After obtaining these credentials, add them via Settings → Secrets in your Supabase dashboard.
            </p>
          </div>
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="configuration" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
          <TabsTrigger value="executions">Executions</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="configuration" className="space-y-4">
          <ConfigurationTab />
        </TabsContent>

        <TabsContent value="balances" className="space-y-4">
          <BalancesTab />
        </TabsContent>

        <TabsContent value="opportunities" className="space-y-4">
          <OpportunitiesTab />
        </TabsContent>

        <TabsContent value="executions" className="space-y-4">
          <ExecutionsTab />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <AnalyticsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};
