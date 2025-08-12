import { useCallback, useEffect, useMemo, useState } from "react";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

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


export function useWalletPool() {
  const [state, setState] = useState<WalletPoolState>(() =>
    read() ?? { mode: "generated", generated: [], custom: [] }
  );

  useEffect(() => {
    write(state);
  }, [state]);

  const wallets = useMemo(() => (state.mode === "generated" ? state.generated : state.custom), [state]);

  const setMode = useCallback((mode: WalletPoolState["mode"]) => setState((s) => ({ ...s, mode })), []);

  const ensureCount = useCallback((n: number, max = 10) => {
    const count = Math.max(1, Math.min(n, max));
    setState((s) => {
      if (s.mode !== "generated") return s; // only applies to generated
      const arr = [...s.generated];
      while (arr.length < count) arr.push(genKeypair());
      if (arr.length > count) arr.splice(count); // shrink (does not auto-refund)
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
      arr.splice(idx, 1);
      return s.mode === "generated" ? { ...s, generated: arr } : { ...s, custom: arr };
    });
  }, []);

  return { state, wallets, setMode, ensureCount, importCustomSecrets, removeAt } as const;
}
