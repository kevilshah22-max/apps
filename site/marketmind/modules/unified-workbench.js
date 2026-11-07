import { validateOHLCV } from "./data-integrity.js";
import { ema, rsi, macd, atr, bollinger, supportResistance } from "./technical.js";
import { runBacktest } from "./backtest-engine.mjs";
import { runPortfolioBacktest } from "./portfolio-backtest.mjs";
import { screenStrategyCandidates } from "../../../research-engine/candidate-lab.mjs";
import { evaluateWalkForward } from "../../../research-engine/walk-forward.mjs";
import { buildThesis } from "./thesis-planner.js";
import { analysePortfolio } from "./portfolio-risk.js";
import { auditCatalysts } from "./catalyst-radar.js";
import { calculateFundamentals } from "./fundamental-quality.js";
import { compareAssets } from "./cross-asset.js";
import { aggregateSentiment } from "./sentiment-positioning.js";
import { reviewResearch } from "./independent-review.js";
import { assembleMarketReport } from "./orchestrator.js";

const $ = id => document.getElementById(id);
const optionalJSON = id => {
  const raw = $(id)?.value?.trim();
  return raw ? JSON.parse(raw) : null;
};
function record(moduleId, data, source, observations = []) {
  return {
    moduleId, status: "COMPUTED FROM PROVIDED INPUT", asOf: new Date().toISOString(),
    source, observations, limitations: data?.limitations || [], warnings: data?.warnings || [], data
  };
}
function showError(message) {
  $("unifiedStatus").textContent = message;
  $("unifiedStatus").className = "notice";
}
function emaLast(history, period) {
  const values = history.map(bar => bar.close);
  if (values.length < period) return null;
  let value = values.slice(0, period).reduce((sum, price) => sum + price, 0) / period;
  const smoothing = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    value = values[index] * smoothing + value * (1 - smoothing);
  }
  return value;
}



async function runWalkForwardResearch() {
  try {
    const source = window.marketmindGetCandles?.() || [];
    if (source.length < 2) throw new TypeError("Load and analyse OHLCV data first.");
    const bars = source.map(bar => ({
      timestamp: bar.time, open: bar.open, high: bar.high, low: bar.low,
      close: bar.close, volume: bar.volume ?? 0
    }));
    const trainWindow = Number($("wfTrainWindow").value);
    const testWindow = Number($("wfTestWindow").value);
    const result = await evaluateWalkForward({
      bars, trainWindow, testWindow, step: testWindow,
      maxCandidates: 21, initialCash: 10000, feeBps: 5, slippageBps: 5,
      maxPositionUnits: 1, strategyVersion: "1.0.0",
      codeVersion: "marketmind-walk-forward"
    });
    $("candidateStatus").textContent = `Walk-forward complete: ${result.foldCount} chronological folds. All results remain research-only and promotion-ineligible; preserve a final untouched holdout.`;
    $("candidateReport").textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    $("candidateStatus").textContent = "Walk-forward run rejected: " + error.message;
    $("candidateReport").textContent = "No walk-forward result generated. Check explicit timezone timestamps, history length and fold settings.";
  }
}
$("runWalkForward")?.addEventListener("click", runWalkForwardResearch);

async function runCandidateScreen() {
  try {
    const source = window.marketmindGetCandles?.() || [];
    if (source.length < 2) throw new TypeError("Load and analyse OHLCV data first.");
    const bars = source.map(bar => ({
      timestamp: bar.time, open: bar.open, high: bar.high, low: bar.low,
      close: bar.close, volume: bar.volume ?? 0
    }));
    const result = await screenStrategyCandidates({
      bars, initialCash: 10000, feeBps: 5, slippageBps: 5,
      maxPositionUnits: 1, maxCandidates: 30,
      strategyVersion: "1.0.0", codeVersion: "marketmind-candidate-lab"
    });
    $("candidateStatus").textContent = `Completed ${result.candidateCount} candidate screens. All remain IN_SAMPLE_SCREEN_ONLY and promotion-ineligible. Dataset timezone and provenance must be verified.`;
    $("candidateReport").textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    $("candidateStatus").textContent = "Candidate screen rejected: " + error.message;
    $("candidateReport").textContent = "No candidate ranking generated. Supply valid OHLCV timestamps with explicit UTC offsets.";
  }
}
$("runCandidateScreen")?.addEventListener("click", runCandidateScreen);

