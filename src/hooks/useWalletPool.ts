import { useCallback, useEffect, useMemo, useState } from "react";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import { supabase } from "@/integrations/supabase/client";

export type StoredWallet = {
  secretBase58: string; // base58-encoded 64-byte secret key
  pubkey: string;
};

export type WalletPoolState = {
  mode: "generated" | "custom";
  generated: StoredWallet[];
  custom: StoredWallet[];
};

const STORAGE_KEY = "bumpbot.walletPool.v1";

function read(): WalletPoolState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as WalletPoolState;
  } catch {}
  return null;
}

function write(v: WalletPoolState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
}

function genKeypair(): StoredWallet {
  const kp = Keypair.generate();
  return { secretBase58: bs58.encode(kp.secretKey), pubkey: kp.publicKey.toBase58() };
}

// Database operations
async function saveWalletToDatabase(wallet: StoredWallet) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('wallet_pools').insert({
      secret_key: wallet.secretBase58, // Will be encrypted by the database trigger
      pubkey: wallet.pubkey,
      user_id: user?.id,
      is_active: true
    });
  } catch (error) {
    console.warn('Failed to save wallet to database:', error);
  }
}

async function loadWalletsFromDatabase(): Promise<StoredWallet[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Use the secure decryption function to load wallet secrets
    const { data, error } = await supabase.rpc('get_wallet_pool_secrets_decrypted', {
      user_id_param: user.id
    });
    
    if (error) throw error;
    
    return data?.map(row => ({
      secretBase58: row.secret_key,
      pubkey: row.pubkey
    })) || [];
  } catch (error) {
    console.warn('Failed to load wallets from database:', error);
    return [];
  }
}

async function removeWalletFromDatabase(pubkey: string) {
  try {
    await supabase
      .from('wallet_pools')
      .update({ is_active: false })
      .eq('pubkey', pubkey);
  } catch (error) {
    console.warn('Failed to remove wallet from database:', error);
  }
}

export function useWalletPool() {
  const [state, setState] = useState<WalletPoolState>(() =>
    read() ?? { mode: "generated", generated: [], custom: [] }
  );
  const [isLoaded, setIsLoaded] = useState(false);

  // Load wallets from database on mount
  useEffect(() => {
    let mounted = true;
    
    async function loadFromDatabase() {
      const dbWallets = await loadWalletsFromDatabase();
      if (mounted && dbWallets.length > 0) {
        setState(current => {
          const localState = read() ?? { mode: "generated", generated: [], custom: [] };
          // Merge database wallets with local, avoiding duplicates
          const existingPubkeys = new Set(localState.generated.map(w => w.pubkey));
          const newWallets = dbWallets.filter(w => !existingPubkeys.has(w.pubkey));
          
          const merged = {
            ...localState,
            generated: [...localState.generated, ...newWallets]
          };
          write(merged);
          return merged;
        });
      }
      setIsLoaded(true);
    }
    
    loadFromDatabase();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (isLoaded) {
      write(state);
    }
  }, [state, isLoaded]);

  const wallets = useMemo(() => (state.mode === "generated" ? state.generated : state.custom), [state]);

  const setMode = useCallback((mode: WalletPoolState["mode"]) => setState((s) => ({ ...s, mode })), []);

  const ensureCount = useCallback((n: number, max = 10) => {
    const count = Math.max(1, Math.min(n, max));
    setState((s) => {
      if (s.mode !== "generated") return s; // only applies to generated
      const arr = [...s.generated];
      const originalLength = arr.length;
      
      while (arr.length < count) {
        const newWallet = genKeypair();
        arr.push(newWallet);
        // Save new wallets to database
        saveWalletToDatabase(newWallet);
      }
      
      if (arr.length > count) {
        // Remove wallets from database when shrinking
        const removedWallets = arr.slice(count);
        removedWallets.forEach(wallet => removeWalletFromDatabase(wallet.pubkey));
        arr.splice(count);
      }
      
      return { ...s, generated: arr };
    });
  }, []);

  const importCustomSecrets = useCallback((secrets: string[]) => {
    const sanitized: StoredWallet[] = [];
    for (const sec of secrets) {
      const s = String(sec || "").trim();
      if (!s) continue;
      try {
        let kp;
        if (s.startsWith("[")) {
          const arr = JSON.parse(s);
          kp = Keypair.fromSecretKey(new Uint8Array(arr));
        } else {
          const u8 = bs58.decode(s);
          kp = Keypair.fromSecretKey(u8.length === 64 ? u8 : Keypair.fromSeed(u8).secretKey);
        }

        sanitized.push({ secretBase58: bs58.encode(kp.secretKey), pubkey: kp.publicKey.toBase58() });
      } catch {}
    }
    setState((s) => ({ ...s, custom: sanitized.slice(0, 10) }));
  }, []);

  const removeAt = useCallback((idx: number) => {
    setState((s) => {
      const arr = s.mode === "generated" ? [...s.generated] : [...s.custom];
      const removedWallet = arr[idx];
      
      // Remove from database if it's a generated wallet
      if (s.mode === "generated" && removedWallet) {
        removeWalletFromDatabase(removedWallet.pubkey);
      }
      
      arr.splice(idx, 1);
      return s.mode === "generated" ? { ...s, generated: arr } : { ...s, custom: arr };
    });
  }, []);

  return { state, wallets, setMode, ensureCount, importCustomSecrets, removeAt } as const;
}
