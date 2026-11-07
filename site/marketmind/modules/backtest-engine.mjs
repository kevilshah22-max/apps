const BPS = 10_000;
const TIMEZONE_SUFFIX = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function finite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

function validateBars(input) {
  if (!Array.isArray(input) || input.length < 2) {
    throw new TypeError("bars must contain at least two OHLCV records");
  }

  let previousTime = -Infinity;
  return input.map((source, index) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new TypeError(`bars[${index}] must be an object`);
    }
    const { timestamp, open, high, low, close, volume } = source;
    if (typeof timestamp !== "string" || !TIMEZONE_SUFFIX.test(timestamp)) {
      throw new TypeError(`bars[${index}].timestamp must include an explicit timezone`);
    }
    const time = Date.parse(timestamp);
    if (!Number.isFinite(time)) throw new TypeError(`bars[${index}].timestamp is invalid`);
    if (time <= previousTime) throw new TypeError("bars must be strictly chronological with no duplicate timestamps");
    previousTime = time;

    const bar = {
      timestamp: new Date(time).toISOString(),
      open: finite(open, `bars[${index}].open`),
      high: finite(high, `bars[${index}].high`),
      low: finite(low, `bars[${index}].low`),
      close: finite(close, `bars[${index}].close`),
      volume: finite(volume, `bars[${index}].volume`)
    };
    if ([bar.open, bar.high, bar.low, bar.close].some(price => price <= 0)) {
      throw new RangeError(`bars[${index}] prices must be greater than zero`);
    }
    if (bar.volume < 0) throw new RangeError(`bars[${index}].volume cannot be negative`);
    if (bar.high < Math.max(bar.open, bar.close, bar.low) ||
        bar.low > Math.min(bar.open, bar.close, bar.high)) {
      throw new RangeError(`bars[${index}] has inconsistent OHLC values`);
    }
    return Object.freeze(bar);
  });
}