async function runMultiAssetPortfolio() {
  try {
    const input = JSON.parse($("portfolioSeriesJson").value);
    const series = input.series;
    if (!series || typeof series !== "object" || Array.isArray(series)) throw new TypeError("JSON must contain a series object keyed by ticker.");
    const symbols = Object.keys(series);
    if (symbols.length < 2) throw new TypeError("Provide at least two instruments.");
    const targetWeights = input.targetWeights || Object.fromEntries(symbols.map(symbol => [symbol, 1 / symbols.length]));
    const result = await runPortfolioBacktest({
      series,
      onBar: () => ({ weights: targetWeights }),
      initialCash: Number(input.initialCash ?? 100000),
      feeBps: Number(input.feeBps ?? 5),
      slippageBps: Number(input.slippageBps ?? 5),
      maxGrossExposure: Number(input.maxGrossExposure ?? 1),
      maxAbsWeight: Number(input.maxAbsWeight ?? 1),
      strategyId: input.targetWeights ? "user-defined-static-target-weights" : "equal-weight-static-baseline",
      strategyVersion: "1.0.0",
      codeVersion: "marketmind-portfolio-engine"
    });
    $("portfolioStatus").textContent = `Completed: ${symbols.length} assets, ${result.dataset.barCountPerAsset} aligned bars. Review costs, exposure and limitations; this is a historical simulation, not a forecast.`;
    $("portfolioReport").textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    $("portfolioStatus").textContent = "Portfolio run rejected: " + error.message;
    $("portfolioReport").textContent = "No result generated. Correct the input and rerun.";
  }
}
$("runPortfolioBacktest")?.addEventListener("click", runMultiAssetPortfolio);
$("loadPortfolioDemo")?.addEventListener("click", () => {
  const make = (symbol, start, moves) => ({ [symbol]: moves.map((close, i) => {
    const open = i === 0 ? start : moves[i - 1];
    return { timestamp: `2026-01-0${i + 1}T00:00:00Z`, open, high: Math.max(open, close) + 1, low: Math.min(open, close) - 1, close, volume: 1000 + i * 100 };
  }) });
  const series = { ...make("DEMO-A", 100, [101, 103, 102, 105]), ...make("DEMO-B", 50, [50.5, 51, 52, 51.5]) };
  $("portfolioSeriesJson").value = JSON.stringify({ series, initialCash: 10000, feeBps: 5, slippageBps: 5 }, null, 2);
  $("portfolioStatus").textContent = "Synthetic demonstration only. Replace all DEMO symbols and prices with verified historical data before interpreting results.";
});

