import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction,
  SystemProgram,
} from "https://esm.sh/@solana/web3.js@1.87.6";
import { 
  createCloseAccountInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "https://esm.sh/@solana/spl-token@0.3.8";
import { getHeliusRpcUrl, getHeliusApiKey } from '../_shared/helius-client.ts';

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

// Encryption utilities (duplicated from _shared for edge function isolation)
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

  static async decrypt(encryptedData: string): Promise<string> {
    try {
      const key = await this.getEncryptionKey();
      const combined = new Uint8Array(
        atob(encryptedData).split('').map(char => char.charCodeAt(0))
      );
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
      );

      return new TextDecoder().decode(decrypted);
    } catch (error: any) {
      throw new Error(`Decryption failed: ${error?.message || String(error)}`);
    }
  }
}

// Parse secret key to Keypair - handles multiple formats
function parseSecretKey(secretData: string, isEncrypted: boolean): Keypair {
  let keyData = secretData;
  
  // Try to parse as JSON array first (most common format for encrypted keys)
  try {
    const parsed = JSON.parse(keyData);
    if (Array.isArray(parsed)) {
      return Keypair.fromSecretKey(new Uint8Array(parsed));
    }
  } catch {
    // Not JSON, try base58
  }
  
  // Try base58 decode (common for raw/unencrypted keys)
  try {
    // Base58 decode
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const base58ToBytes = (str: string): Uint8Array => {
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
    };
    
    const decoded = base58ToBytes(keyData);
    if (decoded.length === 64) {
      return Keypair.fromSecretKey(decoded);
    }
  } catch {
    // Not valid base58
  }
  
  throw new Error('Unable to parse secret key format');
}

// Confirm transaction using HTTP polling (avoids WebSocket issues in Deno)
async function confirmTransactionPolling(
  connection: Connection,
  signature: string,
  blockhash: string,
  lastValidBlockHeight: number,
  maxRetries = 30
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const status = await connection.getSignatureStatus(signature);
      
      if (status?.value?.confirmationStatus === 'confirmed' || 
          status?.value?.confirmationStatus === 'finalized') {
        return;
      }
      
      if (status?.value?.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
      }
      
      // Check if blockhash expired
      const currentBlockHeight = await connection.getBlockHeight();
      if (currentBlockHeight > lastValidBlockHeight) {
        throw new Error('Transaction expired - blockhash no longer valid');
      }
      
    } catch (err: any) {
      if (err.message.includes('Transaction failed') || err.message.includes('expired')) {
        throw err;
      }
      // Ignore transient errors and retry
    }
    
    // Wait 1 second between polls
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`Transaction confirmation timeout after ${maxRetries} attempts`);
}

// Wallet source configurations
const WALLET_SOURCES = [
  { table: 'super_admin_wallets', pubkeyCol: 'pubkey', secretCol: 'secret_key_encrypted', activeCol: 'is_active', label: 'Super Admin', encrypted: true },
  { table: 'blackbox_wallets', pubkeyCol: 'pubkey', secretCol: 'secret_key_encrypted', activeCol: 'is_active', label: 'Blackbox', encrypted: true },
  { table: 'wallet_pools', pubkeyCol: 'pubkey', secretCol: 'secret_key_encrypted', activeCol: 'is_active', label: 'Wallet Pool', encrypted: true },
  { table: 'airdrop_wallets', pubkeyCol: 'pubkey', secretCol: 'secret_key_encrypted', activeCol: 'is_active', label: 'Airdrop', encrypted: true },
  { table: 'mega_whale_auto_buy_wallets', pubkeyCol: 'pubkey', secretCol: 'secret_key_encrypted', activeCol: 'is_active', label: 'Mega Whale', encrypted: true },
  { table: 'rent_reclaimer_wallets', pubkeyCol: 'pubkey', secretCol: 'secret_key_encrypted', activeCol: 'is_active', label: 'Custom', encrypted: true },
];

// Rent per token account (approximately 0.00203 SOL)
const RENT_PER_ACCOUNT = 0.00203928;
const MAX_CLOSE_PER_TX = 20; // Max accounts to close in one transaction

interface WalletInfo {
  id: string;
  pubkey: string;
  secretKeyEncrypted: string;
  source: string;
  encrypted: boolean;
}

interface EmptyAccount {
  pubkey: PublicKey;
  mint: string;
  programId: PublicKey;
}

interface ScanResult {
  walletPubkey: string;
  source: string;
  emptyAccountCount: number;
  estimatedRecoverySol: number;
  accounts: { mint: string; programId: string }[];
}

