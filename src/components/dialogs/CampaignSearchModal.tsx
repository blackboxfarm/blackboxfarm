import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Search, Users, Clock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Campaign {
  id: string;
  title: string;
  description?: string;
  token_address: string;
  funding_goal_sol: number;
  current_funding_sol: number;
  target_deadline: string;
  status: string;
  contributor_count: number;
}

interface CampaignSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaigns: Campaign[];
  onSelectCampaign: (campaign: Campaign) => void;
}

export function CampaignSearchModal({ 
  isOpen, 
  onClose, 
  campaigns, 
  onSelectCampaign 
}: CampaignSearchModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredCampaigns, setFilteredCampaigns] = useState<Campaign[]>([]);

  const searchableCampaigns = useMemo(() => {
    return campaigns.filter(campaign => 
      campaign.status === 'funding' || campaign.status === 'funded'
    );
  }, [campaigns]);

  useEffect(() => {
    if (searchTerm.length < 3) {
      setFilteredCampaigns([]);
      return;
    }

    const filtered = searchableCampaigns.filter(campaign =>
      campaign.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (campaign.description && campaign.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
      campaign.token_address.toLowerCase().includes(searchTerm.toLowerCase())
    );

    setFilteredCampaigns(filtered);
  }, [searchTerm, searchableCampaigns]);

  const getFundingProgress = (current: number, goal: number) => {
    return Math.min((current / goal) * 100, 100);
  };

  const formatTimeRemaining = (deadline: string) => {
    const now = new Date();
    const end = new Date(deadline);
    const diff = end.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      funding: { label: 'Funding', variant: 'default' as const },
      funded: { label: 'Funded', variant: 'secondary' as const },
      executing: { label: 'Executing', variant: 'outline' as const },
      completed: { label: 'Completed', variant: 'default' as const }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.funding;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const handleCampaignSelect = (campaign: Campaign) => {
    onSelectCampaign(campaign);
    onClose();
    setSearchTerm('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Search Community Campaigns
          </DialogTitle>
          <DialogDescription>
            Find active campaigns to join or contribute to
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 flex-1 overflow-hidden">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by campaign name, description, or token address (min 3 characters)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>
          
          {searchTerm.length > 0 && searchTerm.length < 3 && (
            <div className="text-center text-muted-foreground py-8">
              Type at least 3 characters to search campaigns
            </div>
          )}
          
          {searchTerm.length >= 3 && filteredCampaigns.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              No campaigns found matching "{searchTerm}"
            </div>
          )}
          
          {filteredCampaigns.length > 0 && (
            <div className="space-y-3 overflow-y-auto max-h-96">
              {filteredCampaigns.map((campaign) => (
                <Card 
                  key={campaign.id} 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => handleCampaignSelect(campaign)}
                >
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1 flex-1">
                          <h4 className="font-medium text-sm">{campaign.title}</h4>
                          <div className="text-xs text-muted-foreground">
                            {campaign.token_address.slice(0, 8)}...{campaign.token_address.slice(-4)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(campaign.status)}
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </div>
                      
                      {campaign.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {campaign.description}
                        </p>
                      )}
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span>Progress</span>
                          <span>{campaign.current_funding_sol.toFixed(2)} / {campaign.funding_goal_sol} SOL</span>
                        </div>
                        <Progress value={getFundingProgress(campaign.current_funding_sol, campaign.funding_goal_sol)} />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Users className="h-3 w-3" />
                          {campaign.contributor_count} contributors
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatTimeRemaining(campaign.target_deadline)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          
          {searchTerm.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Start typing to search for campaigns</p>
              <p className="text-xs mt-1">Search by name, description, or token address</p>
            </div>
          )}
        </div>
        
        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}