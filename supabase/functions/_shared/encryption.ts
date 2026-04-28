// Encryption utilities for securing sensitive data
// Uses AES-256-GCM for authenticated encryption

export class SecureStorage {
  private static encryptionKey: CryptoKey | null = null;

  private static async getEncryptionKey(): Promise<CryptoKey> {
    if (this.encryptionKey) {
      return this.encryptionKey;
    }

    const keyString = Deno.env.get('ENCRYPTION_KEY');
    if (!keyString) {
      throw new Error('ENCRYPTION_KEY environment variable not set');
    }

    // Convert the key string to a proper crypto key
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

  /**
   * Returns all candidate AES-GCM keys to try when decrypting.
   * Order: current ENCRYPTION_KEY first, then any legacy ENCRYPTION_KEY_V<N> slots.
   */
  private static async getAllDecryptionKeys(): Promise<{ name: string; key: CryptoKey }[]> {
    const candidates: { name: string; raw: string }[] = [];
    const primary = Deno.env.get('ENCRYPTION_KEY');
    if (primary) candidates.push({ name: 'ENCRYPTION_KEY', raw: primary });

    // Legacy slots: ENCRYPTION_KEY_V1, _V2, _V3 ...
    for (const suffix of ['V1', 'V2', 'V3']) {
      const v = Deno.env.get(`ENCRYPTION_KEY_${suffix}`);
      if (v) candidates.push({ name: `ENCRYPTION_KEY_${suffix}`, raw: v });
    }

    const out: { name: string; key: CryptoKey }[] = [];
    for (const c of candidates) {
      const keyBytes = new TextEncoder().encode(c.raw.padEnd(32, '0').slice(0, 32));
      const key = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt'],
      );
      out.push({ name: c.name, key });
    }
    return out;
  }

  static async encrypt(plaintext: string): Promise<string> {
    try {
      const key = await this.getEncryptionKey();
      const encoder = new TextEncoder();
      const data = encoder.encode(plaintext);
      
      // Generate a random IV for each encryption
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );

      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);

      // Return as base64
      return btoa(String.fromCharCode(...combined));
    } catch (error: any) {
      throw new Error(`Encryption failed: ${error?.message || String(error)}`);
    }
  }

  static async decrypt(encryptedData: string): Promise<string> {
    // Decode from base64 once
    let combined: Uint8Array;
    try {
      combined = new Uint8Array(
        atob(encryptedData).split('').map((char) => char.charCodeAt(0)),
      );
    } catch (error: any) {
      throw new Error(`Decryption failed: invalid base64 (${error?.message || String(error)})`);
    }

    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const keys = await this.getAllDecryptionKeys();
    if (keys.length === 0) {
      throw new Error('Decryption failed: no ENCRYPTION_KEY configured');
    }

    const errors: string[] = [];
    for (const { name, key } of keys) {
      try {
        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          key,
          encrypted,
        );
        if (name !== 'ENCRYPTION_KEY') {
          console.log(`[SecureStorage] Decrypted using legacy key slot: ${name}`);
        }
        return new TextDecoder().decode(decrypted);
      } catch (err: any) {
        errors.push(`${name}:${err?.message || String(err)}`);
      }
    }
    throw new Error(`Decryption failed across all keys [${errors.join(' | ')}]`);
  }

  // Helper method to encrypt wallet secrets before database storage
  static async encryptWalletSecret(secret: string): Promise<string> {
    return this.encrypt(secret);
  }

  // Helper method to decrypt wallet secrets from database
  static async decryptWalletSecret(encryptedSecret: string): Promise<string> {
    return this.decrypt(encryptedSecret);
  }
}