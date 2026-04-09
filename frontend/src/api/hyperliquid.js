import { HL_API_URL } from "../config/hyperliquid";

const API_URL = HL_API_URL;

async function post(body) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getUserReferral(address) {
  return post({
    type: "referral",
    user: address,
  });
}

export async function getUserState(address) {
  return post({
    type: "clearinghouseState",
    user: address,
  });
}

export async function getUserFills(address) {
  return post({
    type: "userFills",
    user: address,
  });
}

export async function getUserFillsByTime(address, startTime) {
  return post({
    type: "userFillsByTime",
    user: address,
    startTime,
  });
}

export async function getUserFunding(address) {
  return post({
    type: "userFunding",
    user: address,
  });
}

export async function getUserTransfers(address) {
  return post({
    type: "userNonFundingLedgerUpdates",
    user: address,
  });
}

export async function getUserPortfolio(address) {
  return post({
    type: "portfolio",
    user: address,
  });
}

export async function getAllMids() {
  return post({
    type: "allMids",
  });
}

export async function getMetaAndAssetCtxs() {
  return post({
    type: "metaAndAssetCtxs",
  });
}

export async function getCandleSnapshot(coin, interval, startTime, endTime) {
  return post({
    type: "candleSnapshot",
    req: { coin, interval, startTime, endTime },
  });
}

export async function getL2Book(coin, nSigFigs = 5) {
  return post({
    type: "l2Book",
    coin,
    nSigFigs,
  });
}

export async function getOpenOrders(address) {
  return post({
    type: "openOrders",
    user: address,
  });
}

export async function getFrontendOpenOrders(address) {
  return post({
    type: "frontendOpenOrders",
    user: address,
  });
}

export async function getUserOrderHistory(address) {
  return post({
    type: "historicalOrders",
    user: address,
  });
}

export function parseOrderHistory(historicalOrders, currentOpenOrders) {
  if (!Array.isArray(historicalOrders)) historicalOrders = []
  if (!Array.isArray(currentOpenOrders)) currentOpenOrders = []

  // Deduplicate historical: keep latest state per oid
  const byOid = new Map()
  for (const entry of historicalOrders) {
    const oid = entry.order?.oid
    if (!oid) continue
    const existing = byOid.get(oid)
    if (!existing || (entry.statusTimestamp || 0) > (existing.statusTimestamp || 0)) {
      byOid.set(oid, entry)
    }
  }

  // Merge current open orders (frontendOpenOrders format → historicalOrders format)
  for (const o of currentOpenOrders) {
    const oid = o.oid
    if (!oid || byOid.has(oid)) continue
    byOid.set(oid, {
      order: {
        coin: o.coin,
        side: o.side,
        limitPx: o.limitPx,
        sz: o.sz,
        origSz: o.origSz || o.sz,
        oid: o.oid,
        timestamp: o.timestamp,
        orderType: o.orderType || 'Limit',
        tif: o.tif,
        reduceOnly: !!o.reduceOnly,
        isTrigger: !!o.isTrigger,
        triggerCondition: o.triggerCondition || 'N/A',
        triggerPx: o.triggerPx || '0.0',
        isPositionTpsl: !!o.isPositionTpsl,
      },
      status: 'open',
      statusTimestamp: o.timestamp,
    })
  }

  return [...byOid.values()]
    .sort((a, b) => (b.statusTimestamp || 0) - (a.statusTimestamp || 0))
    .slice(0, 100)
    .map(entry => {
      const o = entry.order
      const isBuy = o.side === 'B'
      const reduceOnly = !!o.reduceOnly

      // Side label
      const side = reduceOnly
        ? (isBuy ? 'Close Short' : 'Close Long')
        : (isBuy ? 'Long' : 'Short')

      // Order type & market detection
      const isMarket = o.orderType === 'Market' || o.tif === 'FrontendMarket'
      let type = o.orderType === 'Market' ? 'Market' : 'Limit'
      if (o.isTrigger) {
        const isTp = o.isPositionTpsl || o.triggerCondition?.toLowerCase().includes('tp')
          || (o.triggerCondition !== 'N/A' && (
            (isBuy && o.triggerCondition?.includes('below')) ||
            (!isBuy && o.triggerCondition?.includes('above'))
          ))
        if (isTp) type = isMarket ? 'TP Market' : 'TP Limit'
        else type = isMarket ? 'Stop Market' : 'Stop Limit'
      }

      // Trigger condition — use the value from HL directly
      const trigger = o.triggerCondition || 'N/A'

      // Price
      const price = isMarket ? 'Market' : o.limitPx

      return {
        coin: o.coin,
        side,
        sideType: reduceOnly ? (isBuy ? 'short' : 'long') : (isBuy ? 'long' : 'short'),
        type,
        size: o.origSz || o.sz,
        price,
        trigger,
        reduceOnly,
        status: entry.status,
        time: entry.statusTimestamp || o.timestamp,
        oid: o.oid,
      }
    })
}

