import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Zap, Shield, Rocket } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  nickname: string;
  description: string;
  icon: React.ComponentType<any>;
  badge: string;
  strategy: string;
  params: {
    buyAmount: string;
    buyInterval: number;
    maxSlippage: number;
    sellTrigger: string;
  };
}

const templates: Template[] = [
  {
    id: 'moon-shot',
    name: 'Moon Shot',
    nickname: '🚀 MOON',
    description: 'Aggressive momentum play for high-potential tokens',
    icon: Rocket,
    badge: 'High Risk',
    strategy: 'Fast volume build with 3x sell trigger',
    params: {
      buyAmount: '0.05',
      buyInterval: 15,
      maxSlippage: 8,
      sellTrigger: '3x'
    }
  },
  {
    id: 'steady-eddie',
    name: 'Steady Eddie',
    nickname: '📈 STEADY',
    description: 'Conservative approach for stable tokens',
    icon: TrendingUp,
    badge: 'Low Risk',
    strategy: 'Gradual accumulation with 1.5x sell trigger',
    params: {
      buyAmount: '0.025',
      buyInterval: 45,
      maxSlippage: 3,
      sellTrigger: '1.5x'
    }
  },
  {
    id: 'flash-pump',
    name: 'Flash Pump',
    nickname: '⚡ FLASH',
    description: 'Quick burst for maximum impact',
    icon: Zap,
    badge: 'Medium Risk',
    strategy: 'Rapid-fire trades with 2x sell trigger',
    params: {
      buyAmount: '0.1',
      buyInterval: 8,
      maxSlippage: 12,
      sellTrigger: '2x'
    }
  },
  {
    id: 'diamond-hands',
    name: 'Diamond Hands',
    nickname: '💎 DIAMOND',
    description: 'Long-term hold strategy',
    icon: Shield,
    badge: 'Ultra Low Risk',
    strategy: 'Patient accumulation, no automatic sell',
    params: {
      buyAmount: '0.02',
      buyInterval: 120,
      maxSlippage: 2,
      sellTrigger: 'manual'
    }
  }
];

interface CampaignTemplatesProps {
  onSelectTemplate: (template: Template) => void;
}

export function CampaignTemplates({ onSelectTemplate }: CampaignTemplatesProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Campaign Templates</h3>
        <p className="text-sm text-muted-foreground">
          Quick-start templates for common strategies
        </p>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2">
        {templates.map((template) => {
          const IconComponent = template.icon;
          return (
            <Card key={template.id} className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <IconComponent className="h-8 w-8 text-primary" />
                    <div>
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <div className="text-sm font-mono text-muted-foreground">
                        {template.nickname}
                      </div>
                    </div>
                  </div>
                  <Badge variant={
                    template.badge.includes('High') ? 'destructive' :
                    template.badge.includes('Medium') ? 'secondary' :
                    'default'
                  }>
                    {template.badge}
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-3">
                <CardDescription>{template.description}</CardDescription>
                
                <div className="text-xs text-muted-foreground">
                  <strong>Strategy:</strong> {template.strategy}
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Buy:</span> {template.params.buyAmount} SOL
                  </div>
                  <div>
                    <span className="text-muted-foreground">Interval:</span> {template.params.buyInterval}s
                  </div>
                  <div>
                    <span className="text-muted-foreground">Slippage:</span> {template.params.maxSlippage}%
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sell:</span> {template.params.sellTrigger}
                  </div>
                </div>
                
                <Button 
                  className="w-full" 
                  size="sm"
                  onClick={() => onSelectTemplate(template)}
                >
                  Use Template
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}