/**
 * Hyperliquid API client — singleton wrapping @nktkas/hyperliquid.
 */
import { InfoClient, ExchangeClient, HttpTransport } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import { loadPrivateKey } from "./wallet.js";

type OrderType =
  | { limit: { tif: "Gtc" | "Ioc" | "Alo" } }
  | { trigger: { triggerPx: string; isMarket: boolean; tpsl: "tp" | "sl" } };

interface OrderWire {
  a: number;
  b: boolean;
  p: string;
  s: string;
  r: boolean;
  t: OrderType;
}

class HyperliquidClient {
  private static instance: HyperliquidClient;

  readonly info: InfoClient;
  readonly exchange: ExchangeClient;
  readonly address: string;

  private constructor(privateKey: string) {
    const wallet = privateKeyToAccount(privateKey as `0x${string}`);
    const transport = new HttpTransport();

    this.info = new InfoClient({ transport });
    this.exchange = new ExchangeClient({ transport, wallet });
    this.address = wallet.address;
  }

  static get(): HyperliquidClient {
    if (!HyperliquidClient.instance) {
      HyperliquidClient.instance = new HyperliquidClient(loadPrivateKey());
    }
    return HyperliquidClient.instance;
  }

  // ── Info helpers ─────────────────────────────────────────────────

  getAllMids = () => this.info.allMids();

  getClearinghouseState = () =>
    this.info.clearinghouseState({ user: this.address });

  getOpenOrders = () => this.info.openOrders({ user: this.address });

  resolveAsset = async (coin: string): Promise<{ index: number; szDecimals: number }> => {
    const meta = await this.info.meta();
    const idx = meta.universe.findIndex(
      (a) => a.name.toUpperCase() === coin.toUpperCase(),
    );
    if (idx === -1) throw new Error(`Unknown asset: ${coin}`);
    return { index: idx, szDecimals: meta.universe[idx].szDecimals };
  };

  // ── Exchange helpers ─────────────────────────────────────────────

  approveBuilderFee = (builder: string, maxFeeRate: string) =>
    this.exchange.approveBuilderFee({
      builder: builder as `0x${string}`,
      maxFeeRate,
    });

  updateLeverage = (asset: number, leverage: number, isCross = false) =>
    this.exchange.updateLeverage({ asset, isCross, leverage });

  placeOrder = (orders: OrderWire[], grouping: "na" | "normalTpsl" = "na") =>
    this.exchange.order({ orders, grouping });

  cancelOrder = (asset: number, orderId: number) =>
    this.exchange.cancel({ cancels: [{ a: asset, o: orderId }] });

  withdraw = (amount: string, destination: string) =>
    this.exchange.withdraw3({
      amount,
      destination: destination as `0x${string}`,
    });

  // ── Convenience ────────────────────────────────────────────────

  placeMarketOrder = async (
    coin: string,
    isBuy: boolean,
    size: number,
    slippagePct = 3,
    reduceOnly = false,
  ) => {
    const [mids, asset] = await Promise.all([this.getAllMids(), this.resolveAsset(coin)]);
    const midPrice = parseFloat(mids[coin]);
    if (!midPrice) throw new Error(`No price found for ${coin}`);

    const slippage = 1 + slippagePct / 100;
    const price = isBuy ? midPrice * slippage : midPrice / slippage;
    const pricePrecision = Math.max(0, 5 - Math.ceil(Math.log10(price)));

    return this.placeOrder([{
      a: asset.index,
      b: isBuy,
      p: price.toFixed(pricePrecision),
      s: size.toString(),
      r: reduceOnly,
      t: { limit: { tif: "Ioc" } },
    }]);
  };

  placeLimitOrder = async (
    coin: string,
    isBuy: boolean,
    size: number,
    price: number,
    tif: "Gtc" | "Ioc" | "Alo" = "Gtc",
    reduceOnly = false,
  ) => {
    const asset = await this.resolveAsset(coin);
    return this.placeOrder([{
      a: asset.index,
      b: isBuy,
      p: price.toString(),
      s: size.toString(),
      r: reduceOnly,
      t: { limit: { tif } },
    }]);
  };

  /** Place a market order with optional TP/SL attached. */
  placeMarketOrderWithTpsl = async (
    coin: string,
    isBuy: boolean,
    size: number,
    opts: { slippagePct?: number; tp?: number; sl?: number } = {},
  ) => {
    const slippagePct = opts.slippagePct ?? 3;
    const [mids, asset] = await Promise.all([this.getAllMids(), this.resolveAsset(coin)]);
    const midPrice = parseFloat(mids[coin]);
    if (!midPrice) throw new Error(`No price found for ${coin}`);

    const slippage = 1 + slippagePct / 100;
    const price = isBuy ? midPrice * slippage : midPrice / slippage;
    const pricePrecision = Math.max(0, 5 - Math.ceil(Math.log10(price)));
    const sizeStr = size.toString();

    const orders: OrderWire[] = [
      {
        a: asset.index,
        b: isBuy,
        p: price.toFixed(pricePrecision),
        s: sizeStr,
        r: false,
        t: { limit: { tif: "Ioc" } },
      },
    ];

    if (opts.tp) {
      orders.push({
        a: asset.index,
        b: !isBuy,
        p: opts.tp.toString(),
        s: sizeStr,
        r: true,
        t: { trigger: { triggerPx: opts.tp.toString(), isMarket: true, tpsl: "tp" } },
      });
    }

    if (opts.sl) {
      orders.push({
        a: asset.index,
        b: !isBuy,
        p: opts.sl.toString(),
        s: sizeStr,
        r: true,
        t: { trigger: { triggerPx: opts.sl.toString(), isMarket: true, tpsl: "sl" } },
      });
    }

    const grouping = (opts.tp || opts.sl) ? "normalTpsl" : "na";
    return this.placeOrder(orders, grouping);
  };

  /** Set TP/SL on an existing position. */
  setTpsl = async (
    coin: string,
    size: number,
    isLong: boolean,
    opts: { tp?: number; sl?: number },
  ) => {
    const asset = await this.resolveAsset(coin);
    const sizeStr = size.toString();
    const orders: OrderWire[] = [];

    if (opts.tp) {
      orders.push({
        a: asset.index,
        b: !isLong,
        p: opts.tp.toString(),
        s: sizeStr,
        r: true,
        t: { trigger: { triggerPx: opts.tp.toString(), isMarket: true, tpsl: "tp" } },
      });
    }

    if (opts.sl) {
      orders.push({
        a: asset.index,
        b: !isLong,
        p: opts.sl.toString(),
        s: sizeStr,
        r: true,
        t: { trigger: { triggerPx: opts.sl.toString(), isMarket: true, tpsl: "sl" } },
      });
    }

    if (orders.length === 0) throw new Error("Provide at least --tp or --sl");
    return this.placeOrder(orders, "normalTpsl");
  };
}

export default HyperliquidClient;
