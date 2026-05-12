// Shared logic for the admin "Find Dev & KYC" / "Find KYC" buttons.
// Fire-and-forget background resolution with toast updates; multiple rows
// can be in flight in parallel.
//
// `runFindDevAndKyc`  — resolves dev wallet for a token mint, then traces KYC.
// `runFindKyc`        — traces KYC for an already-known dev wallet.
//
// Both honour a global per-key in-flight registry so the same row can't
// double-fire while a job is running, but every other row remains clickable.

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const inFlight = new Set<string>();

/** 60-second hard cap per stage so a stuck toast eventually resolves. */
const STAGE_TIMEOUT_MS = 60_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then(v => { clearTimeout(id); resolve(v); },
           e => { clearTimeout(id); reject(e); });
  });
}

export type KycResult = {
  kycRoot: string | null;
  kycRootLabel: string | null;
  chainDepth: number;
};

export type FindDevKycResult = {
  devWallet: string | null;
  kyc: KycResult | null;
};

/**
 * Run the full Find Dev + KYC pipeline for a single token mint.
 * Emits two toasts: dev-wallet result, then KYC result. Caller passes
 * `onDevResolved` / `onKycResolved` to update the row in place.
 */
export async function runFindDevAndKyc(opts: {
  tokenMint: string;
  symbol?: string | null;
  onDevResolved?: (devWallet: string) => void;
  onKycResolved?: (kyc: KycResult) => void;
}): Promise<FindDevKycResult> {
  const key = `dev:${opts.tokenMint}`;
  if (inFlight.has(key)) {
    toast.info(`Already hunting ${opts.symbol || opts.tokenMint.slice(0, 6)}…`);
    return { devWallet: null, kyc: null };
  }
  inFlight.add(key);

  const label = opts.symbol ? `$${opts.symbol}` : opts.tokenMint.slice(0, 6) + "…";
  const toastId = `find-dev-${opts.tokenMint}`;
  toast.loading(`Hunting dev wallet for ${label}…`, { id: toastId });

  try {
    // Step 1: resolve dev wallet
    const { data, error } = await withTimeout(
      supabase.functions.invoke("creator-wallet-resolver", {
        body: { tokenMint: opts.tokenMint, batchSize: 1 },
      }) as Promise<{ data: any; error: any }>,
      STAGE_TIMEOUT_MS,
      "Dev wallet hunt",
    );
    if (error) throw new Error(error.message || "resolver failed");
    const r = data?.results?.[0];
    if (!r?.ok || !r.creator) {
      toast.error(`No dev wallet found for ${label}`, { id: toastId });
      return { devWallet: null, kyc: null };
    }
    const devWallet: string = r.creator;
    opts.onDevResolved?.(devWallet);
    toast.success(
      `Dev wallet: ${devWallet.slice(0, 6)}…${devWallet.slice(-4)} — tracing KYC…`,
      { id: toastId, duration: 4000 },
    );

    // Step 2: trace KYC for that dev wallet — separate toast id so both stay visible briefly
    const kycToastId = `find-kyc-${devWallet}`;
    toast.loading(`Tracing KYC for ${devWallet.slice(0, 6)}…`, { id: kycToastId });
    const kyc = await traceKyc(devWallet);
    if (kyc.kycRoot) {
      toast.success(
        `KYC: ${kyc.kycRootLabel || "Unknown CEX"} · ${kyc.kycRoot.slice(0, 6)}…${kyc.kycRoot.slice(-4)}`,
        { id: kycToastId, duration: 6000 },
      );
      opts.onKycResolved?.(kyc);
    } else {
      toast.error(`KYC trail ended — no CEX root for ${devWallet.slice(0, 6)}…`, { id: kycToastId, duration: 6000 });
    }
    return { devWallet, kyc };
  } catch (e: any) {
    toast.error(`Failed: ${e?.message || "unknown error"}`, { id: toastId, duration: 5000 });
    return { devWallet: null, kyc: null };
  } finally {
    inFlight.delete(key);
  }
}

/** Run KYC trace only — dev wallet already known. */
export async function runFindKyc(opts: {
  devWallet: string;
  onKycResolved?: (kyc: KycResult) => void;
}): Promise<KycResult | null> {
  const key = `kyc:${opts.devWallet}`;
  if (inFlight.has(key)) {
    toast.info(`Already tracing ${opts.devWallet.slice(0, 6)}…`);
    return null;
  }
  inFlight.add(key);

  const toastId = `find-kyc-${opts.devWallet}`;
  toast.loading(`Tracing KYC for ${opts.devWallet.slice(0, 6)}…`, { id: toastId });
  try {
    const kyc = await traceKyc(opts.devWallet);
    if (kyc.kycRoot) {
      toast.success(
        `KYC: ${kyc.kycRootLabel || "Unknown CEX"} · ${kyc.kycRoot.slice(0, 6)}…${kyc.kycRoot.slice(-4)}`,
        { id: toastId, duration: 6000 },
      );
      opts.onKycResolved?.(kyc);
    } else {
      toast.error(`KYC trail ended — no CEX root`, { id: toastId, duration: 6000 });
    }
    return kyc;
  } catch (e: any) {
    toast.error(`KYC trace failed: ${e?.message || "unknown"}`, { id: toastId, duration: 5000 });
    return null;
  } finally {
    inFlight.delete(key);
  }
}

async function traceKyc(walletAddress: string): Promise<KycResult> {
  const { data, error } = await withTimeout(
    supabase.functions.invoke("mesh-kyc-deep-search", {
      body: { walletAddress, maxDepth: 6, discoverBundle: false },
    }) as Promise<{ data: any; error: any }>,
    STAGE_TIMEOUT_MS,
    "KYC trace",
  );
  if (error) throw new Error(error.message || "kyc trace failed");
  return {
    kycRoot: data?.kycRoot ?? null,
    kycRootLabel: data?.kycRootLabel ?? data?.kycRootCex ?? null,
    chainDepth: data?.chainDepth ?? 0,
  };
}

export function isFindDevKycInFlight(tokenMint: string): boolean {
  return inFlight.has(`dev:${tokenMint}`);
}
export function isFindKycInFlight(devWallet: string): boolean {
  return inFlight.has(`kyc:${devWallet}`);
}