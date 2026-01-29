// Universal wallet secret decryption utility
// Handles multiple encryption formats:
// 1. AES:xxx – AES-256-GCM with "AES:" prefix (current format)
// 2. Raw base64 of AES-256-GCM payload (legacy, missing prefix)
// 3. Plain base64-encoded secret (fallback when ENCRYPTION_KEY was missing at encrypt time)
// 4. Raw plaintext private key (base58 or JSON array)

import { SecureStorage } from "./encryption.ts";
import bs58 from "https://esm.sh/bs58@6.0.0";

/**
 * Attempts to decrypt a wallet secret stored in the database.
 * Tries multiple strategies to maximise backwards compatibility.
 */
export async function decryptWalletSecretAuto(raw: string): Promise<string> {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) throw new Error("Empty wallet secret");

  // 1. If it's prefixed with "AES:" — strip prefix and decrypt via SecureStorage
  if (trimmed.startsWith("AES:")) {
    const payload = trimmed.slice(4);
    return await SecureStorage.decryptWalletSecret(payload);
  }

  // 2. Check if it looks like a valid plaintext Solana private key already (base58 or JSON)
  if (isValidPlaintextKey(trimmed)) {
    console.log("[decryptWalletSecretAuto] Value appears to be plaintext private key");
    return trimmed;
  }

  // 3. Try AES-256-GCM decryption on raw base64 (legacy without prefix)
  try {
    const decrypted = await SecureStorage.decryptWalletSecret(trimmed);
    // Validate decrypted result looks like a key
    if (isValidPlaintextKey(decrypted)) {
      console.log("[decryptWalletSecretAuto] AES decryption succeeded (no prefix)");
      return decrypted;
    }
  } catch {
    // Continue to next fallback
  }

  // 4. Fallback: plain base64-encoded secret (when ENCRYPTION_KEY was missing during encrypt)
  try {
    const decoded = atob(trimmed);
    if (isValidPlaintextKey(decoded)) {
      console.log("[decryptWalletSecretAuto] Plain base64 decode succeeded");
      return decoded;
    }
  } catch {
    // Not valid base64
  }

  throw new Error("Decryption failed: could not decrypt or decode wallet secret");
}

/**
 * Check if a string looks like a valid Solana private key:
 * - Base58 string of 64 or 32 bytes when decoded
 * - JSON array of numbers (>= 32 elements)
 */
function isValidPlaintextKey(value: string): boolean {
  const v = value.trim();
  if (!v) return false;

  // JSON array format
  if (v.startsWith("[")) {
    try {
      const arr = JSON.parse(v);
      return Array.isArray(arr) && arr.length >= 32 && arr.every((n: unknown) => typeof n === "number");
    } catch {
      return false;
    }
  }

  // Base58 format (alphanum, no 0OIl, typically 87-88 chars for 64 bytes)
  if (/^[1-9A-HJ-NP-Za-km-z]{32,128}$/.test(v)) {
    try {
      const decoded = bs58.decode(v);
      return decoded.length === 64 || decoded.length === 32;
    } catch {
      return false;
    }
  }

  return false;
}
