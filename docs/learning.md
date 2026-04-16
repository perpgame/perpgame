1. Cross-reference with active strategies
   What it means

You don’t trade just because BTC looks bullish.

You first ask:

“Do any of my strategies historically work in the current market regime?”

A strategy may perform well in trends but badly in chop.
Another may thrive in mean reversion.

So before posting/trading, you compare:

Current market regime (trending / volatile / choppy / mean reverting)
Each active strategy’s past stats in that regime
Example

Suppose you have:

Strategy A

“Buy oversold RSI during strong uptrends”

Stats:

Trending: 61% win rate over 80 signals
Choppy: 42% over 40 signals
Strategy B

“Fade extremes in ranges”

Stats:

Mean reverting: 58%
Trending: 46%

Now BTC currently has:

ADX = 31 → trending regime

Then:

Strategy A = valid edge
Strategy B = avoid

So you use A, ignore B.







2. Funding regime adjustment
   What funding means

In perpetual futures, longs or shorts periodically pay the other side.

Positive funding = longs crowded
Negative funding = shorts crowded

This gives sentiment info.

The file uses 3 funding states:
funding_long

Longs crowded.

Market leaning bullish but possibly overcrowded.

funding_short

Shorts crowded.

Market leaning bearish but possibly squeezable.

funding_neutral

Balanced.

Why multiply confidence?

Your raw signal says BTC bullish 70%.

But if funding says longs overcrowded, reduce confidence.

















3. Compute confidence

This is the most important section.

Confidence = probability estimate that signal is right.

It uses three layers.

Layer 1: Calibrated base rate

Use historical strategy accuracy.

If strategy wins 58% over large sample:

Base confidence ≈ 0.58

But raw confidence numbers often lie.

So later you use calibration:

“When I said 70% in past, I was actually right 62%.”

That’s what isotonic correction does.

Layer 2: Convergence bonus

If multiple independent strategies agree, confidence rises.

Not linearly.

Because similar systems may be redundant.

Formula
effective_votes = 1 + Σ(1 - correlation)
confidence = base × sqrt(effective_votes)
Example

3 bullish strategies:

Strategy A
Strategy B correlation with A = 0.8
Strategy C correlation with A/B = 0.2 average

Then:

effective_votes = 1 + (1-0.8) + (1-0.2)
                = 1 + 0.2 + 0.8
                = 2.0

Confidence boost:

0.58 × sqrt(2)
= 0.82

(then cap at 0.92)

Why correlation matters

Two RSI strategies agreeing means little.

RSI + orderflow + sentiment agreeing means stronger.

Layer 3: Funding multiplier

Apply section 2 after convergence.

Final Example

Base = 0.58
Convergence = ×1.41
Funding_short for bull = ×1.10

0.58 × 1.41 × 1.10 = 0.90

Strong signal.

Portfolio net exposure check

Even if signal is good:

If already 70% long exposure,

Don’t add more longs.

This prevents stacking correlated risk.



















4. Strategy lifecycle

This governs how strategies are born, promoted, demoted, retired.

Think of it like a hedge fund research pipeline.

Stage 1: Hypothesis

New idea.

Example:

Buy BTC when RSI < 30 + ADX > 25

Unproven.

Stage 2: Candidate

After 50+ scored predictions and >52% accuracy.

Now interesting enough to monitor.

Stage 3: Dev Validated

After:

200+ signals
90+ days
evaluation passes

Means enough data + durability.

Stage 4: Holdout Validated

Most important.

Test on unseen data.

If dev stats were fake/overfit, holdout fails.

Need:

holdout within 8 percentage points of dev
confidence interval lower bound > 50%
Example

Dev accuracy = 58%

Holdout must be at least 50% and reasonably close.

If holdout = 43%

➡ overfit → retire

Stage 5: Shadow

Paper trade only.

No real money.

Needs 50 cycles performing similarly.

Stage 6: Active

Now allowed to trade real capital.

Correlation Rule

Before activation:

If new strategy correlation > 0.80 with existing active one:

Keep better Kelly strategy, retire duplicate.

Why?

Two nearly identical systems create fake diversification.

Retirement Rules
Kelly < 0 after 300 signals

Expected value negative.

Kill it.

Shadow failure

Live market differs from backtest.

Kill it.

Inverse Spawn

If a strategy consistently loses:

Sometimes opposite works.

Example:

If “buy breakout” loses repeatedly,

Spawn:

sell breakout fade

Big Picture Summary

This heartbeat is doing:

Research Layer
Learn from mistakes
Generate new strategies
Validate statistically
Trading Layer
Detect regime
Choose only strategies suited to regime
Compute confidence
Adjust for crowding/funding
Limit portfolio bias
Risk Layer
Circuit breakers
Exposure caps
Stop-loss
Auto retirement