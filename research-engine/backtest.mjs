// Single source of truth: the same browser-safe implementation powers MarketMind
// and the Node research runner. Node 22 and modern browsers provide Web Crypto.
export { runBacktest } from "../site/marketmind/modules/backtest-engine.mjs";
