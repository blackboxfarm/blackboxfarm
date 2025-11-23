import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

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

      <Tabs defaultValue="config" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
          <TabsTrigger value="executions">Executions</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Bot Configuration</h3>
            <p className="text-muted-foreground">
              Configure trading parameters, profit thresholds, and risk management settings.
            </p>
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                Configuration interface coming soon...
              </p>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="balances" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Balance Tracking</h3>
            <p className="text-muted-foreground">
              Monitor ETH and BASE token balances across both chains.
            </p>
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                Balance monitoring interface coming soon...
              </p>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="opportunities" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Arbitrage Opportunities</h3>
            <p className="text-muted-foreground">
              View detected arbitrage opportunities and their profitability analysis.
            </p>
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                Opportunities scanner coming soon...
              </p>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="executions" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Loop Executions</h3>
            <p className="text-muted-foreground">
              Track executed arbitrage loops and their performance.
            </p>
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                Execution history coming soon...
              </p>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Analytics & Performance</h3>
            <p className="text-muted-foreground">
              View daily statistics, profit/loss reports, and system health metrics.
            </p>
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                Analytics dashboard coming soon...
              </p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
