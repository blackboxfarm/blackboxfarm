import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "https://esm.sh/@solana/web3.js@1.95.3?target=deno";
import { getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID as SPL_TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "https://esm.sh/@solana/spl-token@0.4.0";
import bs58 from "https://esm.sh/bs58@5.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-forwarded-for, x-real-ip',
};

const GIFT_AMOUNT = 1111; // Fixed amount
const MEMO_MESSAGE = "Get $FUCT https://fuct.xyz";
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

function createMemoInstruction(memo: string, signer: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: new TextEncoder().encode(memo),
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { recipientWallet, deviceFingerprint } = await req.json();

    // Get client IP
    const forwarded = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const ipAddress = forwarded?.split(',')[0]?.trim() || realIp || 'unknown';

    console.log(`FUCT Gift request: recipient=${recipientWallet}, fingerprint=${deviceFingerprint?.slice(0,8)}..., ip=${ipAddress}`);

    // Validate inputs
    if (!recipientWallet || !deviceFingerprint) {
      return new Response(JSON.stringify({ error: 'Missing recipient wallet or device fingerprint' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate wallet address
    try {
      new PublicKey(recipientWallet);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid wallet address' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get required secrets
    const tokenMint = Deno.env.get('FUCT_TOKEN_MINT');
    const senderSecret = Deno.env.get('FUCT_SENDER_WALLET_SECRET');
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY');

    if (!tokenMint || !senderSecret || !heliusApiKey) {
      console.error('Missing required secrets:', { 
        hasMint: !!tokenMint, 
        hasSender: !!senderSecret, 
        hasHelius: !!heliusApiKey 
      });
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check rate limit - one per fingerprint per day
    const today = new Date().toISOString().split('T')[0];
    const { data: existingClaim } = await supabase
      .from('fuct_gift_claims')
      .select('id, status')
      .eq('device_fingerprint', deviceFingerprint)
      .eq('claim_date', today)
      .maybeSingle();

    if (existingClaim) {
      console.log('Rate limited - already claimed today:', existingClaim.id);
      return new Response(JSON.stringify({ 
        error: 'You have already claimed your $FUCT gift today. Come back tomorrow!',
        alreadyClaimed: true 
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Also check IP (secondary rate limit)
    const { data: ipClaim } = await supabase
      .from('fuct_gift_claims')
      .select('id')
      .eq('ip_address', ipAddress)
      .eq('claim_date', today)
      .maybeSingle();

    if (ipClaim) {
      console.log('Rate limited - IP already claimed today:', ipAddress);
      return new Response(JSON.stringify({ 
        error: 'This IP has already claimed today. Try again tomorrow!',
        alreadyClaimed: true 
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create pending claim record
    const { data: claimRecord, error: insertError } = await supabase
      .from('fuct_gift_claims')
      .insert({
        recipient_wallet: recipientWallet,
        ip_address: ipAddress,
        device_fingerprint: deviceFingerprint,
        claim_date: today,
        status: 'pending'
      })
      .select()
      .single();

    if (insertError) {
      // Likely a race condition duplicate
      console.error('Failed to insert claim:', insertError);
      return new Response(JSON.stringify({ 
        error: 'Already claimed - please try again tomorrow',
        alreadyClaimed: true 
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Created pending claim:', claimRecord.id);

    // Setup Solana connection
    const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`, 'confirmed');

    // Decode sender wallet
    let senderKeypair: Keypair;
    try {
      const secretBytes = bs58.decode(senderSecret);
      senderKeypair = Keypair.fromSecretKey(secretBytes);
    } catch {
      // Try base64 if bs58 fails
      try {
        const secretBytes = Uint8Array.from(atob(senderSecret), c => c.charCodeAt(0));
        senderKeypair = Keypair.fromSecretKey(secretBytes);
      } catch (e) {
        console.error('Failed to decode sender wallet:', e);
        await supabase.from('fuct_gift_claims').update({ status: 'failed' }).eq('id', claimRecord.id);
        return new Response(JSON.stringify({ error: 'Sender wallet configuration error' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const mintPubkey = new PublicKey(tokenMint);
    const recipientPubkey = new PublicKey(recipientWallet);

    // Get token info for decimals
    const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
    const decimals = (mintInfo.value?.data as any)?.parsed?.info?.decimals ?? 9;
    const tokenAmount = BigInt(GIFT_AMOUNT) * BigInt(10 ** decimals);

    console.log(`Sending ${GIFT_AMOUNT} tokens (${tokenAmount} raw) with ${decimals} decimals`);

    // Get associated token accounts
    const senderATA = await getAssociatedTokenAddress(mintPubkey, senderKeypair.publicKey);
    const recipientATA = await getAssociatedTokenAddress(mintPubkey, recipientPubkey);

    // Check sender has enough tokens
    const senderBalance = await connection.getTokenAccountBalance(senderATA);
    if (BigInt(senderBalance.value.amount) < tokenAmount) {
      console.error('Insufficient sender balance:', senderBalance.value.uiAmount);
      await supabase.from('fuct_gift_claims').update({ status: 'failed' }).eq('id', claimRecord.id);
      return new Response(JSON.stringify({ error: 'Gift vault is empty. Please contact support.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Build transaction
    const transaction = new Transaction();
    
    // Check if recipient ATA exists
    const recipientATAInfo = await connection.getAccountInfo(recipientATA);
    if (!recipientATAInfo) {
      console.log('Creating recipient ATA:', recipientATA.toString());
      transaction.add(
        createAssociatedTokenAccountInstruction(
          senderKeypair.publicKey, // payer
          recipientATA,
          recipientPubkey,
          mintPubkey
        )
      );
    }

    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        senderATA,
        recipientATA,
        senderKeypair.publicKey,
        tokenAmount
      )
    );

    // Add memo instruction
    transaction.add(createMemoInstruction(MEMO_MESSAGE, senderKeypair.publicKey));

    // Set recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = senderKeypair.publicKey;

    // Sign and send
    transaction.sign(senderKeypair);
    
    console.log('Sending transaction...');
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });

    console.log('Transaction sent:', signature);

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight
    }, 'confirmed');

    if (confirmation.value.err) {
      console.error('Transaction failed:', confirmation.value.err);
      await supabase.from('fuct_gift_claims').update({ status: 'failed' }).eq('id', claimRecord.id);
      return new Response(JSON.stringify({ error: 'Transaction failed on-chain' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Update claim as successful
    await supabase.from('fuct_gift_claims').update({ 
      status: 'completed',
      tx_signature: signature 
    }).eq('id', claimRecord.id);

    console.log('Gift sent successfully!', signature);

    return new Response(JSON.stringify({ 
      success: true,
      signature,
      amount: GIFT_AMOUNT,
      message: `You got $FUCT! ${GIFT_AMOUNT} tokens sent to your wallet.`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('FUCT Gift error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error occurred' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});