interface CleanResult {
  walletPubkey: string;
  source: string;
  accountsClosed: number;
  solRecovered: number;
  signatures: string[];
  errors: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'scan'; // scan, clean, clean_all
    const walletPubkey = body.walletPubkey; // Optional: specific wallet to process
    const source = body.source; // Optional: specific source table to process

    console.log(`Token Account Cleaner - action: ${action}, wallet: ${walletPubkey || 'all'}, source: ${source || 'all'}`);

    // Setup RPC connection
    const heliusKey = getHeliusApiKey();
    const rpcUrl = heliusKey 
      ? getHeliusRpcUrl(heliusKey)
      : "https://api.mainnet-beta.solana.com";
    
    const connection = new Connection(rpcUrl, "confirmed");

    // Fetch all wallets from all sources
    const allWallets: WalletInfo[] = [];
    
    for (const src of WALLET_SOURCES) {
      // Skip if specific source requested and doesn't match
      if (source && src.table !== source) continue;

      try {
        const { data: wallets, error } = await supabase
          .from(src.table)
          .select(`id, ${src.pubkeyCol}, ${src.secretCol}`)
          .eq(src.activeCol, true);

        if (error) {
          console.error(`Error fetching from ${src.table}:`, error.message);
          continue;
        }

        if (wallets && wallets.length > 0) {
          for (const w of wallets) {
            // Filter by specific wallet if requested
            if (walletPubkey && w[src.pubkeyCol] !== walletPubkey) continue;
            
            allWallets.push({
              id: w.id,
              pubkey: w[src.pubkeyCol],
              secretKeyEncrypted: w[src.secretCol],
              source: src.label,
              encrypted: src.encrypted,
            });
          }
        }
        console.log(`Loaded ${wallets?.length || 0} wallets from ${src.table}`);
      } catch (err: any) {
        console.error(`Failed to query ${src.table}:`, err.message);
      }
    }

    console.log(`Total wallets to process: ${allWallets.length}`);

    if (allWallets.length === 0) {
      return ok({ 
        message: "No wallets found to process",
        walletsProcessed: 0,
        totalRecoverable: 0,
      });
    }

    // SCAN: Find empty token accounts
    if (action === 'scan') {
      const scanResults: ScanResult[] = [];
      let totalEmptyAccounts = 0;
      let totalRecoverableSol = 0;

      for (const wallet of allWallets) {
        try {
          const emptyAccounts = await findEmptyTokenAccounts(connection, new PublicKey(wallet.pubkey));
          
          if (emptyAccounts.length > 0) {
            const estimatedRecovery = emptyAccounts.length * RENT_PER_ACCOUNT;
            totalEmptyAccounts += emptyAccounts.length;
            totalRecoverableSol += estimatedRecovery;

            scanResults.push({
              walletPubkey: wallet.pubkey,
              source: wallet.source,
              emptyAccountCount: emptyAccounts.length,
              estimatedRecoverySol: estimatedRecovery,
              accounts: emptyAccounts.map(a => ({ 
                mint: a.mint, 
                programId: a.programId.toBase58() 
              })),
            });
          }
        } catch (err: any) {
          console.error(`Error scanning wallet ${wallet.pubkey}:`, err.message);
        }
      }

      return ok({
        success: true,
        action: 'scan',
        walletsScanned: allWallets.length,
        walletsWithEmptyAccounts: scanResults.length,
        totalEmptyAccounts,
        totalRecoverableSol: parseFloat(totalRecoverableSol.toFixed(6)),
        results: scanResults.map(r => ({
          wallet_pubkey: r.walletPubkey,
          source: r.source,
          empty_accounts: r.accounts,
          total_recoverable_sol: r.estimatedRecoverySol,
        })),
      });
    }

