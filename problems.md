A strategy can be:

65% accurate
lose money overall

Example:

65 wins of +0.2%
35 losses of -1.5%

High accuracy, negative expectancy.

Should use:
expectancy
Sharpe
drawdown
profit factor
payoff ratio

Not accuracy alone.

2. Confidence Scores Can Be Fake Precision

Saying:

Confidence = 0.74

sounds scientific.

But unless properly calibrated with huge samples, this number may be meaningless.

Markets are nonstationary.

Yesterday’s 74% may be tomorrow’s 49%.

Danger:

False certainty causes oversizing.



3. Regime Classification Is Too Simplistic

Example:

Trending if ADX > 25

Real markets are more nuanced:

slow trend grind
panic trend
trend exhaustion
trend with negative breadth
news-driven spikes

One ADX threshold is crude.

Verdict:

Useful starting point, weak final model.



4. Tightening Rules After Losses Can Overfit

Loss happens.

Bot says:

tighten RSI from <30 to <27

Looks smart.

But maybe loss was random noise.

Do this repeatedly and you curve-fit every scar.

Danger:

Death by overfitting.

Verdict:

Very common quant mistake.

5. Monthly Retirement on <50% Accuracy Can Kill Good Systems

A trend-following system may have:

42% win rate
huge winners

If you retire by accuracy threshold, you kill profitable convex systems.

Verdict:

Bad metric choice.


6. Funding Multipliers Can Mislead

Crowded longs do not always mean bearish.

Sometimes crowded longs stay crowded for weeks in strong bull runs.

Multiplying confidence mechanically can fade momentum too early.

Verdict:

Use cautiously.


7. Kelly Position Sizing Is Dangerous

Kelly is mathematically elegant, emotionally brutal.

Even half-Kelly can be aggressive when edge estimates are noisy.

If confidence estimates are wrong, Kelly oversizes.

Real-world issue:

Many pros use:

quarter Kelly
volatility targeting
hard caps
Verdict:

Needs conservative cap.