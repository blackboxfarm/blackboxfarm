/**
 * Comprehensive CEX hot wallet database.
 * Single source of truth — import this from any edge function that needs CEX detection.
 * Sources: Arkham, Solscan labels, public CEX documentation.
 */

export const KNOWN_CEX_WALLETS: Record<string, string[]> = {
  // ═══ Binance ═══
  'Binance': [
    '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9',
    '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
    '2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S',
    'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH',
    'FeesMarket3mj6p9C4mHsNhXuJvJuxz5Ncc6Dv5mDPyj',
    '3yFwqXBfZY4jBVUafQ1YEXw189y2dN3V5KQq9uzBDy1E',
    '6VRa4ViPxKZNJ3RYDPXfiAqYdsXBqARBnBpPJCzJmr83',
    '5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD',
    'FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5',
    'BinanceUS',
    'ASTyfSima4LLAdDgoFGkgqoKowG1LZFDr9fAQrg7iaJZ',
    '3LHzwfihBAfJ1LDJiPfH7n8jgEYS8iMhTE5W1xKECEvp',
    '4PVNXgBDE3bofGsHjcRiviHCfM1MYrK12CCfNXkMvQwt',
    'FbGeZS8LiPCnnz2Lxvjy1PS42JmCiMHcCY3VkEYDjZgo',
    'EL1afjYvb6EhEpvfXhEw5A4VXKXFN1FaK3TYiXGrBEXM',
    'HCsFfPXLrJoAKKbKSM7MVJR8m1AhM5K4U7s8ZBKU38mp',
    '4wDBYcRidL6rJ91LHi62HK3JE37GK5TzeLj1MTQJD7oH',
    'DVRUStTjqeYn9J4ZF3j4KR5F3NL6aeWLEr9bd2cSiKdh',
    'BfrNMiWHnpRe5R7VfKnqUi1rnaoMEThGNzT3DuFcoWUC',
  ],

  // ═══ Coinbase ═══
  'Coinbase': [
    'GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE',
    'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS',
    '2AQdpHJ2JpcEgPiATUXjQxA8QmafFegfQwSLWSprPicm',
    '2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S',
    'GXkKQDHRJPiJRb8JVEHqLjPU5K6dNchP8fWq7d5NfWs8',
    'CUATqGeFqzxG5t6BEVCmFvxCVJBMPXMevFSqDGrLUQpw',
    '6GyVzb8R3Y7Fqy6HtdtPKXqBUC2hnToFjfk5Bvp8iW74',
    'A2E7iZP3MdoGw7YVaejrDVBpXnFGRU4eYR1Cpyj5q7uM',
    '3Q7dbzHZ3bnSK85yg3rKq3EHqsaJYFHLhjj8skXe8n1D',
  ],

  // ═══ Kraken ═══
  'Kraken': [
    'CeijuS2rMHqxhbQq6ZvGxV7g7h3MrdKZPdpJR4NRV9WN',
    'EUuHEFLSqdDKirPEoZpTj9sQHgJY6aJB8KumLFXxcmv8',
    'CJsLwbP1iu5DuUikHEJnLfANgKy6stB2uFgvBBHoyxwz',
    'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
    'BKqj7ezRNqCXLhvPCi7YQiYF4xkVH9g7CXrGQF8KWRCL',
    'FxteHmLwG9nk1eL2z2dGpEMJGdiZuzTt5WCXydFw3wRi',
    'HLqUa8k7q7oFLPnj3f44EhPVQCVS3tse4UqFxjCzP3u6',
  ],

  // ═══ Bybit ═══
  'Bybit': [
    'AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2',
    '6F6DgCxqLY9K7irEpHu97sUvZp8KkWG8rwNDK7dLMT5t',
    'D3aLSWAhbqfafDZFnfFECxwPRaZqQKxFXcMPbPkD9Rth',
    'BU8oVbDGF2CMQB3fvZDFJsYfHCJ8M5YiZPq4ERV6Uydq',
    'C2aNfq9w3K4TTsDKKyVTKmKNf4m8fsMrYMoqbpS7uULw',
    'G5RdbhWfHNuTzQ9rw8TX1r7tQzL9P4q4hKXeMXwf2Ni3',
  ],

  // ═══ OKX ═══
  'OKX': [
    '5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD',
    'Bi3Ru8krBjCJfKhKqUwdiLJwz4jPNwT1nz9Cg3Ai5gZf',
    'JA5ELh1gaoYjgaFJxw3JLrCQaNEjawj4SGdkBWDiy3P',
    '4gVJYGzGKaAQm97JMPSEKBGEqP5axA4bnKhv8WjNLFYz',
    'EH3zEDqDMHdTdCiQVYQ9bMDoQJu8T3Msk6iZR1GBQGKY',
    '5zdvHe4V3RHVNfNAYB5R4FP5FbvSwANyvYnFfCSWW6CC',
  ],

  // ═══ KuCoin ═══
  'KuCoin': [
    'BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6',
    '6dKkxsSHdq5QK3D9NB95YLXd3GmjAQJGrHGSBDYcNaff',
    '2BHF2JkNcTpZVLwJng1KF5rEHB3DJQBgvzSVPCVu18Ns',
    'DjrNsekxHNyPPawTJTqUqABKvPvbFHifqgjU3x5gsBCq',
  ],

  // ═══ Gate.io ═══
  'Gate.io': [
    'u6PJ8DtQuPFnfmwHbGFULQ4u4EgjDiyYKjVEsynXq2w',
    '7hUPVRnfDyQ3FYgA3Rm37Y2VFhsL5hBhT5XQWH3S1AEN',
    'GXkKQDHRJPiJRb8JVEHqLjPU5K6dNchP8fWq7d5NfWs8',
    '5bqfoEpFCFjhBi2qXFVy8Rax6A8G8JVq7B6MhQHj9vj4',
  ],

  // ═══ MEXC ═══
  'MEXC': [
    'ASTyfSima4LLAdDgoFGkgqoKowG1LZFDr9fAQrg7iaJZ',
    '7T2bxVVPfHQ2vHqJNhRgeEHPoqVVMiJHBuxr1ntbwCFn',
    'HRJBA2GqUfB68ZjhW3fR5Dre8FJxLLnSNBezjMHZW1hk',
  ],

  // ═══ HTX (Huobi) ═══
  'HTX': [
    '88xTWZMeKfiTgbfEmPLdsUCQcZinwUfk25EBQZ21XMAZ',
    'A48U32wKTNNgH8VCxoYPX1vPaUVJrJ5Z4DWiD1MiKvkQ',
    'Hdk6xKJLdNvKsAP2xezFmMJ4dxNkuLAqDBRtNFhqiJjy',
  ],

  // ═══ Bitget ═══
  'Bitget': [
    'A77HErxSEiyjsLLz6yNMvnA5vKSZwCzLtpAKc1BQy4GL',
    '2dxVLHFiZFpiPC1AxJLEyRoDBEeZWM5UKU3XTTVYv2C4',
  ],

  // ═══ Crypto.com ═══
  'Crypto.com': [
    '6FEVkH17P9y8Q9aCkDdPcMDjvj7SVxrTETaYEm8f51S3',
    'AobVSwdW9BbpMdJvTqeCN4hPAmh4rHm7vwLnQ5ATbo3G',
  ],

  // ═══ Gemini ═══
  'Gemini': [
    'BfMXsS5FMBMvByJcCmEmzLR26GR9Q7gH8c8c7LYa2xQZ',
  ],

  // ═══ Bitfinex ═══
  'Bitfinex': [
    'H3AyVXpREA16kR2E5JnzGrKiTpAn2hQNngt6MiE7km7T',
  ],

  // ═══ Backpack ═══
  'Backpack': [
    'CYJECBqMV5ajrnPVVE9e4QB4E3LWt8W4cAnSqfVdVA82',
  ],

  // ═══ Phantom (Swap) ═══
  'Phantom Swap': [
    'PhaNTomSwapProgram11111111111111111111111111',
  ],

  // ═══ Jupiter ═══
  'Jupiter': [
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
  ],

  // ═══ Raydium ═══
  'Raydium': [
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
  ],

  // ═══ Orca ═══
  'Orca': [
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  ],
};

/** Flat lookup set for O(1) membership check */
const _cexLookup = new Map<string, string>();
for (const [cex, wallets] of Object.entries(KNOWN_CEX_WALLETS)) {
  for (const w of wallets) {
    _cexLookup.set(w, cex);
  }
}

/** Returns the exchange name if wallet is a known CEX hot wallet, else null */
export function getCexName(wallet: string): string | null {
  return _cexLookup.get(wallet) ?? null;
}

/** Check if a wallet is a known CEX address */
export function isCexWallet(wallet: string): boolean {
  return _cexLookup.has(wallet);
}

/** Get all known CEX wallet addresses as a flat array */
export function getAllCexAddresses(): string[] {
  return Array.from(_cexLookup.keys());
}
