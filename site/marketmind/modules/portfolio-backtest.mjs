const BPS = 10_000;
const ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function number(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function validateSeries(symbol, input) {
  if (typeof symbol !== "string" || !symbol.trim()) throw new TypeError("Asset symbols must be non-empty strings");
  if (!Array.isArray(input) || input.length < 2) throw new TypeError(`${symbol} requires at least two OHLCV bars`);
  let prior = -Infinity;
  return input.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new TypeError(`${symbol}[${index}] must be an object`);
    if (typeof row.timestamp !== "string" || !ZONE.test(row.timestamp)) throw new TypeError(`${symbol}[${index}] timestamp must include an explicit timezone`);
    const time = Date.parse(row.timestamp);
    if (!Number.isFinite(time) || time <= prior) throw new TypeError(`${symbol} bars must be strictly chronological with unique timestamps`);
    prior = time;
    const bar = {
      timestamp: new Date(time).toISOString(),
      open: number(row.open, `${symbol}[${index}].open`),
      high: number(row.high, `${symbol}[${index}].high`),
      low: number(row.low, `${symbol}[${index}].low`),
      close: number(row.close, `${symbol}[${index}].close`),
      volume: number(row.volume, `${symbol}[${index}].volume`)
    };
    if ([bar.open, bar.high, bar.low, bar.close].some(x => x <= 0) || bar.volume < 0) throw new RangeError(`${symbol}[${index}] has non-positive prices or negative volume`);
    if (bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close, bar.high)) {
      throw new RangeError(`${symbol}[${index}] has inconsistent OHLC values`);
    }
    return Object.freeze(bar);
  });
}

