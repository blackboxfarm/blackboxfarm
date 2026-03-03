import { Brain, Lock, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface AISummaryTeaserProps {
  summary: string | null;
  onSignUpClick?: () => void;
}

export function AISummaryTeaser({ summary, onSignUpClick }: AISummaryTeaserProps) {
  const navigate = useNavigate();

  const handleSignUp = () => {
    if (onSignUpClick) {
      onSignUpClick();
    } else {
      navigate('/auth');
    }
  };

  return (
    <Card className="bg-gradient-to-br from-purple-500/5 via-card to-blue-500/5 border-purple-500/20 overflow-hidden">
      <CardContent className="p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-purple-400" />
          <h3 className="font-semibold text-lg">AI Quick Summary</h3>
        </div>

        {summary ? (
          <p className="text-sm text-foreground/80 leading-relaxed">
            {summary}
          </p>
        ) : (
          <div className="space-y-2">
            <div className="h-3 bg-muted rounded w-full animate-pulse" />
            <div className="h-3 bg-muted rounded w-4/5 animate-pulse" />
            <div className="h-3 bg-muted rounded w-3/4 animate-pulse" />
          </div>
        )}

        {/* Teaser for deeper analysis */}
        <div className="relative">
          <div className="filter blur-sm opacity-30 pointer-events-none select-none space-y-2 py-2">
            <div className="h-3 bg-muted rounded w-full" />
            <div className="h-3 bg-muted rounded w-5/6" />
            <div className="flex gap-2 mt-2">
              <div className="h-5 bg-purple-500/30 rounded w-24" />
              <div className="h-5 bg-blue-500/30 rounded w-16" />
            </div>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
              <Lock className="h-3.5 w-3.5" />
              <span>Full AI Analysis, lifecycle detection & key drivers</span>
            </div>
            <Button
              size="sm"
              onClick={handleSignUp}
              variant="outline"
              className="border-purple-500/30 hover:bg-purple-500/10"
            >
              Sign up free to unlock
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
