
// Secure Client-Side Auth Logic

// 1. Derive Key from Password (PBKDF2)
// UPDATED: Uses deriveBits to ensure exact parity with Node.js crypto.pbkdf2Sync
export async function deriveKey(password: string, saltHex: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  
  // Convert hex salt to buffer
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

  // 1. Get raw bits (Matches Node's Buffer output exactly)
  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    256 // Length in bits (32 bytes)
  );

  // 2. Import those bits as an AES-GCM Key
  return window.crypto.subtle.importKey(
    "raw",
    derivedBits,
    { name: "AES-GCM" },
    true, // Extractable (required for hashing verification)
    ["encrypt", "decrypt"]
  );
}

// 2. Compute Hash of Key (To verify against DB public hash)
export async function computeKeyHash(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey("raw", key);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", exported);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// 3. Decrypt Payload (The Admin Token)
export async function decryptPayload(key: CryptoKey, ivHex: string, cipherTextHex: string): Promise<string> {
  const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const cipherText = new Uint8Array(cipherTextHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    key,
    cipherText
  );

  return new TextDecoder().decode(decryptedBuffer);
}