async function hashDataset(bars) {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto SHA-256 is unavailable in this browser context");
  const bytes = new TextEncoder().encode(JSON.stringify(bars));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function freezeHistory(bars, end) {
  return Object.freeze(bars.slice(0, end + 1));
}

function buyAndHoldBenchmark(bars, initialCash, feeRate, slippageRate) {
  const referenceEntry = bars[0].open;
  const entry = referenceEntry * (1 + slippageRate);
  const fee = entry * feeRate;
  const finalEquity = initialCash - entry - fee + bars.at(-1).close;
  return {
    definition: "Buy one unit at first bar open with configured entry slippage and fee; hold to final close with no exit fee.",
    finalEquity,
    returnPct: ((finalEquity / initialCash) - 1) * 100
  };
}

/**
 * Deterministic single-instrument OHLCV backtest.
 *
 * onBar receives only the current bar and an immutable history ending at that bar.
 * It returns { targetPosition }, where positive values are long units and negative
 * values are short units. Default execution is next-bar-open to avoid same-bar
 * close look-ahead. "same-bar-close" is available only as an explicit assumption.
 */
export async function runBacktest({
  bars: inputBars,
  onBar,
  initialCash = 10_000,
  feeBps = 0,
  slippageBps = 0,
  fillModel = "next-bar-open",
  maxPositionUnits = 1,
  strategyId = "anonymous-strategy",
  strategyVersion = "0.0.0",
  codeVersion = "unversioned",
  datasetId
} = {}) {
  if (typeof onBar !== "function") throw new TypeError("onBar must be a synchronous function");
  finite(initialCash, "initialCash");
  finite(feeBps, "feeBps");
  finite(slippageBps, "slippageBps");
  finite(maxPositionUnits, "maxPositionUnits");
  if (initialCash <= 0) throw new RangeError("initialCash must be greater than zero");
  if (feeBps < 0 || slippageBps < 0 || feeBps >= BPS || slippageBps >= BPS) {
    throw new RangeError("feeBps and slippageBps must be in [0, 10000)");
  }
  if (maxPositionUnits <= 0) throw new RangeError("maxPositionUnits must be greater than zero");
  if (!["next-bar-open", "same-bar-close"].includes(fillModel)) {
    throw new TypeError("fillModel must be next-bar-open or same-bar-close");
  }

  const bars = validateBars(inputBars);
  const feeRate = feeBps / BPS;
  const slippageRate = slippageBps / BPS;
  const datasetHash = await hashDataset(bars);
  const resolvedDatasetId = datasetId ?? datasetHash;

  let cash = initialCash;
  let position = 0;
  let averageEntryPrice = null;
  let openPositionFees = 0;
  let totalFees = 0;
  let totalSlippageCost = 0;
  let tradedNotional = 0;
  let pendingTarget = null;
  let peakEquity = initialCash;
  let maxDrawdownPct = 0;
  const equityCurve = [];
  const orders = [];
  const trades = [];

  function execute(target, referencePrice, bar, signalIndex) {
    if (target === position) return;
    const delta = target - position;
    const direction = Math.sign(delta);
    const fillPrice = referencePrice * (1 + direction * slippageRate);
    const notional = Math.abs(delta * fillPrice);
    const fee = notional * feeRate;
    const slippageCost = Math.abs(delta) * Math.abs(fillPrice - referencePrice);
    const oldPosition = position;
    const oldAbs = Math.abs(oldPosition);
    const deltaAbs = Math.abs(delta);

    cash -= delta * fillPrice;
    cash -= fee;
    totalFees += fee;
    totalSlippageCost += slippageCost;
    tradedNotional += notional;

    if (oldPosition !== 0 && Math.sign(oldPosition) !== Math.sign(delta)) {
      const closedUnits = Math.min(oldAbs, deltaAbs);
      const grossPnl = closedUnits * (fillPrice - averageEntryPrice) * Math.sign(oldPosition);
      const entryFeeShare = openPositionFees * (closedUnits / oldAbs);
      const exitFeeShare = fee * (closedUnits / deltaAbs);
      trades.push({
        entryPrice: averageEntryPrice,
        exitPrice: fillPrice,
        direction: oldPosition > 0 ? "long" : "short",
        units: closedUnits,
        grossPnl,
        fees: entryFeeShare + exitFeeShare,
        netPnl: grossPnl - entryFeeShare - exitFeeShare,
        signalTimestamp: bars[signalIndex].timestamp,
        exitTimestamp: bar.timestamp
      });
      openPositionFees -= entryFeeShare;
    }

    const nextPosition = oldPosition + delta;
    if (nextPosition === 0) {
      averageEntryPrice = null;
      openPositionFees = 0;
    } else if (oldPosition === 0 || Math.sign(nextPosition) !== Math.sign(oldPosition)) {
      averageEntryPrice = fillPrice;
      openPositionFees = fee * (Math.abs(nextPosition) / deltaAbs);
    } else if (Math.sign(oldPosition) === Math.sign(delta)) {
      averageEntryPrice = ((averageEntryPrice * oldAbs) + (fillPrice * deltaAbs)) / Math.abs(nextPosition);
      openPositionFees += fee;
    }

    position = nextPosition;
    orders.push({
      timestamp: bar.timestamp,
      signalTimestamp: bars[signalIndex].timestamp,
      fillModel,
      side: delta > 0 ? "buy" : "sell",
      units: Math.abs(delta),
      referencePrice,
      fillPrice,
      fee,
      slippageCost,
      resultingPosition: position
    });
  }

  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];

    if (fillModel === "next-bar-open" && pendingTarget !== null) {
      execute(pendingTarget, bar.open, bar, index - 1);
      pendingTarget = null;
    }

    const history = freezeHistory(bars, index);
    const signal = onBar({ bar, index, history });
    if (signal && typeof signal.then === "function") {
      throw new TypeError("onBar must be synchronous; async strategies are not supported");
    }
    if (!signal || typeof signal !== "object" || Array.isArray(signal)) {
      throw new TypeError(`onBar at index ${index} must return { targetPosition }`);
    }
    const target = finite(signal.targetPosition, `signal[${index}].targetPosition`);
    if (Math.abs(target) > maxPositionUnits) {
      throw new RangeError(`signal[${index}] exceeds maxPositionUnits`);
    }

    if (fillModel === "same-bar-close") {
      execute(target, bar.close, bar, index);
    } else {
      pendingTarget = target;
    }

    const equity = cash + position * bar.close;
    peakEquity = Math.max(peakEquity, equity);
    const drawdownPct = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 100;
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);
    equityCurve.push({
      timestamp: bar.timestamp,
      cash,
      position,
      close: bar.close,
      equity,
      drawdownPct
    });
  }

  const finalEquity = equityCurve.at(-1).equity;
  const totalReturnPct = ((finalEquity / initialCash) - 1) * 100;
  const wins = trades.filter(trade => trade.netPnl > 0);
  const losses = trades.filter(trade => trade.netPnl < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.netPnl, 0));
  const averageExposurePct = equityCurve.reduce((sum, point) =>
    sum + (Math.abs(point.position * point.close) / Math.max(point.equity, 1e-9)) * 100, 0
  ) / equityCurve.length;

  return {
    status: "COMPLETED",
    strategy: { id: strategyId, version: strategyVersion, codeVersion },
    dataset: { id: resolvedDatasetId, sha256: datasetHash, barCount: bars.length, firstTimestamp: bars[0].timestamp, lastTimestamp: bars.at(-1).timestamp },
    assumptions: { fillModel, feeBps, slippageBps, maxPositionUnits, initialCash, timezone: "timestamps must include explicit UTC offset; normalised to UTC" },
    metrics: {
      initialCash,
      finalEquity,
      netPnl: finalEquity - initialCash,
      totalReturnPct,
      grossReturnPct: (((finalEquity + totalFees + totalSlippageCost) / initialCash) - 1) * 100,
      totalFees,
      totalSlippageCost,
      turnover: tradedNotional / initialCash,
      tradeCount: trades.length,
      winRatePct: trades.length ? (wins.length / trades.length) * 100 : 0,
      expectancy: trades.length ? trades.reduce((sum, trade) => sum + trade.netPnl, 0) / trades.length : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? null : 0),
      maxDrawdownPct,
      averageExposurePct
    },
    benchmark: buyAndHoldBenchmark(bars, initialCash, feeRate, slippageRate),
    orders,
    trades,
    equityCurve,
    limitations: [
      "Single instrument and fixed signed-unit position sizing; no portfolio netting, leverage, funding, borrow, market impact or partial fills.",
      "OHLCV bars do not reveal intrabar price paths; stop/limit order simulation is not implemented.",
      "A pending next-bar-open signal on the final bar is not filled.",
      "Results are historical simulations, not forecasts or evidence of future profitability."
    ]
  };
}
