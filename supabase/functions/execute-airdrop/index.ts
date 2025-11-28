import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram
} from "https://esm.sh/@solana/web3.js@1.98.0";
import { 
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from "https://esm.sh/@solana/spl-token@0.4.9";
import bs58 from "https://esm.sh/bs58@5.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Decrypt wallet secret - handles both simple base64 and AES-GCM encryption
async function decryptWalletSecret(encryptedSecret: string): Promise<string> {
  try {
    // First, try simple base64 decoding (matches encrypt_wallet_secret SQL function)
    const decoded = atob(encryptedSecret);
    
    // If it decodes to a valid secret key format (base58 or JSON array), return it
    // Base58 chars are alphanumeric without 0, O, I, l
    const isBase58 = /^[1-9A-HJ-NP-Za-km-z]+$/.test(decoded);
    const isJsonArray = decoded.startsWith('[') && decoded.endsWith(']');
    
    if (isBase58 || isJsonArray) {
      console.log('Decrypted using simple base64');
      return decoded;
    }
    
    // If simple base64 didn't produce a valid format, try AES-GCM
    const keyString = Deno.env.get('ENCRYPTION_KEY');
    if (!keyString) {
      // No encryption key, return the base64 decoded value as fallback
      return decoded;
    }

    const keyBytes = new TextEncoder().encode(keyString.padEnd(32, '0').slice(0, 32));
    const encryptionKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const combined = new Uint8Array(
      atob(encryptedSecret).split('').map(char => char.charCodeAt(0))
    );

    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      encryptionKey,
      encrypted
    );

    console.log('Decrypted using AES-GCM');
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Decryption error, trying plain base64:', error);
    // Last resort: return base64 decoded value
    return atob(encryptedSecret);
  }
}

