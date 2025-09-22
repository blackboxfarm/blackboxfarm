import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Enhanced encryption function using Web Crypto API with fallback
async function encryptData(plaintext: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  // Get encryption key from environment
  const keyMaterial = Deno.env.get("ENCRYPTION_KEY");
  if (!keyMaterial) {
    console.log("⚠️ No ENCRYPTION_KEY found, using base64 fallback");
    return btoa(plaintext);
  }
  
  try {
    const keyData = encoder.encode(keyMaterial.padEnd(32, '0').slice(0, 32));
    
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );
    
    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt the data
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      data
    );
    
    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    // Return as base64 with AES prefix
    return "AES:" + btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error("AES encryption failed, using base64 fallback:", error);
    return btoa(plaintext);
  }
}

async function decryptData(encryptedData: string): Promise<string> {
  // Check if this is AES encrypted data
  if (encryptedData.startsWith("AES:")) {
    const keyMaterial = Deno.env.get("ENCRYPTION_KEY");
    if (!keyMaterial) {
      throw new Error("ENCRYPTION_KEY required for AES decryption");
    }
    
    try {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      
      const keyData = encoder.encode(keyMaterial.padEnd(32, '0').slice(0, 32));
      
      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
      );
      
      // Remove AES prefix and decode from base64
      const aesData = encryptedData.substring(4);
      const combined = new Uint8Array(
        atob(aesData).split('').map(char => char.charCodeAt(0))
      );
      
      // Extract IV and encrypted data
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);
      
      // Decrypt
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encrypted
      );
      
      return decoder.decode(decrypted);
    } catch (error) {
      console.error("AES decryption failed:", error);
      throw error;
    }
  } else {
    // Fallback to base64 decoding for legacy data
    try {
      return atob(encryptedData);
    } catch (error) {
      console.error("Base64 decryption failed:", error);
      // If base64 fails, it might be plain text
      return encryptedData;
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { data, action = "encrypt" } = await req.json();

    if (!data) {
      throw new Error("Data is required");
    }

    let result: string;
    
    if (action === "encrypt") {
      result = await encryptData(data);
      return new Response(
        JSON.stringify({ encryptedData: result }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    } else if (action === "decrypt") {
      result = await decryptData(data);
      return new Response(
        JSON.stringify({ decryptedData: result }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    } else {
      throw new Error("Invalid action. Use 'encrypt' or 'decrypt'");
    }

  } catch (error: any) {
    console.error("Encryption/Decryption error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});