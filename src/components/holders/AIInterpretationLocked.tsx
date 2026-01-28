import { useState } from 'react';
import { Lock, Brain, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';
import aiInterpretationPreview from '@/assets/ai-interpretation-preview.png';

interface AIInterpretationLockedProps {
  onSignupClick?: () => void;
}

export function AIInterpretationLocked({ onSignupClick }: AIInterpretationLockedProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onSignupClick) {
      onSignupClick();
    } else {
      navigate('/login');
    }
  };

  return (
    <Card className="bg-gradient-to-br from-purple-500/5 via-card to-blue-500/5 border-purple-500/20 relative overflow-hidden min-h-[320px]">
      {/* Decorative blur overlay */}
      <div className="absolute inset-0 backdrop-blur-[2px] bg-background/40 z-10" />
      
      {/* Fake content behind blur */}
      <div className="p-4 opacity-30 select-none pointer-events-none">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="h-5 w-5 text-purple-400" />
          <span className="font-semibold">AI Interpretation</span>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-4/5" />
          <div className="h-3 bg-muted rounded w-3/4" />
          <div className="flex gap-2 mt-3">
            <div className="h-5 bg-purple-500/30 rounded w-20" />
            <div className="h-5 bg-blue-500/30 rounded w-16" />
          </div>
        </div>
      </div>

      {/* Locked overlay content */}
      <CardContent className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center p-6">
        <div className="bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-full p-3 mb-3 border border-purple-500/30">
          <Lock className="h-6 w-6 text-purple-400" />
        </div>
        
        <h3 className="font-semibold text-lg mb-1 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-400" />
          AI-Powered Analysis
        </h3>
        
        <p className="text-sm text-muted-foreground mb-4 max-w-xs">
          Sign up to unlock intelligent holder structure interpretation, lifecycle detection, and key driver analysis.
        </p>
        
        {/* Preview Thumbnail */}
        <Dialog>
          <DialogTrigger asChild>
            <div className="group cursor-pointer mb-4">
              <div className="relative w-24 h-16 md:w-28 md:h-[72px] rounded-lg overflow-hidden border border-purple-500/30 bg-muted/30 transition-all duration-300 group-hover:scale-110 group-hover:border-purple-400 group-hover:shadow-lg group-hover:shadow-purple-500/20">
                <img
                  src={aiInterpretationPreview}
                  alt="AI Interpretation Preview"
                  className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute bottom-0 left-0 right-0 p-1 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <span className="text-[10px] font-medium text-foreground truncate block">
                    Preview
                  </span>
                </div>
              </div>
            </div>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] p-2">
            <div className="flex flex-col items-center gap-3">
              <img
                src={aiInterpretationPreview}
                alt="AI Interpretation Analysis Preview"
                className="max-w-full max-h-[80vh] rounded-lg object-contain"
              />
              <p className="text-sm text-muted-foreground text-center">AI Interpretation Analysis - Structural insights, lifecycle detection, and key drivers</p>
            </div>
          </DialogContent>
        </Dialog>
        
        <Button 
          onClick={handleClick}
          className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white"
        >
          Sign up for free
        </Button>
      </CardContent>
    </Card>
  );
}