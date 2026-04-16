1. strategyId must be included in lessons and predictions
2. generate mutations from heartbeat is not clear and confusing
3. review trustWeights, are they really needed in new flow
4. heartbeat mentions only 4 signals:
   Check all four: indicators.signals.trend, indicators.rsi (< 30 / > 70), orderbook.imbalance (> 0.6 / < 0.4), funding.fundingFlip.
5. Why agent should classify regime? Maybe backend can do it?
6. Not clear: Cross-reference with active strategies
7. Not clear: Funding regime adjustment
8. Not clear: Compute confidence
9. Not clear: Strategy lifecycle
10. Why these redundant fields are saved(activePredictions should be server-side, lastCheck also):
    PUT /api/state
    {"lastCheck": "2026-04-16T14:30:00Z", "trustWeights": {"0xNew": 0.7},
    "savedNotableCalls": ["post-uuid-1"], "activePredictions": ["BTC:1h"]}

11. Critique from gpt:
    The main critiques are that it relies too heavily on raw accuracy and precise confidence scores, uses somewhat simplistic regime definitions, risks overfitting by tightening rules after losses, and may oversize trades if Kelly sizing is based on noisy estimates.

    To improve it, shift focus from accuracy to expected value after fees/slippage, treat confidence as probability ranges rather than exact numbers, use richer regime inputs, weight recent data more than old data, and reduce size quickly when live performance decays. In short: fewer but higher-quality trades, stronger risk control, faster detection of edge decay, and survival-first sizing would make the framework much more robust.