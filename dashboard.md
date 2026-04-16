1. Realized Expectancy (Most Important)

Instead of win rate, track:
EV=p(win)⋅AvgWin−(1−p(win))⋅AvgLoss

Where:
p(win) = weekly win rate
AvgWin = average winner %
AvgLoss = average loser %

Why it matters

A bot can win 60% but lose money.

Weekly Rule
EV > 0 = healthy
EV near 0 for 3+ weeks = investigate
EV negative 4+ weeks = edge decay warning



2. Calibration Error (Does Confidence Mean Anything?)

If bot says:

70% confidence trades should win around 70%
60% bucket should win around 60%

If not, confidence engine is broken.

Example

This week:

12 trades at 0.70+ confidence
only 5 winners = 42%

Huge red flag.

Weekly Rule

Track by confidence buckets:

Bucket	Expected	Actual
0.55–0.60	58%	?
0.60–0.70	65%	?
0.70+	72%	?

If higher confidence no longer means higher hit rate → model decaying.



3. Regime Performance Drift

Track performance by regime:

trending
choppy
volatile
mean reverting
Example

Last 3 months:

Trending = strong
Choppy = neutral

This week:

Trending suddenly weak

Maybe trend logic stopped working.

Weekly Rule

If previously strong regime turns negative for 20+ signals, re-evaluate



6. Exposure Concentration

Is bot secretly one bet?

Example:

80% BTC long signals
all highly correlated

Looks diversified but isn’t.

Weekly Rule

Track:

% long vs short exposure
coin concentration
correlated strategy clustering

If too concentrated, cap exposure.





7. Live vs Backtest Gap

The killer metric.

Compare:

Metric	Backtest	Live
Win rate	58%	49%
Avg win	0.8%	0.5%
Avg loss	-0.6%	-0.8%

That means reality > model.

Weekly Rule

If live materially underperforms for 6–8 weeks, assume decay until proven otherwise.