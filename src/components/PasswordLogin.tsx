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
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-2">
            <Lock className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl">Access Required</CardTitle>
          <CardDescription>
            Enter the access password to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Enter access password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                autoFocus
              />
            </div>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading || !password.trim()}
            >
              {isLoading ? "Authenticating..." : "Access App"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};