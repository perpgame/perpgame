import { parseArgs } from "node:util";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ensureEncryptionKey } from "../keychain.js";
import { encryptPrivateKey } from "../crypto.js";
import { walletExists, walletPath, writeWalletFile } from "../wallet.js";

export async function run(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      force: { type: "boolean", default: false },
    },
  });

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

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const encKey = ensureEncryptionKey();
  const encrypted = encryptPrivateKey(privateKey, encKey);

  writeWalletFile({ ...encrypted, address: account.address });

  console.log(
    JSON.stringify({
      status: "created",
      address: account.address,
      keyFile: walletPath(),
    }),
  );
}
