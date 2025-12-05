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
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from "https://esm.sh/@solana/spl-token@0.4.9";

// Token-2022 program ID
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
import bs58 from "https://esm.sh/bs58@5.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Decrypt wallet secret - handles raw base58, base64, and AES-GCM encryption
async function decryptWalletSecret(encryptedSecret: string): Promise<string> {
  // Base58 valid characters (no 0, O, I, l)
  const isBase58 = /^[1-9A-HJ-NP-Za-km-z]+$/.test(encryptedSecret);
  
  // Check if it's already a raw base58 private key (Solana private keys are 87-88 chars in base58)
  if (isBase58 && encryptedSecret.length >= 80 && encryptedSecret.length <= 90) {
    console.log('Secret appears to be raw base58 private key');
    return encryptedSecret;
  }
  
  // Check if it's a JSON array (raw secret key bytes)
  if (encryptedSecret.startsWith('[') && encryptedSecret.endsWith(']')) {
    console.log('Secret is JSON array format');
    return encryptedSecret;
  }

  try {
    // Try simple base64 decoding
    const decoded = atob(encryptedSecret);
    
    // Check if decoded value is valid
    const decodedIsBase58 = /^[1-9A-HJ-NP-Za-km-z]+$/.test(decoded);
    const decodedIsJsonArray = decoded.startsWith('[') && decoded.endsWith(']');
    
    if (decodedIsBase58 || decodedIsJsonArray) {
      console.log('Decrypted using simple base64');
      return decoded;
    }
    
    // Try AES-GCM decryption
    const keyString = Deno.env.get('ENCRYPTION_KEY');
    if (keyString) {
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
    }
    
    // Return base64 decoded as fallback
    return decoded;
  } catch (error) {
    console.error('Decryption error:', error);
    // If all else fails, return the original value (might be raw base58)
    return encryptedSecret;
  }
}

// Create memo instruction
function createMemoInstruction(memo: string, signer: PublicKey): TransactionInstruction {
  const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
  return new TransactionInstruction({
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: new TextEncoder().encode(memo),
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

    const { wallet_id, token_mint, amount_per_wallet, memo, recipients, config_id } = await req.json();

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
        config_id: config_id || null,
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

    // Setup Solana connection - USE PUBLIC RPC (Helius is rate limited)
    const rpcUrl = 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    console.log('Using public Solana RPC for airdrop');

    const tokenMintPubkey = new PublicKey(token_mint);
    const senderPubkey = senderKeypair.publicKey;

    // Get ALL token accounts for this wallet and mint (not just ATA)
    console.log(`Looking for token accounts for wallet ${senderPubkey.toBase58()} and mint ${token_mint}`);
    
    const tokenAccounts = await connection.getTokenAccountsByOwner(senderPubkey, {
      mint: tokenMintPubkey,
    });

    console.log(`Found ${tokenAccounts.value.length} token accounts for this mint`);

    if (tokenAccounts.value.length === 0) {
      console.error('No token accounts found for this mint');
      await supabaseAdmin
        .from('airdrop_distributions')
        .update({ status: 'failed' })
        .eq('id', distribution.id);
      throw new Error('Sender does not have any token account for this mint');
    }

    // Use the first token account that has tokens (or the ATA if it exists)
    let senderTokenAccount: PublicKey | null = null;
    let senderTokenBalance = BigInt(0);

    for (const { pubkey, account } of tokenAccounts.value) {
      const accountData = account.data;
      // Parse SPL token account data - balance is at offset 64, 8 bytes (u64)
      const balance = BigInt(new DataView(accountData.buffer, accountData.byteOffset + 64, 8).getBigUint64(0, true));
      console.log(`Token account ${pubkey.toBase58()} has balance: ${balance}`);
      
      if (balance > senderTokenBalance) {
        senderTokenAccount = pubkey;
        senderTokenBalance = balance;
      }
    }

    if (!senderTokenAccount || senderTokenBalance === BigInt(0)) {
      console.error('No token account with balance found');
      await supabaseAdmin
        .from('airdrop_distributions')
        .update({ status: 'failed' })
        .eq('id', distribution.id);
      throw new Error('Sender token accounts have zero balance');
    }

    console.log(`Using token account ${senderTokenAccount.toBase58()} with balance ${senderTokenBalance}`);

    // Get token decimals from mint and detect token program
    const mintInfo = await connection.getParsedAccountInfo(tokenMintPubkey);
    const decimals = (mintInfo.value?.data as any)?.parsed?.info?.decimals || 6;
    
    // Detect which token program owns this mint (SPL Token or Token-2022)
    const mintOwner = mintInfo.value?.owner;
    const isToken2022 = mintOwner?.equals(TOKEN_2022_PROGRAM_ID) || false;
    const tokenProgramId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    
    console.log(`Token decimals: ${decimals}, Program: ${isToken2022 ? 'Token-2022' : 'SPL Token'}`);
    
    const amountInSmallestUnit = BigInt(Math.floor(amount_per_wallet * Math.pow(10, decimals)));
    const totalRequired = amountInSmallestUnit * BigInt(validRecipients.length);

    console.log(`Amount per wallet: ${amountInSmallestUnit}, Total required: ${totalRequired}, Have: ${senderTokenBalance}`);

    if (senderTokenBalance < totalRequired) {
      console.error(`Insufficient tokens. Have: ${senderTokenBalance}, Need: ${totalRequired}`);
      await supabaseAdmin
        .from('airdrop_distributions')
        .update({ status: 'failed' })
        .eq('id', distribution.id);
      throw new Error(`Insufficient token balance. Have: ${Number(senderTokenBalance) / Math.pow(10, decimals)}, Need: ${amount_per_wallet * validRecipients.length}`);
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
          
          // Get ATA with correct program ID
          const recipientTokenAccount = await getAssociatedTokenAddress(
            tokenMintPubkey,
            recipientPubkey,
            false, // allowOwnerOffCurve
            tokenProgramId,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );

          // Check if recipient token account exists using getAccountInfo (works for both programs)
          let accountExists = false;
          try {
            const accountInfo = await connection.getAccountInfo(recipientTokenAccount);
            accountExists = accountInfo !== null;
          } catch {
            // Account doesn't exist
          }

          // Create associated token account if needed
          if (!accountExists) {
            transaction.add(
              createAssociatedTokenAccountInstruction(
                senderPubkey,
                recipientTokenAccount,
                recipientPubkey,
                tokenMintPubkey,
                tokenProgramId,
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
              tokenProgramId
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
