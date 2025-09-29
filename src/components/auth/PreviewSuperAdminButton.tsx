import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Shield, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export const PreviewSuperAdminButton = () => {
  const { user, isAuthenticated } = useAuth();
  const { isSuperAdmin, refreshRoles } = useUserRoles();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Show for any authenticated non-super-admin user (server enforces allowlist)
  const shouldShow = isAuthenticated && !isSuperAdmin;

  if (!shouldShow) {
    return null;
  }

  const handleGrantSuperAdmin = async () => {
    if (!user) {
      toast({
        title: 'Not authenticated',
        description: 'Please sign in first',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('grant-super-admin');
      
      if (error) {
        throw error;
      }

      if (data.success) {
        toast({
          title: 'Super Admin Granted!',
          description: 'You now have Super Admin access'
        });
        
        // Refresh user roles
        await refreshRoles();
        
        // Refresh the page to update UI
        window.location.reload();
      } else {
        throw new Error(data.error || 'Failed to grant super admin access');
      }
    } catch (error: any) {
      console.error('Error granting super admin:', error);
      toast({
        title: 'Access Denied',
        description: error.message || 'Your email is not authorized for super admin access',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleGrantSuperAdmin}
      disabled={isLoading}
      variant="outline"
      size="sm"
      className="gap-2 border-yellow-400 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-950"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Shield className="h-4 w-4" />
      )}
      {isLoading ? 'Granting...' : 'Grant Super Admin'}
    </Button>
  );
};