async function sha256(value) {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto SHA-256 is unavailable");
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

function snapshot(history, index) {
  return Object.freeze(Object.fromEntries(Object.entries(history).map(([symbol, bars]) =>
    [symbol, Object.freeze(bars.slice(0, index + 1))]
  )));
}

/**
 * Synchronous strategy callback receives immutable, point-in-time OHLCV histories
 * and returns { weights: { SYMBOL: signed portfolio-equity weight } }.
 * Signals execute at the next aligned bar open. Weights are re-sized against
 * prior-bar equity; no current/future close is used to set the fill quantity.
 */
export async function runPortfolioBacktest({
  series: inputSeries,
  onBar,
  initialCash = 100_000,
  feeBps = 5,
  slippageBps = 5,
  maxGrossExposure = 1,
  maxAbsWeight = 1,
  strategyId = "anonymous-portfolio-strategy",
  strategyVersion = "0.0.0",
  codeVersion = "unversioned",
  datasetId
} = {}) {
  if (!inputSeries || typeof inputSeries !== "object" || Array.isArray(inputSeries)) throw new TypeError("series must be an object keyed by asset symbol");
  const symbols = Object.keys(inputSeries).sort();
  if (symbols.length < 2) throw new TypeError("Portfolio backtest requires at least two assets");
  if (symbols.length > 100) throw new RangeError("Portfolio backtest supports at most 100 assets per run");
  if (typeof onBar !== "function") throw new TypeError("onBar must be a synchronous function");
  number(initialCash, "initialCash"); number(feeBps, "feeBps"); number(slippageBps, "slippageBps");
  number(maxGrossExposure, "maxGrossExposure"); number(maxAbsWeight, "maxAbsWeight");
  if (initialCash <= 0) throw new RangeError("initialCash must be positive");
  if (feeBps < 0 || feeBps >= BPS || slippageBps < 0 || slippageBps >= BPS) throw new RangeError("feeBps and slippageBps must be in [0, 10000)");
  if (maxGrossExposure <= 0 || maxGrossExposure > 5 || maxAbsWeight <= 0 || maxAbsWeight > maxGrossExposure) throw new RangeError("Exposure limits must satisfy 0 < maxAbsWeight <= maxGrossExposure <= 5");

  const barsBySymbol = Object.fromEntries(symbols.map(symbol => [symbol, validateSeries(symbol, inputSeries[symbol])]));
  const timestamps = barsBySymbol[symbols[0]].map(bar => bar.timestamp);
  for (const symbol of symbols) {
    const bars = barsBySymbol[symbol];
    if (bars.length !== timestamps.length || bars.some((bar, i) => bar.timestamp !== timestamps[i])) {
      throw new TypeError("All asset series must have identical aligned timestamps; resample/align explicitly before backtesting");
    }
  }
  const datasetHash = await sha256(Object.fromEntries(symbols.map(symbol => [symbol, barsBySymbol[symbol]])));
  const feeRate = feeBps / BPS, slipRate = slippageBps / BPS;
  const units = Object.fromEntries(symbols.map(symbol => [symbol, 0]));
  let cash = initialCash, priorEquity = initialCash, pendingWeights = null;
  let totalFees = 0, totalSlippageCost = 0, turnoverNotional = 0, peakEquity = initialCash, maxDrawdownPct = 0;
  const orders = [], equityCurve = [], assetLedger = [];
  const targetHistory = [];

  function execute(weights, index) {
    const gross = Object.values(weights).reduce((sum, weight) => sum + Math.abs(weight), 0);
    if (gross > maxGrossExposure + 1e-10) throw new RangeError(`Signal gross exposure ${gross.toFixed(6)} exceeds maxGrossExposure ${maxGrossExposure}`);
    for (const [symbol, weight] of Object.entries(weights)) {
      if (!symbols.includes(symbol)) throw new TypeError(`Unknown asset in target weights: ${symbol}`);
      if (Math.abs(weight) > maxAbsWeight + 1e-10) throw new RangeError(`${symbol} target weight exceeds maxAbsWeight`);
    }
    for (const symbol of symbols) {
      const weight = weights[symbol] ?? 0;
      const bar = barsBySymbol[symbol][index];
      const targetUnits = priorEquity * weight / bar.open;
      const delta = targetUnits - units[symbol];
      if (Math.abs(delta) < 1e-12) continue;
      const referencePrice = bar.open;
      const fillPrice = referencePrice * (1 + Math.sign(delta) * slipRate);
      const notional = Math.abs(delta * fillPrice);
      const fee = notional * feeRate;
      const slippageCost = Math.abs(delta) * Math.abs(fillPrice - referencePrice);
      cash -= delta * fillPrice + fee;
      units[symbol] = targetUnits;
      totalFees += fee; totalSlippageCost += slippageCost; turnoverNotional += notional;
      orders.push({
        symbol, timestamp: bar.timestamp, signalTimestamp: timestamps[index - 1],
        side: delta > 0 ? "buy" : "sell", units: Math.abs(delta), signedDelta: delta,
        referencePrice, fillPrice, fee, slippageCost, resultingUnits: targetUnits,
        targetWeight: weight, fillModel: "next-bar-open"
      });
    }
  }

  for (let index = 0; index < timestamps.length; index += 1) {
    if (index > 0 && pendingWeights !== null) {
      execute(pendingWeights, index);
      pendingWeights = null;
    }
    const current = Object.fromEntries(symbols.map(symbol => [symbol, barsBySymbol[symbol][index]]));
    const history = snapshot(barsBySymbol, index);
    const signal = onBar({ timestamp: timestamps[index], index, symbols: Object.freeze([...symbols]), bars: Object.freeze(current), history });
    if (signal && typeof signal.then === "function") throw new TypeError("onBar must be synchronous");
    if (!signal || typeof signal !== "object" || Array.isArray(signal) || !signal.weights || typeof signal.weights !== "object" || Array.isArray(signal.weights)) {
      throw new TypeError(`onBar at index ${index} must return { weights: { SYMBOL: number } }`);
    }
    const weights = {};
    for (const [symbol, raw] of Object.entries(signal.weights)) {
      if (!symbols.includes(symbol)) throw new TypeError(`Unknown asset in target weights: ${symbol}`);
      const weight = number(raw, `weights.${symbol}`);
      if (Math.abs(weight) > maxAbsWeight + 1e-10) throw new RangeError(`${symbol} target weight exceeds maxAbsWeight`);
      weights[symbol] = weight;
    }
    const gross = Object.values(weights).reduce((sum, weight) => sum + Math.abs(weight), 0);
    if (gross > maxGrossExposure + 1e-10) throw new RangeError(`Signal gross exposure ${gross.toFixed(6)} exceeds maxGrossExposure ${maxGrossExposure}`);
    targetHistory.push({ timestamp: timestamps[index], weights: { ...weights } });
    pendingWeights = weights;

    const assetValues = Object.fromEntries(symbols.map(symbol => [symbol, units[symbol] * current[symbol].close]));
    const marketValue = Object.values(assetValues).reduce((sum, value) => sum + value, 0);
    const equity = cash + marketValue;
    const grossExposure = Object.values(assetValues).reduce((sum, value) => sum + Math.abs(value), 0);
    const grossExposurePct = equity > 0 ? grossExposure / equity * 100 : null;
    peakEquity = Math.max(peakEquity, equity);
    const drawdownPct = peakEquity > 0 ? (peakEquity - equity) / peakEquity * 100 : 100;
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);
    priorEquity = equity;
    equityCurve.push({ timestamp: timestamps[index], cash, equity, marketValue, grossExposure, grossExposurePct, drawdownPct });
    for (const symbol of symbols) assetLedger.push({
      timestamp: timestamps[index], symbol, units: units[symbol],
      close: current[symbol].close, marketValue: assetValues[symbol],
      weightPct: equity > 0 ? assetValues[symbol] / equity * 100 : null
    });
  }

  const finalEquity = equityCurve.at(-1).equity;
  const totalReturnPct = (finalEquity / initialCash - 1) * 100;
  const benchmarkFinal = symbols.reduce((sum, symbol) => {
    const allocation = initialCash / symbols.length;
    const firstOpen = barsBySymbol[symbol][0].open;
    const lastClose = barsBySymbol[symbol].at(-1).close;
    const entry = firstOpen * (1 + slipRate);
    const fee = allocation * feeRate;
    const quantity = Math.max(0, (allocation - fee) / entry);
    return sum + quantity * lastClose;
  }, 0);
  const perAsset = Object.fromEntries(symbols.map(symbol => {
    const start = barsBySymbol[symbol][0].open, end = barsBySymbol[symbol].at(-1).close;
    return [symbol, { firstOpen: start, lastClose: end, buyHoldReturnPct: (end / start - 1) * 100,
      finalUnits: units[symbol], finalMarketValue: units[symbol] * end }];
  }));
  const averageGrossExposurePct = equityCurve.reduce((sum, point) => sum + (point.grossExposurePct ?? 0), 0) / equityCurve.length;
  return {
    status: "COMPLETED",
    strategy: { id: strategyId, version: strategyVersion, codeVersion },
    dataset: { id: datasetId ?? datasetHash, sha256: datasetHash, symbols, barCountPerAsset: timestamps.length, firstTimestamp: timestamps[0], lastTimestamp: timestamps.at(-1) },
    assumptions: { fillModel: "next-bar-open", feeBps, slippageBps, maxGrossExposure, maxAbsWeight, initialCash, alignment: "identical UTC-normalised timestamps required", sizing: "target weights sized using prior-bar equity and next-bar open" },
    metrics: { initialCash, finalEquity, netPnl: finalEquity - initialCash, totalReturnPct,
      totalFees, totalSlippageCost, turnover: turnoverNotional / initialCash,
      maxDrawdownPct, averageGrossExposurePct, finalGrossExposurePct: equityCurve.at(-1).grossExposurePct,
      barCount: timestamps.length, assetCount: symbols.length },
    benchmark: { definition: "Equal-weight buy-and-hold across all assets, entered at first bar open with configured entry fee and slippage; held to final close.",
      finalEquity: benchmarkFinal, returnPct: (benchmarkFinal / initialCash - 1) * 100 },
    perAsset, targetHistory, orders, equityCurve, assetLedger,
    limitations: [
      "No leverage financing, borrow fees, funding rates, dividends, corporate actions, market impact, partial fills or taxes.",
      "All assets must have identical timestamps; missing bars must be explicitly aligned/resampled before use.",
      "Signals execute at next-bar open; final-bar signals remain unfilled.",
      "No intrabar stop/limit simulation; OHLCV does not reveal the path within a bar.",
      "Historical simulation is not a forecast or evidence of future profitability."
    ]
  };
}
