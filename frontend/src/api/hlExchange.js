import {
  HL_EXCHANGE_URL,
  BUILDER_WALLET,
  BUILDER_FEE_BPS,
  HL_CHAIN,
  HL_SIGNATURE_CHAIN_ID,
  HL_TESTNET,
} from "../config/hyperliquid";
import { parseSig } from "../utils/hlSigning";

const builderField = HL_TESTNET
  ? {}
  : { builder: { b: BUILDER_WALLET, f: BUILDER_FEE_BPS } };

const removeTrailingZeros = (value) => {
  if (!value.includes(".")) return value;
  const normalized = value.replace(/\.?0+$/, "");
  return normalized === "-0" ? "0" : normalized;
};

/** POST a signed action to the HL exchange endpoint. */
export async function postExchange(action, nonce, signature) {
  const res = await fetch(HL_EXCHANGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      nonce,
      signature: parseSig(signature),
      vaultAddress: null,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.response || data?.error || `HTTP ${res.status}`);
  }

  // Top-level error (e.g. agent not approved, invalid signature)
  if (data?.status === "err") {
    throw new Error(data.response || "Exchange request failed");
  }

  // Per-order status errors
  const statuses = data?.response?.data?.statuses;
  if (statuses) {
    for (const s of statuses) {
      if (s?.error) throw new Error(s.error);
    }
  }

  return data;
}

/** Build an IOC limit order action (used for market execution with slippage). */
export function buildOrderAction({
  assetId,
  isBuy,
  price,
  size,
  reduceOnly = false,
}) {
  return {
    type: "order",
    orders: [
      {
        a: assetId,
        b: isBuy,
        p: removeTrailingZeros(price),
        s: removeTrailingZeros(size),
        r: reduceOnly,
        t: { limit: { tif: "Ioc" } },
      },
    ],
    grouping: "na",
    ...builderField,
  };
}

/** Build a GTC limit order action. */
export function buildLimitOrderAction({
  assetId,
  isBuy,
  price,
  size,
  reduceOnly = false,
}) {
  return {
    type: "order",
    orders: [
      {
        a: assetId,
        b: isBuy,
        p: removeTrailingZeros(price),
        s: removeTrailingZeros(size),
        r: reduceOnly,
        t: { limit: { tif: "Gtc" } },
      },
    ],
    grouping: "na",
    ...builderField,
  };
}

/** Build a leverage update action. */
export function buildLeverageAction(asset, leverage) {
  return {
    type: "updateLeverage",
    asset,
    isCross: false,
    leverage,
  };
}

/** Build an approve builder fee L1 action. */
export function buildApproveBuilderFeeAction(builder, maxFeeRate) {
  return {
    type: "approveBuilderFee",
    hyperliquidChain: HL_CHAIN,
    signatureChainId: HL_SIGNATURE_CHAIN_ID,
    maxFeeRate,
    builder,
    nonce: Date.now(),
  };
}

/** Build an order action with optional TP/SL trigger orders (grouping: normalTpsl). */
export function buildOrderWithTpSlAction({
  assetId,
  isBuy,
  price,
  size,
  orderType,
  tpPrice,
  slPrice,
}) {
  const isLimit = orderType === "limit";
  const entryOrder = {
    a: assetId,
    b: isBuy,
    p: removeTrailingZeros(price),
    s: removeTrailingZeros(size),
    r: false,
    t: { limit: { tif: isLimit ? "Gtc" : "Ioc" } },
  };

  const orders = [entryOrder];

  if (tpPrice) {
    orders.push({
      a: assetId,
      b: !isBuy,
      p: removeTrailingZeros(tpPrice),
      s: removeTrailingZeros(size),
      r: true,
      t: {
        trigger: {
          isMarket: true,
          triggerPx: removeTrailingZeros(tpPrice),
          tpsl: "tp",
        },
      },
    });
  }

  if (slPrice) {
    orders.push({
      a: assetId,
      b: !isBuy,
      p: removeTrailingZeros(slPrice),
      s: removeTrailingZeros(size),
      r: true,
      t: {
        trigger: {
          isMarket: true,
          triggerPx: removeTrailingZeros(slPrice),
          tpsl: "sl",
        },
      },
    });
  }

  return {
    type: "order",
    orders,
    grouping: "normalTpsl",
    ...builderField,
  };
}

/** Build an approve agent L1 action. */
export function buildApproveAgentAction(agentAddress) {
  return {
    type: "approveAgent",
    hyperliquidChain: HL_CHAIN,
    signatureChainId: HL_SIGNATURE_CHAIN_ID,
    agentAddress,
    agentName: "PERPGAME.XYZ",
    nonce: Date.now(),
  };
}

/** Build a standalone trigger order (TP or SL) for an existing position. */
export function buildTriggerOrderAction({
  assetId,
  isBuy,
  triggerPrice,
  size,
  tpsl,
}) {
  return {
    type: "order",
    orders: [
      {
        a: assetId,
        b: isBuy,
        p: removeTrailingZeros(triggerPrice),
        s: removeTrailingZeros(size),
        r: true,
        t: {
          trigger: {
            isMarket: true,
            triggerPx: removeTrailingZeros(triggerPrice),
            tpsl,
          },
        },
      },
    ],
    grouping: "na",
    ...builderField,
  };
}

/** Build an update isolated margin action (add or remove margin from a position). */
export function buildUpdateIsolatedMarginAction(asset, isBuy, amount) {
  return {
    type: "updateIsolatedMargin",
    asset,
    isBuy,
    ntli: Math.round(amount * 1e6),
  };
}

/** Build a withdraw L1 action. Matches plug-core HyperLiquidClient.prepareWithdraw. */
export function buildWithdrawAction(amount, destination) {
  const nonce = Date.now()
  return {
    type: 'withdraw3',
    hyperliquidChain: HL_CHAIN,
    signatureChainId: HL_SIGNATURE_CHAIN_ID,
    amount,
    destination,
    time: nonce,
  }
}

/** Build a cancel order action. */
export function buildCancelAction(asset, oid) {
  return {
    type: "cancel",
    cancels: [{ a: asset, o: oid }],
  };
}
