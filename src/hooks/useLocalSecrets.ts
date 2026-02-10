import { useCallback, useEffect, useMemo, useState } from "react";

export type Secrets = {
  rpcUrl: string;
  tradingPrivateKey: string; // base58 or JSON array
  functionToken?: string; // optional header for protected edge functions
};

const STORAGE_KEY = "bumpbot.secrets";

export function readSecrets(): Secrets | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.rpcUrl === "string") {
      // Strip private key from localStorage on read (security fix)
      if (parsed.tradingPrivateKey && parsed.tradingPrivateKey !== '***') {
        parsed.tradingPrivateKey = '***';
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        console.log('[security] Stripped plaintext trading key from localStorage');
      }
      return { ...parsed, tradingPrivateKey: parsed.tradingPrivateKey || '***' } as Secrets;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSecrets(next: Secrets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearSecrets() {
  localStorage.removeItem(STORAGE_KEY);
}

function isLikelyHttpsUrl(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

function isLikelyPrivateKey(v: string) {
  if (!v) return false;
  if (v.trim().startsWith("[")) {
    // JSON array of numbers (solana-cli style)
    try {
      const arr = JSON.parse(v);
      return Array.isArray(arr) && arr.length >= 32;
    } catch {
      return false;
    }
  }
  // Base58-ish quick check (alphanum no 0OIl)
  return /^[1-9A-HJ-NP-Za-km-z]{32,120}$/.test(v.trim());
}

export function useLocalSecrets() {
  const [secrets, setSecrets] = useState<Secrets | null>(() => readSecrets());

  const ready = useMemo(() => !!(secrets?.rpcUrl && secrets?.tradingPrivateKey), [secrets]);

  const update = useCallback((next: Secrets) => {
    saveSecrets(next);
    setSecrets(next);
  }, []);

  const reset = useCallback(() => {
    clearSecrets();
    setSecrets(null);
  }, []);

  // keep in sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setSecrets(readSecrets());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { secrets, ready, update, reset } as const;
}
