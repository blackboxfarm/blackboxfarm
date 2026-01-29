import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Keypair } from "https://esm.sh/@solana/web3.js@1.87.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bad(message: string, status = 400) {
  return ok({ error: message }, status);
}

// Encryption utilities
class SecureStorage {
  private static encryptionKey: CryptoKey | null = null;

  private static async getEncryptionKey(): Promise<CryptoKey> {
    if (this.encryptionKey) {
      return this.encryptionKey;
    }

    const keyString = Deno.env.get('ENCRYPTION_KEY');
    if (!keyString) {
      throw new Error('ENCRYPTION_KEY environment variable not set');
    }

    const keyBytes = new TextEncoder().encode(keyString.padEnd(32, '0').slice(0, 32));
    this.encryptionKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );

    return this.encryptionKey;
  }

  static async encrypt(plaintext: string): Promise<string> {
    const key = await this.getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
  }
}

// Base58 decode for Solana keys
function base58ToBytes(str: string): Uint8Array {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes: number[] = [];
  for (const char of str) {
    let carry = ALPHABET.indexOf(char);
    if (carry === -1) throw new Error('Invalid base58 character');
    for (let i = 0; i < bytes.length; ++i) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of str) {
    if (char === '1') bytes.push(0);
    else break;
  }
  return new Uint8Array(bytes.reverse());
}

// Validate and parse private key, return public key
function validatePrivateKey(privateKey: string): { pubkey: string; valid: boolean; error?: string } {
  try {
    // Try JSON array format first
    try {
      const parsed = JSON.parse(privateKey);
      if (Array.isArray(parsed)) {
        const keypair = Keypair.fromSecretKey(new Uint8Array(parsed));
        return { pubkey: keypair.publicKey.toBase58(), valid: true };
      }
    } catch {
      // Not JSON, continue
    }

    // Try base58 format
    const decoded = base58ToBytes(privateKey.trim());
    if (decoded.length === 64) {
      const keypair = Keypair.fromSecretKey(decoded);
      return { pubkey: keypair.publicKey.toBase58(), valid: true };
    }

    return { pubkey: '', valid: false, error: 'Invalid key format. Expected base58 or JSON array.' };
  } catch (err: any) {
    return { pubkey: '', valid: false, error: err.message || 'Failed to parse private key' };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return bad("Authorization required", 401);
    }

    // Verify user is super admin
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    
    if (authError || !user) {
      return bad("Invalid authorization", 401);
    }

    // Check if super admin
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', { _user_id: user.id });
    if (!isSuperAdmin) {
      return bad("Super admin access required", 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    console.log(`Rent Reclaimer Wallets - action: ${action}`);

    // LIST: Get all wallets
    if (action === 'list') {
      const { data: wallets, error } = await supabase
        .from('rent_reclaimer_wallets')
        .select('id, pubkey, nickname, is_active, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return ok({
        success: true,
        wallets: wallets || [],
      });
    }

    // ADD: Import a new wallet
    if (action === 'add') {
      const { privateKey, nickname } = body;
      
      if (!privateKey) {
        return bad("Private key is required");
      }

      // Validate the private key and derive public key
      const validation = validatePrivateKey(privateKey);
      if (!validation.valid) {
        return bad(validation.error || "Invalid private key");
      }

      // Check if wallet already exists
      const { data: existing } = await supabase
        .from('rent_reclaimer_wallets')
        .select('id')
        .eq('pubkey', validation.pubkey)
        .single();

      if (existing) {
        return bad("Wallet already exists");
      }

      // Encrypt the private key
      const encryptedKey = await SecureStorage.encrypt(privateKey.trim());

      // Insert the wallet
      const { data: wallet, error } = await supabase
        .from('rent_reclaimer_wallets')
        .insert({
          pubkey: validation.pubkey,
          secret_key_encrypted: encryptedKey,
          nickname: nickname || null,
          is_active: true,
        })
        .select('id, pubkey, nickname, is_active, created_at')
        .single();

      if (error) throw error;

      console.log(`Added wallet: ${validation.pubkey}`);

      return ok({
        success: true,
        wallet,
      });
    }

    // UPDATE: Update wallet nickname or active status
    if (action === 'update') {
      const { id, nickname, is_active } = body;
      
      if (!id) {
        return bad("Wallet ID is required");
      }

      const updates: Record<string, unknown> = {};
      if (nickname !== undefined) updates.nickname = nickname;
      if (is_active !== undefined) updates.is_active = is_active;

      const { data: wallet, error } = await supabase
        .from('rent_reclaimer_wallets')
        .update(updates)
        .eq('id', id)
        .select('id, pubkey, nickname, is_active, created_at, updated_at')
        .single();

      if (error) throw error;

      console.log(`Updated wallet: ${id}`);

      return ok({
        success: true,
        wallet,
      });
    }

    // DELETE: Remove a wallet
    if (action === 'delete') {
      const { id } = body;
      
      if (!id) {
        return bad("Wallet ID is required");
      }

      const { error } = await supabase
        .from('rent_reclaimer_wallets')
        .delete()
        .eq('id', id);

      if (error) throw error;

      console.log(`Deleted wallet: ${id}`);

      return ok({
        success: true,
        deleted: id,
      });
    }

    return bad(`Unknown action: ${action}. Use 'list', 'add', 'update', or 'delete'.`);

  } catch (err: any) {
    console.error("Rent Reclaimer Wallets error:", err);
    return bad(err.message || "Unknown error", 500);
  }
});