export function parsePositions(state) {
  if (!state?.assetPositions) return [];
  return state.assetPositions
    .map((ap) => {
      const pos = ap.position;
      const size = parseFloat(pos.szi);
      const absSize = Math.abs(size);
      const leverage = parseFloat(pos.leverage?.value || 0);
      const maxLeverage = pos.maxLeverage || 0;
      const entryPrice = parseFloat(pos.entryPx);
      const positionValue = parseFloat(pos.positionValue);
      const markPrice = absSize ? positionValue / absSize : 0;
      const marginUsed = parseFloat(pos.marginUsed || 0);
      const isLong = size > 0;

      // Liquidation price from HL API (may be null for cross-margin)
      let liquidationPx = pos.liquidationPx
        ? parseFloat(pos.liquidationPx)
        : null;

      // Compute estimated liq price if API doesn't provide one
      if (!liquidationPx && absSize > 0 && leverage > 0 && maxLeverage > 0) {
        const floatSide = isLong ? 1 : -1;
        const notional = absSize * markPrice;
        const initialMargin = notional / leverage;
        const maintenanceLeverage = maxLeverage * 2;
        const correction = 1 - floatSide / maintenanceLeverage;
        const estimated =
          markPrice -
          (floatSide * (initialMargin - notional / maintenanceLeverage)) /
            absSize /
            correction;
        liquidationPx = estimated > 0 ? estimated : null;
      }

      return {
        coin: pos.coin,
        size,
        szi: pos.szi,
        entryPrice,
        markPrice,
        unrealizedPnl: parseFloat(pos.unrealizedPnl),
        returnOnEquity: parseFloat(pos.returnOnEquity) * 100,
        leverage,
        maxLeverage,
        side: isLong ? "Long" : "Short",
        liquidationPx,
        marginUsed,
        positionValue,
      };
    })
    .filter((p) => p.size !== 0);
}

export function parseAccountValue(state) {
  if (!state?.marginSummary) return 0;
  return parseFloat(state.marginSummary.accountValue);
}

export function parseTraderStats(state) {
  if (!state) return null;
  const ms = state.marginSummary || {};
  const accountValue = parseFloat(ms.accountValue || 0);
  const totalMarginUsed = parseFloat(ms.totalMarginUsed || 0);
  const totalNtlPos = parseFloat(ms.totalNtlPos || 0);

  const positions = (state.assetPositions || [])
    .map((ap) => ap.position)
    .filter((p) => p && parseFloat(p.szi) !== 0);

  let totalUnrealizedPnl = 0;
  let longExposure = 0;
  let shortExposure = 0;
  let longCount = 0;
  let shortCount = 0;
  let leverageSum = 0;
  let totalFunding = 0;

  for (const p of positions) {
    const szi = parseFloat(p.szi);
    const uPnl = parseFloat(p.unrealizedPnl || 0);
    const posValue = Math.abs(szi) * parseFloat(p.entryPx || 0);
    const lev = parseFloat(p.leverage?.value || p.maxLeverage || 1);
    totalUnrealizedPnl += uPnl;
    leverageSum += lev;
    totalFunding += parseFloat(p.cumFunding?.sinceOpen || 0);
    if (szi > 0) {
      longExposure += posValue;
      longCount++;
    } else {
      shortExposure += posValue;
      shortCount++;
    }
  }

  const totalExposure = longExposure + shortExposure;
  const marginUsagePct =
    accountValue > 0 ? (totalMarginUsed / accountValue) * 100 : 0;
  const longPct = totalExposure > 0 ? (longExposure / totalExposure) * 100 : 0;
  const shortPct =
    totalExposure > 0 ? (shortExposure / totalExposure) * 100 : 0;
  const roe = accountValue > 0 ? (totalUnrealizedPnl / accountValue) * 100 : 0;
  const directionBias =
    longExposure > shortExposure
      ? "LONG"
      : shortExposure > longExposure
        ? "SHORT"
        : "NEUTRAL";

  return {
    accountValue,
    totalMarginUsed,
    marginUsagePct,
    totalUnrealizedPnl,
    roe,
    longExposure,
    shortExposure,
    longPct,
    shortPct,
    directionBias,
    longCount,
    shortCount,
    positionCount: positions.length,
    avgLeverage: positions.length > 0 ? leverageSum / positions.length : 0,
    totalFunding,
  };
}

