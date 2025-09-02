import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, ArrowRight } from "lucide-react";

interface CampaignCreatorSetupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CampaignCreatorSetupDialog({ 
  isOpen, 
  onClose, 
  onConfirm, 
  onCancel 
}: CampaignCreatorSetupDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            Upgrade to Campaign Creator
          </DialogTitle>
          <DialogDescription>
            To create campaigns, you'll need a Dashboard Account
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              We'll set up your Dashboard Account so you can create and manage community campaigns. 
              You'll be able to track funding, configure trading parameters, and monitor campaign performance.
            </AlertDescription>
          </Alert>
          
          <div className="space-y-3">
            <h4 className="font-medium">What you'll get:</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <ArrowRight className="h-3 w-3 text-primary" />
                Campaign creation and management
              </li>
              <li className="flex items-center gap-2">
                <ArrowRight className="h-3 w-3 text-primary" />
                Real-time funding tracking
              </li>
              <li className="flex items-center gap-2">
                <ArrowRight className="h-3 w-3 text-primary" />
                Trading bot configuration
              </li>
              <li className="flex items-center gap-2">
                <ArrowRight className="h-3 w-3 text-primary" />
                Contributor notifications
              </li>
            </ul>
          </div>
          
          <div className="flex gap-3 pt-4">
            <Button 
              variant="outline" 
              onClick={onCancel}
              className="flex-1"
            >
              Maybe Later
            </Button>
            <Button 
              onClick={onConfirm}
              className="flex-1"
            >
              Set Up Dashboard
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}