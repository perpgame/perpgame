import { parseArgs } from "node:util";
import HyperliquidClient from "../hyperliquid.js";

export async function run(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      coin: { type: "string" },
      pct: { type: "string", default: "100" },
    },
  });

  if (!values.coin) {
    console.log(JSON.stringify({ error: "Required: --coin <COIN>" }));
    process.exit(1);
  }

  const hl = HyperliquidClient.get();
  const coin = values.coin!.toUpperCase();
  const pct = parseFloat(values.pct!);
  const address = hl.address;

  if (pct <= 0 || pct > 100) {
    console.log(JSON.stringify({ error: "--pct must be between 1 and 100" }));
    process.exit(1);
  }

  const [state, asset] = await Promise.all([
    hl.getClearinghouseState(),
    hl.resolveAsset(coin),
  ]);

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
  const absSize = Math.abs(posSize);
  const closeSize = pct === 100 ? absSize : absSize * (pct / 100);
  const closeSizeNum = parseFloat(closeSize.toFixed(asset.szDecimals));

  const result = await hl.placeMarketOrder(coin, !isLong, closeSizeNum, 3, true);

  console.log(JSON.stringify({
    status: "ok",
    coin,
    side: isLong ? "sell" : "buy",
    closedSize: closeSizeNum,
    pct,
    wasLong: isLong,
    order: result,
  }));
}