async function runWorkbench() {
  const bars = window.marketmindGetCandles?.() || [];
  if (bars.length < 2) {
    showError("Load and analyse an OHLCV CSV above before running the specialist workbench.");
    return;
  }
  const modules = [];
  const validation = validateOHLCV(bars, { source: "user-supplied CSV" });
  modules.push(record("market-data-integrity", validation, "User-supplied OHLCV CSV"));
  const closes = validation.bars.map(b => b.close);
  const e20 = ema(closes, 20), e50 = ema(closes, 50), r = rsi(closes, 14);
  const m = macd(closes), a = atr(validation.bars, 14), bb = bollinger(closes, 20);
  const levels = supportResistance(validation.bars, 50, Math.max((Math.max(...closes)-Math.min(...closes))/100, Number.EPSILON));
  const last = validation.bars.at(-1);
  const observations = [];
  if (e20.at(-1) !== null) observations.push({ metric: "close_vs_ema20", direction: last.close >= e20.at(-1) ? "bullish" : "bearish", value: last.close-e20.at(-1) });
  if (e20.at(-1) !== null && e50.at(-1) !== null) observations.push({ metric: "ema_alignment", direction: e20.at(-1) >= e50.at(-1) ? "bullish" : "bearish", value: e20.at(-1)-e50.at(-1) });
  modules.push(record("technical-structure", {
    lastClose: last.close, ema20: e20.at(-1), ema50: e50.at(-1), rsi14: r.at(-1),
    macd: { line: m.line.at(-1), signal: m.signal.at(-1), histogram: m.histogram.at(-1) },
    atr14: a.at(-1), bollinger: { upper: bb.upper.at(-1), middle: bb.middle.at(-1), lower: bb.lower.at(-1) },
    approximateSupportResistance: levels, warnings: ["Indicator outputs depend on the supplied timeframe and chosen parameters."]
  }, "Locally computed from supplied OHLCV", observations));
  try {
    const engineBars = validation.bars.map(bar => ({
      timestamp: bar.time, open: bar.open, high: bar.high, low: bar.low,
      close: bar.close, volume: bar.volume ?? 0
    }));
    const result = await runBacktest({
      bars: engineBars,
      onBar: ({ history }) => {
        const fast = emaLast(history, 10);
        const slow = emaLast(history, 30);
        return { targetPosition: fast !== null && slow !== null && fast > slow ? 1 : 0 };
      },
      initialCash: 10_000, feeBps: 5, slippageBps: 5,
      strategyId: "marketmind-ema-regime", strategyVersion: "1.0.0",
      codeVersion: "marketmind-browser-engine"
    });
    modules.push(record("strategy-lab", result,
      "Reproducible chronological engine; next-bar-open fills; 5 bps fee + 5 bps slippage per side"));
  } catch (e) {
    modules.push(record("strategy-lab", {
      status: "INSUFFICIENT DATA", reason: e.message,
      warnings: ["Backtest skipped; timestamps must include an explicit UTC offset. This is not a trade signal."]
    }, "Local computation"));
  }
  const optional = [
    ["portfolio-risk", "portfolioJson", value => analysePortfolio(value.positions || value, value.options || {})],
    ["catalyst-radar", "catalystJson", value => auditCatalysts(Array.isArray(value) ? value : value.events || [], Date.now(), value.options || {})],
    ["fundamental-quality", "fundamentalJson", value => calculateFundamentals(value)],
    ["cross-asset", "crossAssetJson", value => compareAssets(value.series || value)],
    ["sentiment-positioning", "sentimentJson", value => aggregateSentiment(Array.isArray(value) ? value : value.observations || [], Date.now(), value.options || {})],
    ["trade-thesis", "thesisJson", value => buildThesis(value)],
    ["independent-review", "redteamJson", value => reviewResearch(value)]
  ];
  const parseIssues = [];
  for (const [id, field, run] of optional) {
    try {
      const value = optionalJSON(field);
      if (value === null) continue;
      const data = run(value);
      modules.push(record(id, data, "User/import-supplied JSON; not independently verified"));
    } catch (e) {
      parseIssues.push({ moduleId: id, error: e.message });
    }
  }
  const report = assembleMarketReport({
    instrument: $("instrumentName").value.trim() || null,
    timeframe: $("timeframeName").value.trim() || null,
    maxAgeHours: 24, modules
  });
  report.inputIssues = parseIssues;
  report.nextChecks = [...report.nextChecks, "Optional specialist modules are skipped until JSON inputs are supplied; an omitted module is not evidence that the risk is absent."];
  $("unifiedStatus").textContent = `Assembled ${modules.length} specialist outputs. ${parseIssues.length ? parseIssues.length + " optional input(s) need JSON correction." : "No JSON parsing errors."} Review the evidence and limitations before acting.`;
  $("unifiedReport").textContent = JSON.stringify(report, null, 2);
}
$("runSpecialists").addEventListener("click", runWorkbench);
$("loadExamples").addEventListener("click", () => {
  $("portfolioJson").value = JSON.stringify({ baseCurrency: "USD", positions: [{ symbol: "DEMO-A", marketValue: 6000, sector: "Example", assetClass: "Equity" }, { symbol: "DEMO-B", marketValue: 4000, sector: "Example", assetClass: "Equity" }], options: { singleNameCapPct: 70 } }, null, 2);
  $("catalystJson").value = JSON.stringify({ events: [{ title: "Example event — replace with verified event", datetime: new Date(Date.now()+24*3600000).toISOString(), impact: "unspecified", sourceName: "Example only", sourceUrl: "https://example.com", notes: "Synthetic placeholder; not a real catalyst" }] }, null, 2);
  $("fundamentalJson").value = JSON.stringify({ entity: "DEMO — not a real company", periodEnd: "2026-09-30", currency: "USD", revenue: 100, grossProfit: 40, operatingIncome: 15, netIncome: 10, currentAssets: 80, currentLiabilities: 40, totalDebt: 20, equity: 50, operatingCashFlow: 18, capitalExpenditure: 5 }, null, 2);
  $("sentimentJson").value = JSON.stringify({ observations: [{ score: 0.2, observedAt: new Date().toISOString(), sourceName: "Example only", sourceUrl: "https://example.com" }] }, null, 2);
  $("thesisJson").value = JSON.stringify({ instrument: "DEMO", timeframe: "daily", entryCondition: "Example condition to replace", invalidation: "Example invalidation to replace", horizon: "Example horizon", bullCase: "Example upside case", baseCase: "Example base case", bearCase: "Example downside case", bullTarget: "", baseTarget: "", bearTarget: "" }, null, 2);
  $("redteamJson").value = JSON.stringify({ dataProvenance: false, outOfSample: false, costsIncluded: false, lookAheadTested: false, survivorshipAddressed: false, benchmarkCompared: false, sampleSizeReviewed: false, regimeSensitivity: false, parametersPrecommitted: false, riskLimitsDefined: false }, null, 2);
  $("crossAssetJson").value = JSON.stringify({ series: { "DEMO-A": [{ time: "2026-01-01", close: 100 }, { time: "2026-01-02", close: 101 }, { time: "2026-01-03", close: 102 }], "DEMO-B": [{ time: "2026-01-01", close: 100 }, { time: "2026-01-02", close: 99 }, { time: "2026-01-03", close: 98 }] } }, null, 2);
  showError("Synthetic example inputs loaded. Replace every DEMO/example value with verified data before interpreting any result.");
});
