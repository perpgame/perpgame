import { parseArgs } from "node:util";
import { isBuilderFeeApproved, markBuilderFeeApproved } from "../config.js";
import HyperliquidClient from "../hyperliquid.js";

export async function run(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      builder: { type: "string" },
      "fee-bps": { type: "string", default: "50" },
      force: { type: "boolean", default: false },
    },
  });

  if (!values.builder) {
    console.log(JSON.stringify({ error: "Missing required argument: --builder <address>" }));
    process.exit(1);
  }

  const hl = HyperliquidClient.get();
  const address = hl.address;
  const feeBps = parseInt(values["fee-bps"]!, 10);

  if (!values.force && isBuilderFeeApproved(address, values.builder!)) {
    console.log(
      JSON.stringify({
        status: "already_approved",
        wallet: address,
        builder: values.builder,
      }),
    );
    process.exit(0);
  }

  const response = await hl.approveBuilderFee(values.builder!, `${feeBps}%`);
  markBuilderFeeApproved(address, values.builder!);

  console.log(
    JSON.stringify({
      status: "ok",
      wallet: address,
      builder: values.builder,
      feeBps,
      response,
    }),
  );
}
