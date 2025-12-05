import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "https://esm.sh/@solana/web3.js@1.87.6";
import bs58 from "https://esm.sh/bs58@5.0.0";
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAccount } from "https://esm.sh/@solana/spl-token@0.3.9";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RPC_URL = Deno.env.get('HELIUS_RPC_URL') || 'https://api.mainnet-beta.solana.com';

// Decrypt secret key - handles both AES and legacy base64
async function decryptSecret(encrypted: string): Promise<string> {
  // Check if it's AES encrypted (has prefix)
  if (encrypted.startsWith('AES:')) {
    const keyMaterial = Deno.env.get('ENCRYPTION_KEY')
    if (!keyMaterial) {
      console.error('No ENCRYPTION_KEY for AES decryption')
      throw new Error('Decryption key not configured')
    }
    
    try {
      const encoder = new TextEncoder()
      const keyData = encoder.encode(keyMaterial.padEnd(32, '0').slice(0, 32))
      
      const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      )
      
      // Remove AES: prefix and decode base64
      const combined = Uint8Array.from(atob(encrypted.slice(4)), c => c.charCodeAt(0))
      const iv = combined.slice(0, 12)
      const ciphertext = combined.slice(12)
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      )
      
      return new TextDecoder().decode(decrypted)
    } catch (error) {
      console.error('AES decryption failed:', error)
      throw new Error('Failed to decrypt wallet secret')
    }
  }
  
  // Legacy base64 format
  return atob(encrypted)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, user_id, recipient, amount, token_mint } = await req.json();
    console.log(`[mega-whale-wallet-transfer] Action: ${action}, User: ${user_id}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user's wallet
    const { data: wallet, error: walletError } = await supabase
      .from('mega_whale_auto_buy_wallets')
      .select('*')
      .eq('user_id', user_id)
      .eq('is_active', true)
      .single();

    if (action === 'get_wallet_info') {
      if (!wallet) {
        return new Response(JSON.stringify({ success: true, wallet: null }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const connection = new Connection(RPC_URL, 'confirmed');
      const pubkey = new PublicKey(wallet.pubkey);
      
      // Get SOL balance
      const balance = await connection.getBalance(pubkey);
      const solBalance = balance / LAMPORTS_PER_SOL;

      // Get token accounts
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
        programId: TOKEN_PROGRAM_ID
      });

      const tokens = tokenAccounts.value.map(account => {
        const info = account.account.data.parsed.info;
        return {
          mint: info.mint,
          balance: info.tokenAmount.uiAmount,
          decimals: info.tokenAmount.decimals,
          address: account.pubkey.toBase58()
        };
      }).filter(t => t.balance > 0);

      // Update balance in DB
      await supabase
        .from('mega_whale_auto_buy_wallets')
        .update({ sol_balance: solBalance, last_balance_check: new Date().toISOString() })
        .eq('id', wallet.id);

      return new Response(JSON.stringify({
        success: true,
        wallet: {
          pubkey: wallet.pubkey,
          sol_balance: solBalance,
          tokens
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'transfer_sol') {
      if (!wallet) {
        return new Response(JSON.stringify({ success: false, error: 'No wallet found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        });
      }

      if (!recipient || !amount) {
        return new Response(JSON.stringify({ success: false, error: 'Missing recipient or amount' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        });
      }

      const connection = new Connection(RPC_URL, 'confirmed');
      
      // Decrypt secret key (handles both AES and legacy base64)
      const secretKeyDecrypted = await decryptSecret(wallet.secret_key_encrypted);
      const secretKey = bs58.decode(secretKeyDecrypted);
      const keypair = Keypair.fromSecretKey(secretKey);

      const recipientPubkey = new PublicKey(recipient);
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: recipientPubkey,
          lamports
        })
      );

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = keypair.publicKey;

      transaction.sign(keypair);
      const signature = await connection.sendRawTransaction(transaction.serialize());
      await connection.confirmTransaction(signature, 'confirmed');

      console.log(`[mega-whale-wallet-transfer] SOL transfer successful: ${signature}`);

      // Update balance
      const newBalance = await connection.getBalance(keypair.publicKey);
      await supabase
        .from('mega_whale_auto_buy_wallets')
        .update({ sol_balance: newBalance / LAMPORTS_PER_SOL, last_balance_check: new Date().toISOString() })
        .eq('id', wallet.id);

      return new Response(JSON.stringify({
        success: true,
        signature,
        new_balance: newBalance / LAMPORTS_PER_SOL
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'transfer_token') {
      if (!wallet) {
        return new Response(JSON.stringify({ success: false, error: 'No wallet found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        });
      }

      if (!recipient || !amount || !token_mint) {
        return new Response(JSON.stringify({ success: false, error: 'Missing recipient, amount, or token_mint' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        });
      }

      const connection = new Connection(RPC_URL, 'confirmed');
      
      // Decrypt secret key (handles both AES and legacy base64)
      const secretKeyDecrypted = await decryptSecret(wallet.secret_key_encrypted);
      const secretKey = bs58.decode(secretKeyDecrypted);
      const keypair = Keypair.fromSecretKey(secretKey);

      const mintPubkey = new PublicKey(token_mint);
      const recipientPubkey = new PublicKey(recipient);

      // Get source token account
      const sourceAta = await getAssociatedTokenAddress(mintPubkey, keypair.publicKey);
      
      // Get or create destination token account
      const destAta = await getAssociatedTokenAddress(mintPubkey, recipientPubkey);

      const transaction = new Transaction();

      // Check if destination ATA exists
      try {
        await getAccount(connection, destAta);
      } catch {
        // Create ATA if it doesn't exist
        transaction.add(
          createAssociatedTokenAccountInstruction(
            keypair.publicKey,
            destAta,
            recipientPubkey,
            mintPubkey
          )
        );
      }

      // Get token decimals
      const sourceAccount = await getAccount(connection, sourceAta);
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(keypair.publicKey, {
        programId: TOKEN_PROGRAM_ID
      });
      const tokenInfo = tokenAccounts.value.find(t => 
        t.account.data.parsed.info.mint === token_mint
      );
      const decimals = tokenInfo?.account.data.parsed.info.tokenAmount.decimals || 9;

      // Add transfer instruction
      const transferAmount = Math.floor(amount * Math.pow(10, decimals));
      transaction.add(
        createTransferInstruction(
          sourceAta,
          destAta,
          keypair.publicKey,
          transferAmount
        )
      );

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = keypair.publicKey;

      transaction.sign(keypair);
      const signature = await connection.sendRawTransaction(transaction.serialize());
      await connection.confirmTransaction(signature, 'confirmed');

      console.log(`[mega-whale-wallet-transfer] Token transfer successful: ${signature}`);

      return new Response(JSON.stringify({
        success: true,
        signature
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'sell_token') {
      if (!wallet || !token_mint || !amount) {
        return new Response(JSON.stringify({ success: false, error: 'Missing wallet, token_mint, or amount' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        });
      }

      // Call raydium-swap to sell
      const decryptedSecret = await decryptSecret(wallet.secret_key_encrypted);
      const { data: swapResult, error: swapError } = await supabase.functions.invoke('raydium-swap', {
        body: {
          action: 'swap',
          inputMint: token_mint,
          outputMint: 'So11111111111111111111111111111111111111112', // SOL
          amount: amount,
          slippageBps: 1500,
          walletSecretBase58: decryptedSecret
        }
      });

      if (swapError) {
        console.error(`[mega-whale-wallet-transfer] Sell error:`, swapError);
        return new Response(JSON.stringify({ success: false, error: swapError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        });
      }

      return new Response(JSON.stringify({
        success: true,
        ...swapResult
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'buy_token') {
      if (!wallet || !token_mint || !amount) {
        return new Response(JSON.stringify({ success: false, error: 'Missing wallet, token_mint, or amount' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        });
      }

      // Call raydium-swap to buy
      const decryptedSecretBuy = await decryptSecret(wallet.secret_key_encrypted);
      const { data: swapResult, error: swapError } = await supabase.functions.invoke('raydium-swap', {
        body: {
          action: 'swap',
          inputMint: 'So11111111111111111111111111111111111111112', // SOL
          outputMint: token_mint,
          amount: amount * LAMPORTS_PER_SOL, // Convert SOL to lamports
          slippageBps: 1500,
          walletSecretBase58: decryptedSecretBuy
        }
      });

      if (swapError) {
        console.error(`[mega-whale-wallet-transfer] Buy error:`, swapError);
        return new Response(JSON.stringify({ success: false, error: swapError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        });
      }

      return new Response(JSON.stringify({
        success: true,
        ...swapResult
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Unknown action' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });

  } catch (error) {
    console.error('[mega-whale-wallet-transfer] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
