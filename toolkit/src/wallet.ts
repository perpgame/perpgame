/**
 * Wallet file I/O for ~/.perpgame-trader/wallet.enc
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { WalletData } from "./crypto.js";
import { decryptPrivateKey } from "./crypto.js";
import { getEncryptionKey } from "./keychain.js";

const CONFIG_DIR = join(homedir(), ".perpgame-trader");
const WALLET_FILE = join(CONFIG_DIR, "wallet.enc");

export const walletExists = (): boolean => existsSync(WALLET_FILE);

export const walletPath = (): string => WALLET_FILE;

export const readWalletFile = (): WalletData =>
  JSON.parse(readFileSync(WALLET_FILE, "utf-8"));

export const writeWalletFile = (data: WalletData): void => {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(WALLET_FILE, JSON.stringify(data), { mode: 0o600 });
};

/**
 * Single entry point for all scripts that need the private key.
 * Reads wallet file, resolves encryption key, decrypts, returns the key.
 * Exits the process with a JSON error on failure.
 */
export const loadPrivateKey = (): string => {
  if (!walletExists()) {
    console.log(JSON.stringify({ error: "No wallet found. Run create-wallet or import-wallet first." }));
    process.exit(1);
  }
  const encKey = getEncryptionKey();
  if (!encKey) {
    console.log(JSON.stringify({ error: "Encryption key not found. Set PERPGAME_ENCRYPTION_KEY or ensure OS keychain is accessible." }));
    process.exit(1);
  }
  try {
    return decryptPrivateKey(readWalletFile(), encKey);
  } catch {
    console.log(JSON.stringify({ error: "Failed to decrypt wallet." }));
    process.exit(1);
  }
};
