import { parseArgs } from "node:util";
import { privateKeyToAccount } from "viem/accounts";
import { ensureEncryptionKey } from "../keychain.js";
import { encryptPrivateKey } from "../crypto.js";
import { walletExists, walletPath, writeWalletFile } from "../wallet.js";

export async function run(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      "private-key": { type: "string" },
      force: { type: "boolean", default: false },
    },
  });

  if (!values["private-key"]) {
    console.log(JSON.stringify({ error: "Missing required argument: --private-key <hex>" }));
    process.exit(1);
  }

  if (walletExists() && !values.force) {
    console.log(
      JSON.stringify({
        status: "exists",
        keyFile: walletPath(),
        message: "Wallet already exists. Use --force to overwrite.",
      }),
    );
    process.exit(0);
  }

  const pk = values["private-key"].startsWith("0x")
    ? values["private-key"]
    : `0x${values["private-key"]}`;

  let account;
  try {
    account = privateKeyToAccount(pk as `0x${string}`);
  } catch {
    console.log(JSON.stringify({ error: "Invalid private key." }));
    process.exit(1);
  }

  const encKey = ensureEncryptionKey();
  const encrypted = encryptPrivateKey(pk, encKey);

  writeWalletFile({ ...encrypted, address: account.address });

  console.log(
    JSON.stringify({
      status: "imported",
      address: account.address,
      keyFile: walletPath(),
    }),
  );
}
