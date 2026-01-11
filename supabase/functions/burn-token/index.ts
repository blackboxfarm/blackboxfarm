import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction,
  sendAndConfirmTransaction 
} from "https://esm.sh/@solana/web3.js@1.98.0";
import { 
  getAssociatedTokenAddress, 
  createBurnInstruction,
  createCloseAccountInstruction,
  TOKEN_PROGRAM_ID 
} from "https://esm.sh/@solana/spl-token@0.4.6";
import bs58 from "https://esm.sh/bs58@6.0.0";

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

// Decrypt AES-encrypted data
async function decryptData(encryptedData: string): Promise<string> {
  if (encryptedData.startsWith("AES:")) {
    const keyMaterial = Deno.env.get("ENCRYPTION_KEY");
    if (!keyMaterial) {
      throw new Error("ENCRYPTION_KEY required for AES decryption");
    }
    
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const keyData = encoder.encode(keyMaterial.padEnd(32, '0').slice(0, 32));
    
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    
    const aesData = encryptedData.substring(4);
    const combined = new Uint8Array(
      atob(aesData).split('').map(char => char.charCodeAt(0))
    );
    
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encrypted
    );
    
    return decoder.decode(decrypted);
  }
  
  // Fallback to base64
  try {
    return atob(encryptedData);
  } catch {
    return encryptedData;
  }
}

function parseKeypair(secret: string): Keypair {
  const trimmed = secret.trim();
  
  // JSON array format
  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
  
  // Base58 format
  try {
    const decoded = bs58.decode(trimmed);
    if (decoded.length === 64) {
      return Keypair.fromSecretKey(decoded);
    }
    if (decoded.length === 32) {
      return Keypair.fromSeed(decoded);
    }
  } catch {}
  
  throw new Error("Invalid secret key format");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check for service key header (for internal calls)
    const serviceKeyHeader = req.headers.get("x-service-key");
    const isServiceCall = serviceKeyHeader === supabaseServiceKey;
    
    let userId = "service";
    
    if (!isServiceCall) {
      // Authenticate user
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return bad("No authorization header", 401);
      }

      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        console.error("[burn-token] Auth error:", authError);
        return bad("Unauthorized", 401);
      }

      // Check if user is super admin
      const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", { _user_id: user.id });
      if (!isSuperAdmin) {
        return bad("Super admin access required", 403);
      }
      
      userId = user.id;
    }
    
    console.log(`[burn-token] Authorized via ${isServiceCall ? 'service key' : 'user auth'}`)

    const { 
      wallet_id, 
      wallet_source, 
      token_mint,
      close_account = true // Also close the empty account to reclaim rent
    } = await req.json();

    if (!wallet_id || !wallet_source || !token_mint) {
      return bad("wallet_id, wallet_source, and token_mint are required");
    }

    console.log(`[burn-token] Burning token ${token_mint} from ${wallet_source}/${wallet_id}`);

    // Determine secret column based on source
    const secretCol = wallet_source === 'wallet_pools' ? 'secret_key' : 'secret_key_encrypted';
    const isEncrypted = wallet_source !== 'wallet_pools';

    // Fetch wallet
    const { data: wallet, error: fetchError } = await supabase
      .from(wallet_source)
      .select(`id, pubkey, ${secretCol}`)
      .eq("id", wallet_id)
      .single();

    if (fetchError || !wallet) {
      console.error("[burn-token] Wallet fetch error:", fetchError);
      return bad("Wallet not found", 404);
    }

    // Get secret key
    const rawSecret = wallet[secretCol];
    if (!rawSecret) {
      return bad("No secret key stored for this wallet", 404);
    }

    let secretKey: string;
    if (isEncrypted) {
      secretKey = await decryptData(rawSecret);
    } else {
      secretKey = rawSecret;
    }

    const keypair = parseKeypair(secretKey);
    const ownerPubkey = keypair.publicKey;
    const mintPubkey = new PublicKey(token_mint);

    // Connect to Solana
    const rpcUrl = Deno.env.get("SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");

    // Get the associated token account
    const ata = await getAssociatedTokenAddress(mintPubkey, ownerPubkey);
    
    // Check if ATA exists and get balance
    let tokenBalance = 0n;
    let tokenProgramId = TOKEN_PROGRAM_ID;
    
    try {
      const accountInfo = await connection.getAccountInfo(ata);
      if (!accountInfo) {
        return bad(`No token account found for ${token_mint}`, 404);
      }
      
      // Determine token program (could be Token-2022)
      tokenProgramId = accountInfo.owner;
      
      const tokenAccountInfo = await connection.getTokenAccountBalance(ata);
      tokenBalance = BigInt(tokenAccountInfo.value.amount);
      
      console.log(`[burn-token] Found ${tokenBalance} tokens (${tokenAccountInfo.value.uiAmount} UI) in ATA ${ata.toBase58()}`);
      
      if (tokenBalance === 0n && !close_account) {
        return ok({ 
          success: true, 
          message: "Token balance already 0, nothing to burn",
          burned: 0
        });
      }
    } catch (e) {
      console.error("[burn-token] Error getting token account:", e);
      return bad(`Failed to get token account: ${e.message}`, 500);
    }

    // Build transaction
    const transaction = new Transaction();

    // Add burn instruction if there's a balance
    if (tokenBalance > 0n) {
      transaction.add(
        createBurnInstruction(
          ata,           // token account
          mintPubkey,    // mint
          ownerPubkey,   // owner
          tokenBalance,  // amount to burn (all of it)
          [],            // multiSigners
          tokenProgramId // token program
        )
      );
    }

    // Add close account instruction to reclaim rent
    if (close_account) {
      transaction.add(
        createCloseAccountInstruction(
          ata,           // account to close
          ownerPubkey,   // destination for rent
          ownerPubkey,   // owner
          [],            // multiSigners  
          tokenProgramId // token program
        )
      );
    }

    if (transaction.instructions.length === 0) {
      return ok({ 
        success: true, 
        message: "Nothing to do",
        burned: 0
      });
    }

    // Send transaction
    console.log(`[burn-token] Sending burn transaction...`);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      { commitment: "confirmed" }
    );

    console.log(`[burn-token] Success! Signature: ${signature}`);

    // Log the action
    await supabase.from("activity_logs").insert({
      message: `Burned ${tokenBalance.toString()} tokens of ${token_mint}`,
      log_level: "info",
      metadata: {
        wallet_id: wallet.id,
        wallet_pubkey: wallet.pubkey,
        token_mint,
        amount_burned: tokenBalance.toString(),
        account_closed: close_account,
        signature,
        action: "token_burn",
        executed_by: userId
      }
    });

    return ok({
      success: true,
      signature,
      burned: tokenBalance.toString(),
      account_closed: close_account,
      wallet_pubkey: wallet.pubkey,
      token_mint
    });

  } catch (error: any) {
    console.error("[burn-token] Error:", error);
    return bad(error.message || "Internal server error", 500);
  }
});
