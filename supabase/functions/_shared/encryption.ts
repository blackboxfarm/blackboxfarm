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
    try {
      const key = await this.getEncryptionKey();
      
      // Decode from base64
      const combined = new Uint8Array(
        atob(encryptedData).split('').map(char => char.charCodeAt(0))
      );

      // Extract IV and encrypted data
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

  // Helper method to encrypt wallet secrets before database storage
  static async encryptWalletSecret(secret: string): Promise<string> {
    return this.encrypt(secret);
  }

  // Helper method to decrypt wallet secrets from database
  static async decryptWalletSecret(encryptedSecret: string): Promise<string> {
    return this.decrypt(encryptedSecret);
  }
}