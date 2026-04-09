/**
 * Encryption-key management -- OS keychain with env var override and file fallback.
 *
 * Resolution order:
 *   1. PERPGAME_ENCRYPTION_KEY env var
 *   2. macOS Keychain (via `security` CLI)
 *   3. Fallback file ~/.perpgame-trader/.encryption-key
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";

const SERVICE = "perpgame-trader";
const ACCOUNT = "encryption-key";
const CONFIG_DIR = join(homedir(), ".perpgame-trader");
const FALLBACK_FILE = join(CONFIG_DIR, ".encryption-key");

const keychainGet = (): string | null => {
  if (process.platform !== "darwin") return null;
  try {
    const out = execFileSync(
      "security",
      ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"],
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return out.trim() || null;
  } catch {
    return null;
  }
};

const keychainSet = (hex: string): boolean => {
  if (process.platform !== "darwin") return false;
  try {
    execFileSync(
      "security",
      ["add-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w", hex, "-U"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    return true;
  } catch {
    return false;
  }
};

const fileGet = (): string | null => {
  if (!existsSync(FALLBACK_FILE)) return null;
  return readFileSync(FALLBACK_FILE, "utf-8").trim() || null;
};

const fileSet = (hex: string): void => {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(FALLBACK_FILE, hex, { mode: 0o600 });
};

/** Retrieve the encryption key. Returns null if none is stored. */
export const getEncryptionKey = (): string | null =>
  process.env.PERPGAME_ENCRYPTION_KEY || keychainGet() || fileGet();

/** Store the encryption key. Tries Keychain first, falls back to file. */
export const setEncryptionKey = (hex: string): void => {
  if (keychainSet(hex)) return;
  fileSet(hex);
  process.stderr.write(
    `Note: Keychain unavailable. Encryption key stored in ${FALLBACK_FILE}\n`,
  );
};

/** Get existing key or generate + store a new one. Always returns a key. */
export const ensureEncryptionKey = (): string => {
  const existing = getEncryptionKey();
  if (existing) return existing;
  const key = randomBytes(32).toString("hex");
  setEncryptionKey(key);
  return key;
};