// Create memo instruction
function createMemoInstruction(memo: string, signer: PublicKey): TransactionInstruction {
  const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
  return new TransactionInstruction({
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, 'utf-8'),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const heliusApiKey = Deno.env.get("HELIUS_API_KEY");
    
    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is super admin
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: isSuperAdmin } = await supabaseAdmin.rpc('is_super_admin', { _user_id: user.id });
    
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Super admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { wallet_id, token_mint, amount_per_wallet, memo, recipients } = await req.json();

    if (!wallet_id || !token_mint || !amount_per_wallet || !recipients?.length) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate recipients are valid Solana addresses
    const validRecipients: string[] = [];
    for (const r of recipients) {
      try {
        new PublicKey(r);
        validRecipients.push(r);
      } catch {
        console.warn(`Invalid address skipped: ${r}`);
      }
    }

    if (validRecipients.length === 0) {
      return new Response(JSON.stringify({ error: "No valid recipient addresses" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get wallet info with encrypted secret
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('airdrop_wallets')
      .select('*')
      .eq('id', wallet_id)
      .single();

    if (walletError || !wallet) {
      return new Response(JSON.stringify({ error: "Wallet not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`📤 Starting airdrop: ${amount_per_wallet} tokens to ${validRecipients.length} recipients`);

    // Create distribution record
    const { data: distribution, error: distError } = await supabaseAdmin
      .from('airdrop_distributions')
      .insert({
        wallet_id,
        token_mint,
        amount_per_wallet,
        memo: memo || null,
        recipient_count: validRecipients.length,
        recipients: validRecipients,
        status: 'processing',
      })
      .select()
      .single();

    if (distError) {
      console.error('Distribution create error:', distError);
      throw new Error('Failed to create distribution record');
    }

    // Decrypt wallet secret key
    let secretKeyString: string;
    try {
      secretKeyString = await decryptWalletSecret(wallet.secret_key_encrypted);
    } catch (error) {
      console.error('Failed to decrypt wallet secret:', error);
      await supabaseAdmin
        .from('airdrop_distributions')
        .update({ status: 'failed' })
        .eq('id', distribution.id);
      throw new Error('Failed to decrypt wallet secret');
    }

    // Parse the secret key
    let senderKeypair: Keypair;
    try {
      // Try as base58 first
      const secretKeyBytes = bs58.decode(secretKeyString);
      senderKeypair = Keypair.fromSecretKey(secretKeyBytes);
    } catch {
      try {
        // Try as JSON array
        const secretKeyArray = JSON.parse(secretKeyString);
        senderKeypair = Keypair.fromSecretKey(new Uint8Array(secretKeyArray));
      } catch {
        console.error('Failed to parse secret key');
        await supabaseAdmin
          .from('airdrop_distributions')
          .update({ status: 'failed' })
          .eq('id', distribution.id);
        throw new Error('Invalid secret key format');
      }
    }

    // Verify keypair matches stored pubkey
    if (senderKeypair.publicKey.toBase58() !== wallet.pubkey) {
      console.error('Keypair mismatch');
      await supabaseAdmin
        .from('airdrop_distributions')
        .update({ status: 'failed' })
        .eq('id', distribution.id);
      throw new Error('Wallet keypair mismatch');
    }

    // Setup Solana connection
    const rpcUrl = heliusApiKey 
      ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
      : 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    const tokenMintPubkey = new PublicKey(token_mint);
    const senderPubkey = senderKeypair.publicKey;

    // Get sender's token account
    const senderTokenAccount = await getAssociatedTokenAddress(
      tokenMintPubkey,
      senderPubkey
    );

    // Verify sender has enough tokens
    let senderTokenInfo;
    try {
      senderTokenInfo = await getAccount(connection, senderTokenAccount);
    } catch (error) {
      console.error('Sender token account not found');
      await supabaseAdmin
        .from('airdrop_distributions')
        .update({ status: 'failed' })
        .eq('id', distribution.id);
      throw new Error('Sender does not have a token account for this mint');
    }

    // Get token decimals from mint
    const mintInfo = await connection.getParsedAccountInfo(tokenMintPubkey);
    const decimals = (mintInfo.value?.data as any)?.parsed?.info?.decimals || 9;
    
    const amountInSmallestUnit = BigInt(Math.floor(amount_per_wallet * Math.pow(10, decimals)));
    const totalRequired = amountInSmallestUnit * BigInt(validRecipients.length);

    if (senderTokenInfo.amount < totalRequired) {
      console.error(`Insufficient tokens. Have: ${senderTokenInfo.amount}, Need: ${totalRequired}`);
      await supabaseAdmin
        .from('airdrop_distributions')
        .update({ status: 'failed' })
        .eq('id', distribution.id);
      throw new Error(`Insufficient token balance. Have: ${Number(senderTokenInfo.amount) / Math.pow(10, decimals)}, Need: ${amount_per_wallet * validRecipients.length}`);
    }

    // Batch recipients (max 5 per transaction for safety)
    const BATCH_SIZE = 5;
    const batches: string[][] = [];
    for (let i = 0; i < validRecipients.length; i += BATCH_SIZE) {
      batches.push(validRecipients.slice(i, i + BATCH_SIZE));
    }

    console.log(`📦 Processing ${batches.length} batches...`);

    const signatures: string[] = [];
    const errors: string[] = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} recipients`);

      try {
        const transaction = new Transaction();
        
        // Add compute budget for complex transactions
        transaction.add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 })
        );

        for (const recipientAddress of batch) {
          const recipientPubkey = new PublicKey(recipientAddress);
          const recipientTokenAccount = await getAssociatedTokenAddress(
            tokenMintPubkey,
            recipientPubkey
          );

          // Check if recipient token account exists
          let accountExists = false;
          try {
            await getAccount(connection, recipientTokenAccount);
            accountExists = true;
          } catch {
            // Account doesn't exist, will create it
          }

          // Create associated token account if needed
          if (!accountExists) {
            transaction.add(
              createAssociatedTokenAccountInstruction(
                senderPubkey,
                recipientTokenAccount,
                recipientPubkey,
                tokenMintPubkey,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
              )
            );
          }

          // Add transfer instruction
          transaction.add(
            createTransferInstruction(
              senderTokenAccount,
              recipientTokenAccount,
              senderPubkey,
              amountInSmallestUnit,
              [],
              TOKEN_PROGRAM_ID
            )
          );
        }

        // Add memo if provided (only once per transaction)
        if (memo && memo.trim()) {
          transaction.add(createMemoInstruction(memo.slice(0, 280), senderPubkey));
        }

        // Get recent blockhash
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = senderPubkey;

        // Sign and send
        transaction.sign(senderKeypair);
        
        const signature = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });

        console.log(`✅ Batch ${batchIndex + 1} sent: ${signature}`);

        // Confirm transaction
        await connection.confirmTransaction({
          blockhash,
          lastValidBlockHeight,
          signature,
        }, 'confirmed');

        signatures.push(signature);
        
        // Small delay between batches to avoid rate limiting
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (error: any) {
        console.error(`❌ Batch ${batchIndex + 1} failed:`, error);
        errors.push(`Batch ${batchIndex + 1}: ${error.message || String(error)}`);
      }
    }

    // Update distribution record with results
    const finalStatus = errors.length === 0 ? 'completed' : 
                        signatures.length === 0 ? 'failed' : 'partial';

    await supabaseAdmin
      .from('airdrop_distributions')
      .update({ 
        status: finalStatus,
        transaction_signatures: signatures,
        completed_at: new Date().toISOString(),
      })
      .eq('id', distribution.id);

    console.log(`🏁 Airdrop ${finalStatus}: ${signatures.length} successful, ${errors.length} failed`);

    return new Response(JSON.stringify({
      success: errors.length === 0,
      distribution_id: distribution.id,
      recipient_count: validRecipients.length,
      total_tokens: amount_per_wallet * validRecipients.length,
      signatures,
      errors: errors.length > 0 ? errors : undefined,
      status: finalStatus,
      message: `Airdrop ${finalStatus}. ${signatures.length} transactions sent.`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
