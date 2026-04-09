import { parseArgs } from "node:util";
import HyperliquidClient from "../hyperliquid.js";

export async function run(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      coin: { type: "string" },
      tp: { type: "string" },
      sl: { type: "string" },
    },
  });

  if (!values.coin) {
    console.log(JSON.stringify({ error: "Required: --coin <COIN>" }));
    process.exit(1);
  }

  if (!values.tp && !values.sl) {
    console.log(JSON.stringify({ error: "Provide at least --tp or --sl" }));
    process.exit(1);
  }

  const hl = HyperliquidClient.get();
  const coin = values.coin!.toUpperCase();

  const state = await hl.getClearinghouseState();
  const positions = state.assetPositions || [];
  const position = positions.find(
    (p: any) => ((p.position?.coin || p.coin) as string)?.toUpperCase() === coin,
  );

  if (!position) {
    console.log(JSON.stringify({ error: `No open position for ${coin}` }));
    process.exit(1);
  }

  const pos = position.position || position;
  const posSize = parseFloat(pos.szi);
  if (posSize === 0) {
    console.log(JSON.stringify({ error: `Position for ${coin} has zero size` }));
    process.exit(1);
  }

  const isLong = posSize > 0;
  const tp = values.tp ? parseFloat(values.tp) : undefined;
  const sl = values.sl ? parseFloat(values.sl) : undefined;

  const result = await hl.setTpsl(coin, Math.abs(posSize), isLong, { tp, sl });

  console.log(JSON.stringify({
    status: "ok",
    coin,
    isLong,
    size: Math.abs(posSize),
    tp: tp || null,
    sl: sl || null,
    order: result,
  }));
}