export function parseTotalPnl(fills) {
  if (!fills || !fills.length) return 0;
  return fills.reduce((sum, fill) => sum + parseFloat(fill.closedPnl || 0), 0);
}

export function buildLeverageMap(state) {
  const map = {};
  if (!state?.assetPositions) return map;
  for (const ap of state.assetPositions) {
    const pos = ap.position;
    const lev = parseFloat(pos.leverage?.value || 0);
    if (lev > 0) {
      map[pos.coin] = lev;
    }
  }
  return map;
}

export function buildPnlTimeline(fills) {
  if (!fills || !fills.length) return [];
  const sorted = [...fills].sort((a, b) => a.time - b.time);
  let cumPnl = 0;
  const points = [];
  const seen = new Set();

  for (const fill of sorted) {
    const pnl = parseFloat(fill.closedPnl || 0);
    cumPnl += pnl;
    const d = new Date(fill.time);
    const day = d.toLocaleDateString();
    if (!seen.has(day)) {
      seen.add(day);
      points.push({
        date: day,
        pnl: Math.round(cumPnl * 100) / 100,
        ts: d.getTime(),
      });
    } else {
      const last = points[points.length - 1];
      if (last.date === day) {
        last.pnl = Math.round(cumPnl * 100) / 100;
      }
    }
  }
  return points;
}

export function buildPnlTimelineFromPortfolio(portfolioData) {
  if (!portfolioData || !Array.isArray(portfolioData)) return [];

  let pnlHistory = null;
  for (const [label, data] of portfolioData) {
    if (label === "perpAllTime" || label === "allTime") {
      pnlHistory = data?.pnlHistory;
      if (pnlHistory) break;
    }
  }

  if (!pnlHistory || !pnlHistory.length) return [];

  const seen = new Set();
  const points = [];
  for (const [timestamp, value] of pnlHistory) {
    const day = new Date(timestamp).toLocaleDateString();
    const pnl = Math.round(parseFloat(value) * 100) / 100;
    if (!seen.has(day)) {
      seen.add(day);
      points.push({ date: day, pnl, ts: timestamp });
    } else {
      points[points.length - 1].pnl = pnl;
    }
  }
  return points;
}

export function parseTotalPnlFromPortfolio(portfolioData) {
  if (!portfolioData || !Array.isArray(portfolioData)) return null;
  for (const [label, data] of portfolioData) {
    if (label === "perpAllTime" || label === "allTime") {
      const hist = data?.pnlHistory;
      if (hist && hist.length > 0) {
        return parseFloat(hist[hist.length - 1][1]);
      }
    }
  }
  return null;
}

export function parseClosedTrades(fills, leverageMap = {}) {
  if (!fills || !fills.length) return [];

  const sorted = [...fills].sort((a, b) => a.time - b.time);

  // Group consecutive same-coin, same-direction closing fills
  const trades = [];
  let currentGroup = null;

  for (const fill of sorted) {
    const dir = fill.dir || "";
    const isClose = dir.startsWith("Close");
    if (!isClose) {
      // An open fill breaks any current group for this coin
      if (currentGroup && currentGroup.coin === (fill.coin || fill.asset)) {
        trades.push(finalizeTradeGroup(currentGroup, leverageMap));
        currentGroup = null;
      }
      continue;
    }

    const coin = fill.coin || fill.asset;
    if (!coin) continue;

    const side = dir === "Close Long" ? "Long" : "Short";

    if (
      currentGroup &&
      currentGroup.coin === coin &&
      currentGroup.side === side
    ) {
      // Extend current group
      currentGroup.fills.push(fill);
    } else {
      // Finalize previous group if any
      if (currentGroup) {
        trades.push(finalizeTradeGroup(currentGroup, leverageMap));
      }
      currentGroup = { coin, side, fills: [fill] };
    }
  }

  if (currentGroup) {
    trades.push(finalizeTradeGroup(currentGroup, leverageMap));
  }

  // Sort by time descending (most recent first)
  return trades.sort((a, b) => b.exitTime - a.exitTime);
}

