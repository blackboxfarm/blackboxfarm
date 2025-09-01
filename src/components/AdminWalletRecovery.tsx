import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Key, Eye, EyeOff, Copy, Shield, AlertTriangle, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const AdminWalletRecovery = () => {
  const [wallets, setWallets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSecrets, setShowSecrets] = useState<{[key: string]: string}>({});
  const [walletType, setWalletType] = useState('campaign_funding');
  const { toast } = useToast();

  const loadWallets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('super_admin_wallets')
        .select('*')
        .eq('wallet_type', walletType)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWallets(data || []);
      
      toast({
        title: "Wallets Loaded",
        description: `Found ${data?.length || 0} ${walletType} wallets`,
      });
    } catch (error: any) {
      console.error('Error loading wallets:', error);
      toast({
        title: "Error",
        description: "Failed to load wallets. Check console for details.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const decryptWalletSecret = async (walletId: string, encryptedSecret: string) => {
    try {
      const { data, error } = await supabase.rpc('decrypt_wallet_secret', {
        encrypted_secret: encryptedSecret
      });

      if (error) throw error;
      return data;
    } catch (error: any) {
      console.error('Error decrypting wallet secret:', error);
      toast({
        title: "Decryption Error",
        description: "Failed to decrypt wallet secret",
        variant: "destructive",
      });
      return null;
    }
  };

  const toggleSecretVisibility = async (walletId: string, encryptedSecret: string) => {
    if (showSecrets[walletId]) {
      setShowSecrets(prev => {
        const newState = { ...prev };
        delete newState[walletId];
        return newState;
      });
      return;
    }

    const decryptedSecret = await decryptWalletSecret(walletId, encryptedSecret);
    if (decryptedSecret) {
      setShowSecrets(prev => ({ ...prev, [walletId]: decryptedSecret }));
    }
  };

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: `${type} copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const downloadWalletBackup = async (wallet: any) => {
    try {
      const decryptedSecret = await decryptWalletSecret(wallet.id, wallet.secret_key_encrypted);
      if (!decryptedSecret) return;

      const backupData = {
        id: wallet.id,
        label: wallet.label,
        wallet_type: wallet.wallet_type,
        pubkey: wallet.pubkey,
        secret_key: decryptedSecret,
        created_at: wallet.created_at,
        backup_date: new Date().toISOString(),
        warning: "KEEP THIS FILE SECURE AND PRIVATE - Contains sensitive wallet data"
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wallet-backup-${wallet.label}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Backup Downloaded",
        description: "Wallet backup file downloaded successfully",
      });
    } catch (error: any) {
      console.error('Error downloading backup:', error);
      toast({
        title: "Download Failed",
        description: "Failed to create wallet backup",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="tech-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Admin Wallet Recovery
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              Your wallet secrets are safely stored and encrypted in the database. 
              You can retrieve them here without needing to recreate the wallets.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div>
              <Label htmlFor="wallet-type">Wallet Type</Label>
              <select
                id="wallet-type"
                value={walletType}
                onChange={(e) => setWalletType(e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="campaign_funding">Campaign Funding</option>
                <option value="revenue_collection">Revenue Collection</option>
                <option value="platform_operations">Platform Operations</option>
              </select>
            </div>

            <Button 
              onClick={loadWallets} 
              disabled={loading}
              className="tech-button"
            >
              {loading ? "Loading..." : "Load Wallets"}
            </Button>
          </div>

          {wallets.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Retrieved Wallets:</h3>
              
              {wallets.map((wallet) => (
                <div key={wallet.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{wallet.label}</h4>
                      <Badge variant={wallet.is_active ? "default" : "secondary"}>
                        {wallet.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadWalletBackup(wallet)}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Backup
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Public Key:</Label>
                      <div className="flex items-center gap-2">
                        <Input 
                          value={wallet.pubkey} 
                          readOnly 
                          className="font-mono text-xs"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(wallet.pubkey, "Public key")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground">Private Key:</Label>
                      <div className="flex items-center gap-2">
                        <Input 
                          type={showSecrets[wallet.id] ? "text" : "password"}
                          value={showSecrets[wallet.id] || "••••••••••••••••••••••••••••••••"}
                          readOnly 
                          className="font-mono text-xs"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleSecretVisibility(wallet.id, wallet.secret_key_encrypted)}
                        >
                          {showSecrets[wallet.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                        {showSecrets[wallet.id] && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(showSecrets[wallet.id] || "", "Private key")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Created: {new Date(wallet.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Security Warning:</strong> Only access wallet secrets when necessary. 
              Always store backup copies in secure, offline locations. Never share these secrets.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
};