    // CLEAN or CLEAN_ALL: Close empty accounts and reclaim rent
    if (action === 'clean' || action === 'clean_all') {
      const cleanResults: CleanResult[] = [];
      let totalClosed = 0;
      let totalRecovered = 0;

      // Rent stays in each wallet - NO consolidation/cross-wallet transfers (bundle-safe)

      for (const wallet of allWallets) {
        try {
          console.log(`Processing wallet ${wallet.pubkey} (${wallet.source})...`);
          
          // Find empty accounts
          const emptyAccounts = await findEmptyTokenAccounts(connection, new PublicKey(wallet.pubkey));
          
          if (emptyAccounts.length === 0) {
            console.log(`No empty accounts in ${wallet.pubkey}`);
            continue;
          }

          console.log(`Found ${emptyAccounts.length} empty accounts in ${wallet.pubkey}`);

          // Decrypt/parse the private key
          let keypair: Keypair;
          try {
            let keyData = wallet.secretKeyEncrypted;
            
            // Decrypt if encrypted
            if (wallet.encrypted) {
              keyData = await SecureStorage.decrypt(wallet.secretKeyEncrypted);
            }
            
            // Parse the key data (handles JSON array and base58 formats)
            keypair = parseSecretKey(keyData, wallet.encrypted);
          } catch (decryptErr: any) {
            console.error(`Failed to decrypt wallet ${wallet.pubkey}:`, decryptErr.message);
            cleanResults.push({
              walletPubkey: wallet.pubkey,
              source: wallet.source,
              accountsClosed: 0,
              solRecovered: 0,
              signatures: [],
              errors: [`Decryption failed: ${decryptErr.message}`],
            });
            continue;
          }

          // Close accounts in batches
          const result = await closeEmptyAccounts(connection, keypair, emptyAccounts);
          
          totalClosed += result.closed;
          totalRecovered += result.recovered;

          const cleanResult: CleanResult = {
            walletPubkey: wallet.pubkey,
            source: wallet.source,
            accountsClosed: result.closed,
            solRecovered: result.recovered,
            signatures: result.signatures,
            errors: result.errors,
          };



          cleanResults.push(cleanResult);

          // Log to database
          if (result.closed > 0) {
            await supabase.from('token_account_cleanup_logs').insert({
              wallet_pubkey: wallet.pubkey,
              wallet_source: wallet.source,
              accounts_closed: result.closed,
              sol_recovered: result.recovered,
              transaction_signatures: result.signatures,
            });
          }

        } catch (err: any) {
          console.error(`Error cleaning wallet ${wallet.pubkey}:`, err.message);
          cleanResults.push({
            walletPubkey: wallet.pubkey,
            source: wallet.source,
            accountsClosed: 0,
            solRecovered: 0,
            signatures: [],
            errors: [err.message],
          });
        }
      }

      return ok({
        success: true,
        action,
        wallets_processed: allWallets.length,
        total_accounts_closed: totalClosed,
        total_sol_recovered: parseFloat(totalRecovered.toFixed(6)),
        results: cleanResults.map(r => ({
          wallet_pubkey: r.walletPubkey,
          source: r.source,
          accounts_closed: r.accountsClosed,
          sol_recovered: r.solRecovered,
          signatures: r.signatures,
          errors: r.errors,
        })),
      });
    }

    // CONSOLIDATE_ALL: Transfer all SOL from all wallets to FlipIt wallet (no token account cleaning)
    if (action === 'consolidate_all') {
      console.log(`\n=== CONSOLIDATE ALL ACTION ===`);
      
      // Get the main FlipIt wallet
      const { data: flipitWallets, error: flipitErr } = await supabase
        .from('super_admin_wallets')
        .select('id, pubkey, secret_key_encrypted')
        .eq('wallet_type', 'flipit')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1);

      const mainFlipItWallet = flipitWallets?.[0];
      if (!mainFlipItWallet) {
        return bad("No FlipIt wallet found for consolidation");
      }

      console.log(`Consolidating all SOL to FlipIt wallet: ${mainFlipItWallet.pubkey}`);
      
      const flipItPubkey = new PublicKey(mainFlipItWallet.pubkey);
      const FEE_BUFFER_LAMPORTS = 5000; // 0.000005 SOL for transaction fee
      const MIN_TRANSFER_LAMPORTS = 10000; // Minimum 0.00001 SOL to bother transferring

      let totalTransferred = 0;
      let walletsProcessed = 0;
      const transferSignatures: string[] = [];
      const transferErrors: string[] = [];

