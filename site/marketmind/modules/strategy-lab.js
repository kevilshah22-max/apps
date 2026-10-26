/**
 * MarketMind Strategy Lab: transparent long-only EMA cross research backtest.
 * Signals are evaluated at bar close and trades execute at the NEXT bar open,
 * preventing same-bar look-ahead. This is research code, not investment advice.
 */
function emaSeries(values, period) {
  const out = Array(values.length).fill(null);
  if (values.length < period) return out;
  let v = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = v; const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) { v = values[i] * k + v * (1 - k); out[i] = v; }
  return out;
}
export function backtestEmaCross(bars, options = {}) {
  const fast = options.fast ?? 10, slow = options.slow ?? 30;
  const feeBps = options.feeBps ?? 5, slippageBps = options.slippageBps ?? 5;
  if (!Array.isArray(bars) || bars.length < slow + 3) throw new Error("Not enough bars for the selected slow EMA; provide a longer history.");
  if (!Number.isInteger(fast) || !Number.isInteger(slow) || fast < 2 || slow <= fast) throw new Error("Require integer periods with 2 <= fast < slow.");
  if (![feeBps, slippageBps].every(Number.isFinite) || feeBps < 0 || slippageBps < 0) throw new Error("Fees and slippage must be non-negative basis points.");
  const closes = bars.map(b => Number(b.close)), opens = bars.map(b => Number(b.open));
  if (closes.some(x => !Number.isFinite(x) || x <= 0) || opens.some(x => !Number.isFinite(x) || x <= 0)) throw new Error("Bars must contain positive finite open and close prices.");
  const f = emaSeries(closes, fast), s = emaSeries(closes, slow);
  const friction = (feeBps + slippageBps) / 10000;
  let position = null, equity = 1, peak = 1, maxDrawdown = 0;
  const trades = [], curve = [{ index: 0, equity: 1 }];
  // Signal at i close; enter/exit at i+1 open. Final bar cannot execute a new signal.
  for (let i = 1; i < bars.length - 1; i++) {
    if (f[i] === null || s[i] === null || f[i - 1] === null || s[i - 1] === null) continue;
    const crossUp = f[i - 1] <= s[i - 1] && f[i] > s[i];
    const crossDown = f[i - 1] >= s[i - 1] && f[i] < s[i];
    const fill = opens[i + 1];
    if (!position && crossUp) {
      position = { entryIndex: i + 1, entry: fill * (1 + friction), signalIndex: i, equityAtEntry: equity };
    } else if (position && crossDown) {
      const exit = fill * (1 - friction), ret = exit / position.entry - 1;
      equity *= 1 + ret;
      trades.push({ entryIndex: position.entryIndex, exitIndex: i + 1, entry: position.entry, exit, returnPct: ret * 100, equityAfter: equity });
      position = null;
    }
    peak = Math.max(peak, equity); maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak);
    curve.push({ index: i + 1, equity });
  }
  if (position) {
    const exit = closes[closes.length - 1] * (1 - friction), ret = exit / position.entry - 1;
    equity *= 1 + ret;
    trades.push({ entryIndex: position.entryIndex, exitIndex: bars.length - 1, entry: position.entry, exit, returnPct: ret * 100, equityAfter: equity, forcedEndExit: true });
  }
  const wins = trades.filter(t => t.returnPct > 0), losses = trades.filter(t => t.returnPct <= 0);
  const grossWin = wins.reduce((a, t) => a + t.returnPct, 0), grossLoss = -losses.reduce((a, t) => a + t.returnPct, 0);
  return {
    strategy: "long-only EMA crossover", parameters: { fast, slow, feeBps, slippageBps },
    bars: bars.length, trades: trades.length, winRatePct: trades.length ? wins.length / trades.length * 100 : null,
    totalReturnPct: (equity - 1) * 100, maxDrawdownPct: maxDrawdown * 100,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? null : 0),
    trades, equityCurve: curve,
    warnings: ["Historical simulation is not a forecast.", "No dividends, borrow costs, funding, taxes, market impact, partial fills or instrument-specific contract rules are modelled.", "Results are sensitive to timeframe, parameter choice and sample selection.", "Use walk-forward/out-of-sample testing and compare against a benchmark before drawing conclusions."]
  };
}
