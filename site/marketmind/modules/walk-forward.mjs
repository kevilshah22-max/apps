import { runBacktest } from "./backtest-engine.mjs";
import { screenStrategyCandidates, createStrategyCandidates } from "./candidate-lab.mjs";

function benchmarkReturn(testBars, initialCash, feeBps, slippageBps) {
  const feeRate = feeBps / 10_000;
  const slipRate = slippageBps / 10_000;
  const referenceEntry = testBars[0].open;
  const entry = referenceEntry * (1 + slipRate);
  const fee = entry * feeRate;
  const finalEquity = initialCash - entry - fee + testBars.at(-1).close;
  return ((finalEquity / initialCash) - 1) * 100;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Expanding-window walk-forward research:
 * - screen candidates using only bars before each test window;
 * - freeze the selected candidate for the next test window;
 * - execute only during the out-of-sample segment at next-bar-open;
 * - never promote a candidate or infer a probability.
 */
export async function evaluateWalkForward({
  bars,
  trainWindow = 80,
  testWindow = 20,
  step = 20,
  maxCandidates = 30,
  initialCash = 10_000,
  feeBps = 5,
  slippageBps = 5,
  maxPositionUnits = 1,
  strategyVersion = "1.0.0",
  codeVersion = "bright-future-walk-forward"
} = {}) {
  if (!Array.isArray(bars) || bars.length < 2) throw new TypeError("bars must contain at least two OHLCV records");
  for (const [key, value] of Object.entries({ trainWindow, testWindow, step, maxCandidates })) {
    if (!Number.isInteger(value) || value <= 0) throw new RangeError(key + " must be a positive integer");
  }
  if (trainWindow < 80) throw new RangeError("trainWindow must be at least 80 bars to cover the slowest default candidate warm-up");
  if (testWindow < 2) throw new RangeError("testWindow must be at least 2 bars");
  if (maxCandidates > 100) throw new RangeError("maxCandidates cannot exceed 100");
  if (bars.length < trainWindow + testWindow) throw new RangeError("Insufficient bars for one complete train/test fold");

  const definitions = createStrategyCandidates();
  const folds = [];
  for (let trainEnd = trainWindow; trainEnd + testWindow <= bars.length; trainEnd += step) {
    const testEnd = trainEnd + testWindow;
    const trainBars = bars.slice(0, trainEnd);
    const trainingScreen = await screenStrategyCandidates({
      bars: trainBars, initialCash, feeBps, slippageBps, maxPositionUnits, maxCandidates,
      strategyVersion, codeVersion: codeVersion + ":training-screen"
    });
    const selected = trainingScreen.ranking[0];
    const strategy = definitions.find(candidate => candidate.id === selected.candidateId);
    if (!strategy) throw new Error("Selected candidate definition is missing: " + selected.candidateId);

    const evaluationBars = bars.slice(0, testEnd);
    const result = await runBacktest({
      bars: evaluationBars,
      onBar: context => context.index < trainEnd ? { targetPosition: 0 } : strategy.onBar(context),
      initialCash, feeBps, slippageBps, maxPositionUnits,
      strategyId: strategy.id, strategyVersion, codeVersion
    });
    const testBars = bars.slice(trainEnd, testEnd);
    const testEquity = result.metrics.finalEquity;
    folds.push({
      fold: folds.length + 1,
      training: {
        start: trainBars[0].timestamp,
        end: trainBars.at(-1).timestamp,
        barCount: trainBars.length,
        selectedCandidate: selected.candidateId,
        family: selected.family,
        parameters: selected.parameters,
        screeningScore: selected.screeningScore,
        datasetSha256: trainingScreen.dataset.sha256
      },
      outOfSample: {
        start: testBars[0].timestamp,
        end: testBars.at(-1).timestamp,
        barCount: testBars.length,
        evaluationDatasetSha256: result.dataset.sha256,
        finalEquity: testEquity,
        totalReturnPct: result.metrics.totalReturnPct,
        maxDrawdownPct: result.metrics.maxDrawdownPct,
        tradeCount: result.metrics.tradeCount,
        totalFees: result.metrics.totalFees,
        totalSlippageCost: result.metrics.totalSlippageCost,
        benchmarkReturnPct: benchmarkReturn(testBars, initialCash, feeBps, slippageBps)
      }
    });
  }
  if (!folds.length) throw new RangeError("No complete walk-forward folds could be formed");
  const returns = folds.map(fold => fold.outOfSample.totalReturnPct);
  const drawdowns = folds.map(fold => fold.outOfSample.maxDrawdownPct);
  return {
    status: "COMPLETED_WALK_FORWARD_RESEARCH",
    method: "Expanding training window; top in-sample candidate frozen for each subsequent test window",
    foldCount: folds.length,
    aggregate: {
      meanOutOfSampleReturnPct: returns.reduce((sum, value) => sum + value, 0) / returns.length,
      medianOutOfSampleReturnPct: median(returns),
      worstOutOfSampleReturnPct: Math.min(...returns),
      meanMaxDrawdownPct: drawdowns.reduce((sum, value) => sum + value, 0) / drawdowns.length,
      totalOutOfSampleTrades: folds.reduce((sum, fold) => sum + fold.outOfSample.tradeCount, 0),
      meanBenchmarkReturnPct: folds.reduce((sum, fold) => sum + fold.outOfSample.benchmarkReturnPct, 0) / folds.length
    },
    assumptions: { trainWindow, testWindow, step, maxCandidates, initialCash, feeBps, slippageBps, maxPositionUnits, fillModel: "next-bar-open" },
    folds,
    researchStage: "WALK_FORWARD_RESEARCH_ONLY",
    promotionEligible: false,
    warnings: [
      "The candidate is selected from a bounded in-sample search at each fold; multiple-testing and selection bias remain.",
      "Fold results are historical out-of-sample diagnostics, not calibrated probabilities or forecasts.",
      "Overlapping or repeated research on the same dataset can still contaminate the holdout; preserve a final untouched test set.",
      "No candidate is promoted. Independent red-team review, regime sensitivity, costs stress and paper-trial gates remain mandatory."
    ]
  };
}
