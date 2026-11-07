import { runBacktest } from "../site/marketmind/modules/backtest-engine.mjs";

function emaLast(values, period) {
  if (values.length < period) return null;
  let value = values.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  const alpha = 2 / (period + 1);
  for (let i = period; i < values.length; i += 1) value = values[i] * alpha + value * (1 - alpha);
  return value;
}

function rsiLast(values, period) {
  if (values.length <= period) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = values[i] - values[i - 1];
    gain += Math.max(0, change);
    loss += Math.max(0, -change);
  }
  gain /= period; loss /= period;
  for (let i = period + 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(0, change)) / period;
    loss = (loss * (period - 1) + Math.max(0, -change)) / period;
  }
  if (loss === 0) return gain === 0 ? 50 : 100;
  return 100 - 100 / (1 + gain / loss);
}

function candidateDefinitions() {
  const candidates = [];
  for (const fast of [5, 10, 15]) {
    for (const slow of [30, 50, 80]) {
      if (fast >= slow) continue;
      candidates.push({
        id: `ema-${fast}-${slow}`, family: "ema-trend",
        parameters: { fast, slow },
        onBar: ({ history }) => {
          const closes = history.map(bar => bar.close);
          const f = emaLast(closes, fast), s = emaLast(closes, slow);
          return { targetPosition: f !== null && s !== null && f > s ? 1 : 0 };
        }
      });
    }
  }
  for (const entry of [20, 25, 30]) {
    for (const exit of [50, 55, 60]) {
      candidates.push({
        id: `rsi-${entry}-${exit}`, family: "rsi-mean-reversion",
        parameters: { period: 14, entry, exit },
        onBar: ({ history }) => {
          const closes = history.map(bar => bar.close);
          let position = 0;
          for (let end = 15; end <= closes.length; end += 1) {
            const value = rsiLast(closes.slice(0, end), 14);
            if (value === null) continue;
            if (position === 0 && value <= entry) position = 1;
            else if (position === 1 && value >= exit) position = 0;
          }
          return { targetPosition: position };
        }
      });
    }
  }
  for (const lookback of [10, 20, 30]) {
    candidates.push({
      id: `donchian-${lookback}`, family: "donchian-breakout",
      parameters: { lookback },
      onBar: ({ history }) => {
        if (history.length <= lookback) return { targetPosition: 0 };
        const prior = history.slice(-lookback - 1, -1);
        const ceiling = Math.max(...prior.map(bar => bar.high));
        return { targetPosition: history.at(-1).close > ceiling ? 1 : 0 };
      }
    });
  }
  return candidates;
}

/**
 * Generates and screens a bounded, deterministic set of long-only strategy
 * hypotheses. Results are in-sample research diagnostics only; this function
 * deliberately does not promote candidates or claim out-of-sample validity.
 */
export async function screenStrategyCandidates({
  bars,
  initialCash = 10_000,
  feeBps = 5,
  slippageBps = 5,
  maxPositionUnits = 1,
  maxCandidates = 30,
  strategyVersion = "1.0.0",
  codeVersion = "bright-future-candidate-lab"
} = {}) {
  if (!Array.isArray(bars) || bars.length < 2) throw new TypeError("bars must contain at least two OHLCV records");
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 100) throw new RangeError("maxCandidates must be an integer from 1 to 100");
  const definitions = candidateDefinitions().slice(0, maxCandidates);
  const results = [];
  for (const candidate of definitions) {
    const backtest = await runBacktest({
      bars,
      onBar: candidate.onBar,
      initialCash, feeBps, slippageBps, maxPositionUnits,
      strategyId: candidate.id, strategyVersion, codeVersion
    });
    const drawdown = Math.max(backtest.metrics.maxDrawdownPct, 0.25);
    const screeningScore = backtest.metrics.totalReturnPct - 0.5 * backtest.metrics.maxDrawdownPct;
    results.push({
      candidateId: candidate.id,
      family: candidate.family,
      parameters: candidate.parameters,
      screeningScore,
      metrics: {
        totalReturnPct: backtest.metrics.totalReturnPct,
        maxDrawdownPct: backtest.metrics.maxDrawdownPct,
        tradeCount: backtest.metrics.tradeCount,
        winRatePct: backtest.metrics.winRatePct,
        profitFactor: backtest.metrics.profitFactor,
        totalFees: backtest.metrics.totalFees,
        totalSlippageCost: backtest.metrics.totalSlippageCost
      },
      dataset: backtest.dataset,
      scoreDefinition: "totalReturnPct - 0.5 * maxDrawdownPct; heuristic ranking only, not a statistical test",
      researchStage: "IN_SAMPLE_SCREEN_ONLY",
      promotionEligible: false
    });
  }
  results.sort((a, b) => b.screeningScore - a.screeningScore || a.candidateId.localeCompare(b.candidateId));
  return {
    status: "COMPLETED_RESEARCH_SCREEN",
    candidateCount: results.length,
    dataset: results[0]?.dataset ?? null,
    assumptions: { initialCash, feeBps, slippageBps, maxPositionUnits, fillModel: "next-bar-open" },
    ranking: results,
    warnings: [
      "All candidates were screened on the same supplied sample; the ranking is exposed to multiple-testing and selection bias.",
      "The heuristic score is not a probability, p-value, Sharpe ratio or evidence of future profitability.",
      "No candidate is promotion-eligible. Run pre-registered out-of-sample and walk-forward validation, costs sensitivity and independent red-team review before considering a paper trial.",
      "The current candidate families are long-only rule-based hypotheses, not learned or autonomously deployed trading systems."
    ]
  };
}

export const candidateFamilies = ["ema-trend", "rsi-mean-reversion", "donchian-breakout"];
