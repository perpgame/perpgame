/**
 * AES-256-GCM encrypt/decrypt for wallet private keys.
 * Uses scrypt to derive a 32-byte key from the encryption key + random salt.
 */
import {
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";

export interface WalletData {
  version: number;
  address: string;
  salt: string;
  iv: string;
  authTag: string;
  encrypted: string;
}

export const encryptPrivateKey = (
  privateKey: string,
  encryptionKey: string,
): Omit<WalletData, "address"> => {
  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const key = scryptSync(encryptionKey, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKey, "utf-8"),
    cipher.final(),
  ]);
  return {
    version: 2,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
    encrypted: encrypted.toString("hex"),
  };
};

export const decryptPrivateKey = (
  data: WalletData,
  encryptionKey: string,
): string => {
  const key = scryptSync(encryptionKey, Buffer.from(data.salt, "hex"), 32);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(data.iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(data.authTag, "hex"));
  return (
    decipher.update(Buffer.from(data.encrypted, "hex")) +
    decipher.final("utf-8")
  );
};