function finalizeTradeGroup(group, leverageMap) {
  const { coin, side, fills } = group;

  let totalPnl = 0;
  let totalSize = 0;
  let weightedExitPrice = 0;
  let earliestTime = Infinity;
  let latestTime = 0;

  for (const fill of fills) {
    const sz = Math.abs(parseFloat(fill.sz));
    const px = parseFloat(fill.px);
    const pnl = parseFloat(fill.closedPnl || 0);

    totalPnl += pnl;
    totalSize += sz;
    weightedExitPrice += px * sz;
    earliestTime = Math.min(earliestTime, fill.time);
    latestTime = Math.max(latestTime, fill.time);
  }

  const exitPrice = totalSize > 0 ? weightedExitPrice / totalSize : 0;

  // Compute entry price from PnL math
  let entryPrice = exitPrice;
  if (totalSize > 0 && totalPnl !== 0) {
    if (side === "Long") {
      // Long close: closedPnl = (exitPx - entryPx) * sz
      entryPrice = exitPrice - totalPnl / totalSize;
    } else {
      // Short close: closedPnl = (entryPx - exitPx) * sz
      entryPrice = exitPrice + totalPnl / totalSize;
    }
  }

  const leverage = leverageMap[coin] || 1;
  const duration = latestTime - earliestTime;

  return {
    coin,
    side,
    entryPrice,
    exitPrice,
    leverage,
    pnl: totalPnl,
    size: totalSize,
    duration,
    exitTime: latestTime,
    entryTime: earliestTime,
  };
}

export function parseLiquidations(fills, leverageMap = {}) {
  if (!fills || !fills.length) return [];

  const liquidations = [];

  for (const fill of fills) {
    const dir = fill.dir || "";
    const isClose = dir.startsWith("Close");
    if (!isClose) continue;

    const closedPnl = parseFloat(fill.closedPnl || 0);
    if (closedPnl >= 0) continue;

    const startPos = Math.abs(parseFloat(fill.startPosition || 0));
    const sz = Math.abs(parseFloat(fill.sz));

    // Liquidation: the fill closes the entire remaining position
    if (startPos === 0) continue;
    const remaining = startPos - sz;
    if (Math.abs(remaining) > startPos * 0.01) continue; // not fully closed (>1% remaining)

    const coin = fill.coin || fill.asset;
    if (!coin) continue;

    const side = dir === "Close Long" ? "Long" : "Short";
    const exitPrice = parseFloat(fill.px);

    let entryPrice = exitPrice;
    if (sz > 0) {
      if (side === "Long") {
        entryPrice = exitPrice - closedPnl / sz;
      } else {
        entryPrice = exitPrice + closedPnl / sz;
      }
    }

    const leverage = leverageMap[coin] || 1;

    liquidations.push({
      coin,
      side,
      leverage,
      entryPrice,
      liqPrice: exitPrice,
      size: sz,
      loss: closedPnl,
      time: fill.time,
    });
  }

  return liquidations.sort((a, b) => b.time - a.time);
}

export function computeWinStreak(trades) {
  if (!trades || !trades.length)
    return { count: 0, streakType: "win", totalPnl: 0, trades: [] };

  // trades should already be sorted most recent first
  const firstPnl = trades[0].pnl;
  const streakType = firstPnl > 0 ? "win" : "loss";
  let count = 0;
  let totalPnl = 0;
  const streakTrades = [];

  for (const trade of trades) {
    const isWin = trade.pnl > 0;
    if ((streakType === "win" && isWin) || (streakType === "loss" && !isWin)) {
      count++;
      totalPnl += trade.pnl;
      streakTrades.push({ coin: trade.coin, pnl: trade.pnl });
    } else {
      break;
    }
  }

  return { count, streakType, totalPnl, trades: streakTrades.slice(0, 5) };
}

export function computeTradeStats(trades) {
  if (!trades || !trades.length) {
    return { totalPnl: 0, winRate: 0, totalTrades: 0, winCount: 0 };
  }
  let totalPnl = 0;
  let winCount = 0;
  for (const t of trades) {
    totalPnl += t.pnl;
    if (t.pnl > 0) winCount++;
  }
  return {
    totalPnl,
    winRate: Math.round((winCount / trades.length) * 100),
    totalTrades: trades.length,
    winCount,
  };
}

export function computePortfolioAllocation(positions) {
  if (!positions || !positions.length) return [];
  const totalValue = positions.reduce(
    (sum, p) => sum + Math.abs(p.size * p.entryPrice),
    0,
  );
  if (totalValue === 0) return [];

  return positions.map((p) => {
    const value = Math.abs(p.size * p.entryPrice);
    return {
      coin: p.coin,
      side: p.side,
      percentage: Math.round((value / totalValue) * 1000) / 10,
      value,
    };
  });
}

export function formatUsd(value) {
  if (value === null || value === undefined) return "$0.00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return (
    "$" +
    Math.abs(num).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}
