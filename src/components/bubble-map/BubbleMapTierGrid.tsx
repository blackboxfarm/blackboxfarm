import React from "react";
import { BUBBLE_MAP_TIERS, BUBBLE_MAP_FEATURES } from "@/config/bubbleMapTiers";
import { Check, X, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface BubbleMapTierGridProps {
  compact?: boolean;
}

export function BubbleMapTierGrid({ compact = false }: BubbleMapTierGridProps) {
  const navigate = useNavigate();

  const renderCell = (value: boolean | string) => {
    if (value === true) return <Check className="h-3.5 w-3.5 text-green-400 mx-auto" />;
    if (value === false) return <X className="h-3.5 w-3.5 text-muted-foreground/40 mx-auto" />;
    return <span className="text-[11px] font-medium text-foreground">{value}</span>;
  };

  const features = compact ? BUBBLE_MAP_FEATURES.slice(0, 6) : BUBBLE_MAP_FEATURES;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Feature</th>
              {BUBBLE_MAP_TIERS.map(tier => (
                <th key={tier.key} className={`text-center py-2 px-2 font-semibold ${tier.color}`}>
                  {tier.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((feature, i) => (
              <tr key={i} className="border-b border-border/20">
                <td className="py-2 pr-4">
                  <div className="font-medium text-foreground text-[11px]">{feature.label}</div>
                  {!compact && (
                    <div className="text-[10px] text-muted-foreground">{feature.description}</div>
                  )}
                </td>
                {BUBBLE_MAP_TIERS.map(tier => (
                  <td key={tier.key} className="text-center py-2 px-2">
                    {renderCell(feature.tiers[tier.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground leading-relaxed max-w-md">
          Free accounts get 2 lookups/day with basic graph view. Pro subscribers ($9.99/mo) unlock unlimited searches, 
          KYC tracing, deep spidering, token discovery, and data export.
        </p>
        <Button size="sm" className="text-xs h-7 gap-1" onClick={() => navigate('/subscriptions')}>
          <Crown className="h-3 w-3" /> Upgrade
        </Button>
      </div>
    </div>
  );
}
