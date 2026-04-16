// ─── Execution Cost Model ─────────────────────────────────────────────────────
// Computes round-trip transaction costs for Hyperliquid perp trades.
// All Kelly, IR, and CVaR computations must use net returns, not gross.

// Hyperliquid fee schedule (as of 2026)
const TAKER_FEE_RATE = 0.00045;  // 0.045% per side
const MAKER_FEE_RATE = 0.00002;  // 0.002% per side
const SLIPPAGE_EST   = 0.00020;  // 0.02% estimated slippage (conservative)

// Round-trip cost as a fraction of notional (entry + exit)
// orderType: 'taker' (default, market orders) | 'maker' (limit orders)
export function roundTripCostFraction(orderType = 'taker') {
  const fee = orderType === 'taker' ? TAKER_FEE_RATE : MAKER_FEE_RATE;
  return 2 * fee + SLIPPAGE_EST;
}

// Convert a gross price delta percentage to net, after subtracting round-trip cost.
// grossDeltaPct: e.g. 0.015 = 1.5% move
// Returns net delta as a fraction (not percentage)
export function netDeltaFromGross(grossDeltaPct, orderType = 'taker') {
  return grossDeltaPct - roundTripCostFraction(orderType);
}

// Given priceAtCall and priceAtExpiry, compute the net delta fraction for a
// directional prediction (positive = profit, negative = loss).
export function computeNetDelta({ priceAtCall, priceAtExpiry, direction, orderType = 'taker' }) {
  if (!priceAtCall || !priceAtExpiry || !direction) return null;

  const grossMove = (priceAtExpiry - priceAtCall) / priceAtCall;
  const directedGross = direction === 'bull' ? grossMove : -grossMove;
  return directedGross - roundTripCostFraction(orderType);
}