      for (const wallet of allWallets) {
        // Skip if this is the FlipIt wallet
        if (wallet.pubkey === mainFlipItWallet.pubkey) {
          console.log(`Skipping FlipIt wallet itself`);
          continue;
        }

        try {
          // Decrypt/parse the private key
          let keypair: Keypair;
          try {
            let keyData = wallet.secretKeyEncrypted;
            
            if (wallet.encrypted) {
              keyData = await SecureStorage.decrypt(wallet.secretKeyEncrypted);
            }
            
            keypair = parseSecretKey(keyData, wallet.encrypted);
          } catch (decryptErr: any) {
            console.error(`Failed to decrypt wallet ${wallet.pubkey}:`, decryptErr.message);
            transferErrors.push(`${wallet.pubkey} (${wallet.source}): Decryption failed`);
            continue;
          }

          // Get current balance
          const balance = await connection.getBalance(keypair.publicKey);
          const transferAmount = balance - FEE_BUFFER_LAMPORTS;

          if (transferAmount < MIN_TRANSFER_LAMPORTS) {
            console.log(`Wallet ${wallet.pubkey} has insufficient balance (${balance / 1e9} SOL)`);
            continue;
          }

          console.log(`Transferring ${transferAmount / 1e9} SOL from ${wallet.pubkey} (${wallet.source})`);

          const transaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: keypair.publicKey,
              toPubkey: flipItPubkey,
              lamports: transferAmount,
            })
          );

          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
          transaction.recentBlockhash = blockhash;
          transaction.feePayer = keypair.publicKey;

          transaction.sign(keypair);
          const signature = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          });

          await confirmTransactionPolling(connection, signature, blockhash, lastValidBlockHeight);

          transferSignatures.push(signature);
          totalTransferred += transferAmount / 1e9;
          walletsProcessed++;

          console.log(`Transferred ${transferAmount / 1e9} SOL in tx ${signature}`);

          // Small delay between transfers
          await new Promise(resolve => setTimeout(resolve, 300));

        } catch (err: any) {
          console.error(`Error consolidating from ${wallet.pubkey}:`, err.message);
          transferErrors.push(`${wallet.pubkey} (${wallet.source}): ${err.message}`);
        }
      }

      // Log the consolidation
      if (totalTransferred > 0) {
        await supabase.from('token_account_cleanup_logs').insert({
          wallet_pubkey: mainFlipItWallet.pubkey,
          wallet_source: 'Full Consolidation (FlipIt)',
          accounts_closed: 0,
          sol_recovered: totalTransferred,
          transaction_signatures: transferSignatures,
        });
      }

      return ok({
        success: true,
        action: 'consolidate_all',
        target_wallet: mainFlipItWallet.pubkey,
        wallets_scanned: allWallets.length,
        wallets_processed: walletsProcessed,
        total_transferred: parseFloat(totalTransferred.toFixed(6)),
        signatures: transferSignatures,
        errors: transferErrors,
      });
    }

    return bad(`Unknown action: ${action}. Use 'scan', 'clean', 'clean_all', or 'consolidate_all'.`);

  } catch (err: any) {
    console.error("Token Account Cleaner error:", err);
    return bad(err.message || "Unknown error", 500);
  }
});

// Find all token accounts with zero balance
async function findEmptyTokenAccounts(connection: Connection, walletPubkey: PublicKey): Promise<EmptyAccount[]> {
  const emptyAccounts: EmptyAccount[] = [];

  // Check both token programs
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    try {
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, { programId });
      
      for (const account of tokenAccounts.value) {
        const info = account.account.data.parsed?.info;
        if (info && info.tokenAmount?.uiAmount === 0) {
          emptyAccounts.push({
            pubkey: account.pubkey,
            mint: info.mint,
            programId,
          });
        }
      }
    } catch (err: any) {
      console.error(`Error fetching token accounts for program ${programId.toBase58()}:`, err.message);
    }
  }

  return emptyAccounts;
}

// Close empty token accounts and reclaim rent
async function closeEmptyAccounts(
  connection: Connection, 
  owner: Keypair, 
  accounts: EmptyAccount[]
): Promise<{ closed: number; recovered: number; signatures: string[]; errors: string[] }> {
  const signatures: string[] = [];
  const errors: string[] = [];
  let closed = 0;

  // Process in batches
  for (let i = 0; i < accounts.length; i += MAX_CLOSE_PER_TX) {
    const batch = accounts.slice(i, i + MAX_CLOSE_PER_TX);
    
    try {
      const transaction = new Transaction();
      
      for (const account of batch) {
        transaction.add(
          createCloseAccountInstruction(
            account.pubkey,           // Account to close
            owner.publicKey,          // Destination for rent
            owner.publicKey,          // Authority (owner)
            [],                       // Multi-signers (none)
            account.programId         // Token program
          )
        );
      }

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = owner.publicKey;

      // Sign and send
      transaction.sign(owner);
      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      // Wait for confirmation
      await confirmTransactionPolling(connection, signature, blockhash, lastValidBlockHeight);

      signatures.push(signature);
      closed += batch.length;
      console.log(`Closed ${batch.length} accounts in tx ${signature}`);

      // Small delay between batches to avoid rate limiting
      if (i + MAX_CLOSE_PER_TX < accounts.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

    } catch (err: any) {
      console.error(`Error closing batch:`, err.message);
      errors.push(`Batch ${Math.floor(i / MAX_CLOSE_PER_TX)}: ${err.message}`);
    }
  }

  const recovered = closed * RENT_PER_ACCOUNT;
  return { closed, recovered, signatures, errors };
}
