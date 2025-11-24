import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface LoopDiagramProps {
  loopType: "A" | "B" | "C";
  ethMainnetPrice?: number;
  ethBasePrice?: number;
  baseTokenPrice?: number;
}

export const LoopDiagram = ({ 
  loopType, 
  ethMainnetPrice = 2837.72, 
  ethBasePrice = 2837.72,
  baseTokenPrice = 1.00 
}: LoopDiagramProps) => {
  const getLoopInfo = () => {
    switch (loopType) {
      case "A":
        return {
          title: "Loop A: ETH Mainnet → Base → ETH Mainnet",
          description: "Buy ETH on Mainnet, bridge to Base, swap if profitable, bridge back",
          diagram: `graph LR
    A[💵 Start: $1,000 USD] --> B[🔷 Buy ETH on Mainnet<br/>≈ 0.352 ETH @ $${ethMainnetPrice}]
    B --> C[🌉 Bridge to Base<br/>Fee: ~0.5%<br/>≈ 0.350 ETH]
    C --> D{Is BASE/ETH<br/>profitable?}
    D -->|Yes| E[🔄 Swap to BASE<br/>≈ ${(350 * baseTokenPrice).toFixed(0)} BASE]
    D -->|No| F[⏸️ Hold ETH on Base]
    E --> G[🌉 Bridge back to Mainnet<br/>Fee: ~0.5%]
    G --> H[🔷 Swap to ETH<br/>Final: ≈ 0.355 ETH]
    H --> I[✅ End: $${((0.355 * ethMainnetPrice)).toFixed(2)} USD]
    F --> J[⏳ Wait for better spread]
    
    style A fill:#e3f2fd
    style I fill:#c8e6c9
    style D fill:#fff3e0
    style J fill:#ffecb3`,
          enabled: true,
        };
      case "B":
        return {
          title: "Loop B: BASE Token Arbitrage",
          description: "Trade BASE token between chains when price differences exist",
          diagram: `graph LR
    A[💵 Start: $1,000 USD] --> B[🔷 Buy BASE on Base<br/>≈ ${(1000 / baseTokenPrice).toFixed(0)} BASE @ $${baseTokenPrice}]
    B --> C{Is price<br/>better on<br/>Mainnet?}
    C -->|Yes| D[🌉 Bridge to Mainnet<br/>Fee: ~0.5%]
    D --> E[🔄 Sell BASE for ETH<br/>Get ≈ 0.350 ETH]
    E --> F[🌉 Bridge ETH to Base]
    F --> G[✅ End: $${(1000 * 1.02).toFixed(2)} USD]
    C -->|No| H[⏳ Wait for arbitrage opportunity]
    
    style A fill:#e3f2fd
    style G fill:#c8e6c9
    style C fill:#fff3e0
    style H fill:#ffecb3`,
          enabled: true,
        };
      case "C":
        return {
          title: "Loop C: Three-Way Arbitrage",
          description: "Complex multi-hop arbitrage across ETH, BASE, and stablecoins",
          diagram: `graph LR
    A[💵 Start: $1,000 USDC] --> B[🔷 Buy ETH on Mainnet<br/>≈ 0.352 ETH]
    B --> C[🌉 Bridge to Base]
    C --> D[🔄 Swap ETH → BASE<br/>≈ 350 BASE]
    D --> E[🔄 Swap BASE → USDC<br/>≈ $1,015 USDC]
    E --> F{Profit > 1%?}
    F -->|Yes| G[🌉 Bridge USDC to Mainnet]
    G --> H[✅ End: $${(1000 * 1.015).toFixed(2)} USDC]
    F -->|No| I[⏸️ Hold & wait]
    
    style A fill:#e3f2fd
    style H fill:#c8e6c9
    style F fill:#fff3e0
    style I fill:#ffecb3`,
          enabled: false,
        };
    }
  };

  const loopInfo = getLoopInfo();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{loopInfo.title}</CardTitle>
          <Badge variant={loopInfo.enabled ? "default" : "secondary"}>
            {loopInfo.enabled ? "Enabled" : "Coming Soon"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{loopInfo.description}</p>
      </CardHeader>
      <CardContent>
        <div className="bg-background/50 rounded-lg p-4 overflow-x-auto">
          <pre className="text-xs whitespace-pre">{loopInfo.diagram}</pre>
        </div>
      </CardContent>
    </Card>
  );
};
