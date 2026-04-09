import { parseArgs } from "node:util";
import { privateKeyToAccount } from "viem/accounts";
import { loadPrivateKey } from "../wallet.js";

export async function run(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      message: { type: "string" },
    },
  });

  if (!values.message) {
    console.log(JSON.stringify({ error: "Required: --message <text>" }));
    process.exit(1);
  }

  const account = privateKeyToAccount(loadPrivateKey() as `0x${string}`);
  const signature = await account.signMessage({ message: values.message });

  console.log(JSON.stringify({
    status: "ok",
    address: account.address,
    message: values.message,
    signature,
  }));
}
