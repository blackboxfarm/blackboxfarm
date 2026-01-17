/**
 * JITO CLIENT - MEV-Protected Transaction Submission
 * 
 * Submits transactions through Jito's private block engine to prevent:
 * - Front-running attacks
 * - Sandwich attacks  
 * - MEV extraction
 * 
 * Transactions either execute at the quoted price or fail entirely.
 * No API key needed - just pay a small tip to validators.
 */

import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  VersionedTransaction,
  Transaction,
  Keypair,
} from "npm:@solana/web3.js@1.95.3";
import bs58 from "https://esm.sh/bs58@5.0.0";

// Jito tip accounts - we randomly select one to distribute tips
const JITO_TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4bVmkdzGZVJDLn2N2XJ2gK7",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
];

// Jito block engine endpoints - try multiple for reliability
const JITO_BLOCK_ENGINES = [
  "https://mainnet.block-engine.jito.wtf/api/v1/bundles",
  "https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles",
  "https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles",
  "https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles",
  "https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles",
];

export interface JitoBundleResult {
  success: boolean;
  bundleId?: string;
  signature?: string;
  error?: string;
  usedEngine?: string;
}

export interface JitoConfig {
  useJito: boolean;
  tipLamports: number;  // e.g., 10000 = 0.00001 SOL
  maxRetries: number;
  timeoutMs: number;
}

const DEFAULT_JITO_CONFIG: JitoConfig = {
  useJito: true,
  tipLamports: 10000,  // ~$0.002 at $200 SOL
  maxRetries: 3,
  timeoutMs: 30000,
};

/**
 * Get a random Jito tip account
 */
function getRandomTipAccount(): PublicKey {
  const idx = Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length);
  return new PublicKey(JITO_TIP_ACCOUNTS[idx]);
}

/**
 * Create a tip instruction to pay Jito validators
 */
export function createJitoTipInstruction(
  payer: PublicKey,
  tipLamports: number = DEFAULT_JITO_CONFIG.tipLamports
): TransactionInstruction {
  const tipAccount = getRandomTipAccount();
  
  return SystemProgram.transfer({
    fromPubkey: payer,
    toPubkey: tipAccount,
    lamports: tipLamports,
  });
}

/**
 * Add Jito tip to an existing transaction
 * Returns a new transaction with the tip instruction added at the end
 */
export function addJitoTipToTransaction(
  transaction: Transaction,
  payer: PublicKey,
  tipLamports: number = DEFAULT_JITO_CONFIG.tipLamports
): Transaction {
  const tipIx = createJitoTipInstruction(payer, tipLamports);
  transaction.add(tipIx);
  return transaction;
}

/**
 * Submit a signed transaction bundle to Jito
 * Returns the bundle ID if successful
 */
export async function submitJitoBundle(
  signedTransaction: VersionedTransaction | Transaction,
  config: Partial<JitoConfig> = {}
): Promise<JitoBundleResult> {
  const cfg = { ...DEFAULT_JITO_CONFIG, ...config };
  
  if (!cfg.useJito) {
    return {
      success: false,
      error: "Jito disabled in config",
    };
  }
  
  // Serialize the transaction
  let serialized: Uint8Array;
  if (signedTransaction instanceof VersionedTransaction) {
    serialized = signedTransaction.serialize();
  } else {
    serialized = signedTransaction.serialize();
  }
  
  const b58Tx = bs58.encode(serialized);
  
  // Try each Jito endpoint
  let lastError = "";
  
  for (let attempt = 0; attempt < cfg.maxRetries; attempt++) {
    for (const engine of JITO_BLOCK_ENGINES) {
      try {
        console.log(`[Jito] Attempt ${attempt + 1}, engine: ${engine.split('/')[2]}`);
        
        const response = await fetch(engine, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "sendBundle",
            params: [[b58Tx]]  // Array of transactions in the bundle
          }),
          signal: AbortSignal.timeout(cfg.timeoutMs)
        });
        
        if (!response.ok) {
          const text = await response.text();
          lastError = `HTTP ${response.status}: ${text}`;
          console.log(`[Jito] Engine ${engine.split('/')[2]} returned ${response.status}`);
          continue;
        }
        
        const result = await response.json();
        
        if (result.error) {
          lastError = `RPC error: ${JSON.stringify(result.error)}`;
          console.log(`[Jito] RPC error from ${engine.split('/')[2]}:`, result.error);
          continue;
        }
        
        const bundleId = result.result;
        
        if (bundleId) {
          console.log(`[Jito] ✅ Bundle submitted: ${bundleId} via ${engine.split('/')[2]}`);
          
          // Extract signature from the transaction for tracking
          let signature: string | undefined;
          if (signedTransaction instanceof VersionedTransaction) {
            signature = bs58.encode(signedTransaction.signatures[0]);
          } else {
            signature = signedTransaction.signature ? bs58.encode(signedTransaction.signature) : undefined;
          }
          
          return {
            success: true,
            bundleId,
            signature,
            usedEngine: engine,
          };
        }
        
      } catch (e) {
        lastError = (e as Error).message;
        console.log(`[Jito] Error with ${engine.split('/')[2]}:`, lastError);
      }
    }
    
    // Wait before retry
    if (attempt < cfg.maxRetries - 1) {
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  
  console.error(`[Jito] ❌ All attempts failed: ${lastError}`);
  return {
    success: false,
    error: lastError,
  };
}

/**
 * Check bundle status (optional, for monitoring)
 */
export async function checkBundleStatus(bundleId: string): Promise<{
  status: string;
  landed: boolean;
  error?: string;
}> {
  for (const engine of JITO_BLOCK_ENGINES) {
    try {
      const response = await fetch(engine.replace('/bundles', '/bundles/' + bundleId), {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000)
      });
      
      if (response.ok) {
        const result = await response.json();
        return {
          status: result.status || "unknown",
          landed: result.status === "Landed" || result.status === "Accepted",
        };
      }
    } catch (e) {
      continue;
    }
  }
  
  return {
    status: "unknown",
    landed: false,
    error: "Could not check status",
  };
}

/**
 * Fetch Jito config from database, or use defaults
 */
export async function getJitoConfig(supabase: any): Promise<JitoConfig> {
  try {
    const { data } = await supabase
      .from("flipit_settings")
      .select("use_jito_bundles, jito_tip_lamports")
      .single();
    
    if (data) {
      return {
        ...DEFAULT_JITO_CONFIG,
        useJito: data.use_jito_bundles ?? DEFAULT_JITO_CONFIG.useJito,
        tipLamports: data.jito_tip_lamports ?? DEFAULT_JITO_CONFIG.tipLamports,
      };
    }
  } catch (e) {
    console.log("[Jito] No custom config found, using defaults");
  }
  
  return DEFAULT_JITO_CONFIG;
}
