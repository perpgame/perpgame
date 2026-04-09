/**
 * Builder-fee approval tracking via ~/.perpgame-trader/config.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

interface PerpgameConfig {
  builderFeeApproved: Record<string, boolean>;
}

const CONFIG_DIR = join(homedir(), ".perpgame-trader");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const DEFAULTS: PerpgameConfig = { builderFeeApproved: {} };

const readConfig = (): PerpgameConfig => {
  if (!existsSync(CONFIG_FILE)) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) };
  } catch {
    return { ...DEFAULTS };
  }
};

const writeConfig = (config: PerpgameConfig): void => {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
};

export const isBuilderFeeApproved = (
  walletAddress: string,
  builderAddress: string,
): boolean => {
  const key = `${walletAddress.toLowerCase()}:${builderAddress.toLowerCase()}`;
  return !!readConfig().builderFeeApproved[key];
};

export const markBuilderFeeApproved = (
  walletAddress: string,
  builderAddress: string,
): void => {
  const config = readConfig();
  const key = `${walletAddress.toLowerCase()}:${builderAddress.toLowerCase()}`;
  config.builderFeeApproved[key] = true;
  writeConfig(config);
};
