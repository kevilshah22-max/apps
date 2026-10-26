/**
 * MarketMind Technical Structure module.
 * Pure functions only; input is chronologically ordered OHLCV bars.
 * This module computes indicators, not trade recommendations.
 */
export function sma(values, period) {
  if (!Number.isInteger(period) || period < 1) throw new Error("period must be a positive integer");
  return values.map((_, i) => i + 1 < period ? null : values.slice(i + 1 - period, i + 1).reduce((a, b) => a + b, 0) / period);
}
export function ema(values, period) {
  if (!Number.isInteger(period) || period < 1) throw new Error("period must be a positive integer");
  const out = Array(values.length).fill(null);
  if (values.length < period) return out;
  let v = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = v;
  const alpha = 2 / (period + 1);
  for (let i = period; i < values.length; i++) { v = values[i] * alpha + v * (1 - alpha); out[i] = v; }
  return out;
}
export function rsi(values, period = 14) {
  const out = Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) { const d = values[i] - values[i - 1]; gain += Math.max(d, 0); loss += Math.max(-d, 0); }
  gain /= period; loss /= period;
  const value = () => loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
  out[period] = value();
  for (let i = period + 1; i < values.length; i++) { const d = values[i] - values[i - 1]; gain = (gain * (period - 1) + Math.max(d, 0)) / period; loss = (loss * (period - 1) + Math.max(-d, 0)) / period; out[i] = value(); }
  return out;
}
export function macd(values, fast = 12, slow = 26, signal = 9) {
  if (!(fast < slow)) throw new Error("fast period must be smaller than slow period");
  const f = ema(values, fast), s = ema(values, slow);
  const line = values.map((_, i) => f[i] === null || s[i] === null ? null : f[i] - s[i]);
  const first = line.findIndex(v => v !== null);
  const compact = first < 0 ? [] : line.slice(first);
  const signalCompact = ema(compact, signal);
  const signalLine = Array(values.length).fill(null);
  signalCompact.forEach((v, i) => { signalLine[first + i] = v; });
  return { line, signal: signalLine, histogram: line.map((v, i) => v === null || signalLine[i] === null ? null : v - signalLine[i]) };
}
export function atr(bars, period = 14) {
  const out = Array(bars.length).fill(null);
  if (bars.length <= period) return out;
  const tr = [];
  for (let i = 1; i < bars.length; i++) tr.push(Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close)));
  let value = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period] = value;
  for (let i = period + 1; i < bars.length; i++) { value = (value * (period - 1) + tr[i - 1]) / period; out[i] = value; }
  return out;
}
export function bollinger(values, period = 20, deviations = 2) {
  const mid = sma(values, period);
  const upper = Array(values.length).fill(null), lower = Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1), mean = mid[i];
    const sd = Math.sqrt(slice.reduce((sum, x) => sum + (x - mean) ** 2, 0) / period);
    upper[i] = mean + deviations * sd; lower[i] = mean - deviations * sd;
  }
  return { upper, middle: mid, lower };
}
export function supportResistance(bars, lookback = 50, bucketSize = 0.01) {
  if (!Number.isFinite(bucketSize) || bucketSize <= 0) throw new Error("bucketSize must be positive");
  const slice = bars.slice(-lookback), levels = new Map();
  for (const b of slice) for (const p of [b.high, b.low]) { const key = Math.round(p / bucketSize) * bucketSize; levels.set(key, (levels.get(key) || 0) + 1); }
  return [...levels.entries()].map(([price, touches]) => ({ price, touches })).sort((a, b) => b.touches - a.touches || a.price - b.price).slice(0, 10);
}
