import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PasswordLoginProps {
  onAuthenticate: (password: string) => Promise<boolean>;
}

export const PasswordLogin = ({ onAuthenticate }: PasswordLoginProps) => {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsLoading(true);
    try {
      const success = await onAuthenticate(password);
      if (!success) {
        toast({
          title: "Access Denied",
          description: "Invalid password. Please try again.",
          variant: "destructive",
        });
        setPassword('');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An error occurred during authentication.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-tech-gradient flex items-center justify-center relative overflow-hidden">
      {/* Tech background elements */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-20 left-20 code-text">auth.verify(credentials)</div>
        <div className="absolute top-40 right-32 code-text">security.encrypt(password)</div>
        <div className="absolute bottom-40 left-32 code-text">session.create(user_id)</div>
        <div className="absolute bottom-20 right-20 code-text">access.granted = true</div>
      </div>
      
      <div className="relative z-10 w-full max-w-md tech-border glow-effect">
        <div className="p-8 space-y-6 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-full bg-accent/20 glow-soft">
              <Lock className="h-8 w-8 text-accent" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-accent">System Access Required</h1>
            <p className="text-muted-foreground mt-2">
              Enter your security credentials to access the trading platform
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Enter access password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                autoFocus
                className="bg-muted border-border text-center tracking-wider"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full tech-button" 
              disabled={isLoading || !password.trim()}
            >
              {isLoading ? "Authenticating..." : "Access System"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};