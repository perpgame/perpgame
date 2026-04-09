import { parseArgs } from "node:util";
import HyperliquidClient from "../hyperliquid.js";

export async function run(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      amount: { type: "string" },
      to: { type: "string" },
    },
  });

  if (!values.amount) {
    console.log(JSON.stringify({ error: "Required: --amount <USDC amount>" }));
    process.exit(1);
  }

  const hl = HyperliquidClient.get();
  const destination = values.to || hl.address;

  const result = await hl.withdraw(values.amount!, destination);

  console.log(JSON.stringify({
    status: "ok",
    amount: values.amount,
    from: hl.address,
    to: destination,
    result,
  }));
}
