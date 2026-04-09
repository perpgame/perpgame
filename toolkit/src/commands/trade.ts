import { parseArgs } from "node:util";
import HyperliquidClient from "../hyperliquid.js";

export async function run(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      side: { type: "string" },
      coin: { type: "string" },
      usd: { type: "string" },
      leverage: { type: "string" },
      type: { type: "string", default: "market" },
      price: { type: "string" },
      "reduce-only": { type: "boolean", default: false },
      slippage: { type: "string" },
      tif: { type: "string" },
      tp: { type: "string" },
      sl: { type: "string" },
    },
  });

  if (!values.side || !values.coin || !values.usd) {
    console.log(JSON.stringify({ error: "Required: --side <long|short|buy|sell> --coin <COIN> --usd <amount>" }));
    process.exit(1);
  }

  const hl = HyperliquidClient.get();
  const coin = values.coin!.toUpperCase();
  const usdAmount = parseFloat(values.usd!);
  const isBuy = values.side === "long" || values.side === "buy";

  const [mids, asset] = await Promise.all([hl.getAllMids(), hl.resolveAsset(coin)]);
  const midPrice = parseFloat(mids[coin]);
  if (!midPrice) {
    console.log(JSON.stringify({ error: `No price found for ${coin}` }));
    process.exit(1);
  }

  const leverage = values.leverage ? parseFloat(values.leverage) : 1;
  const notional = usdAmount * leverage;

  if (notional < 10) {
    console.log(JSON.stringify({ error: `Minimum order value is $10. $${usdAmount} margin x ${leverage}x = $${notional} notional.` }));
    process.exit(1);
  }

  const size = parseFloat((notional / midPrice).toFixed(asset.szDecimals));

  if (values.leverage) {
    await hl.updateLeverage(asset.index, leverage);
  }

  const orderType = values.type || "market";
  let result;

  if (orderType === "limit") {
    if (!values.price) {
      console.log(JSON.stringify({ error: "Limit orders require --price" }));
      process.exit(1);
    }
    result = await hl.placeLimitOrder(
      coin,
      isBuy,
      size,
      parseFloat(values.price),
      (values.tif as "Gtc" | "Ioc" | "Alo") || "Gtc",
      values["reduce-only"],
    );
  } else {
    const slippage = values.slippage ? parseFloat(values.slippage) : 3;
    const tp = values.tp ? parseFloat(values.tp) : undefined;
    const sl = values.sl ? parseFloat(values.sl) : undefined;

    if (tp || sl) {
      result = await hl.placeMarketOrderWithTpsl(coin, isBuy, size, { slippagePct: slippage, tp, sl });
    } else {
      result = await hl.placeMarketOrder(coin, isBuy, size, slippage, values["reduce-only"]);
    }
  }

  console.log(JSON.stringify({
    status: "ok",
    coin,
    side: values.side,
    size,
    usd: usdAmount,
    price: midPrice,
    leverage: values.leverage || null,
    type: orderType,
    order: result,
  }));
}
