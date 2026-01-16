import React from 'react';
import { ShareCardDemo } from '@/components/social/ShareCardDemo';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ShareCardDemoPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto">
        <Button 
          variant="ghost" 
          onClick={() => navigate(-1)}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        
        <h1 className="text-2xl font-bold mb-2">Social Share Card Demo</h1>
        <p className="text-muted-foreground mb-8">
          Compare two approaches for generating shareable social preview cards
        </p>
        
        <ShareCardDemo />
      </div>
    </div>
  );
}
