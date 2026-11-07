# MarketMind: modular trading intelligence platform

## Product objective
Build a zero-budget, evidence-led research and decision-support workspace. Specialist tools should be independent, testable modules with stable input/output contracts; the MarketMind shell coordinates them and presents one coherent trade thesis. This is not an automated broker or a promise of profitable trades.

## Specialist branches / workstreams
1. **Market Data & Integrity** — import OHLCV CSV, validate timestamps/columns/duplicates/gaps, retain source and timeframe metadata, distinguish delayed/sample/user-provided data.
2. **Technical Structure** — trend regime, EMA/SMA, RSI, MACD, ATR, volatility, support/resistance, breakout and mean-reversion context.
3. **Strategy Lab** — explicit rules, chronological/walk-forward backtests, fees/slippage, benchmark comparison, drawdown, expectancy, sample-size and overfit warnings.
4. **RiskDesk** — position sizing, stop distance, contract multipliers, fees, exposure limits, correlation/concentration and scenario stress.
5. **Catalyst & Macro Radar** — economic calendar, earnings, corporate actions, central-bank events, macro and geopolitical catalysts with timestamps and source citations. No fabricated live feed.
6. **Sentiment & Positioning** — sentiment sources, options/futures positioning and funding/open interest where legally/free available; label stale/missing data and avoid treating sentiment as fact.
7. **Cross-Asset & Regime** — equities, FX, rates, commodities, crypto and index context; regime classification with transparent rule explanations.
8. **Fundamental Quality** — statements, valuation, growth, balance-sheet and sector comparisons; date/source-aware data.
9. **Trade Thesis & Scenario Planner** — bull/base/bear paths, entry conditions, invalidation, target logic, event risk and what would change the view.
10. **Portfolio & Trade Journal** — exposure aggregation, risk budget, correlation, realised results, tags, notes and export.
11. **Independent Review / Red Team** — challenge assumptions, look for contrary evidence, survivorship bias, look-ahead leakage and missing costs.
12. **MarketMind Orchestrator** — calls available modules, tracks provenance and freshness, resolves conflicts transparently, and produces a single evidence-linked report with abstention when data is insufficient.

## Shared contract
Every module returns: `module_id`, `as_of`, `source`, `inputs`, `observations`, `limitations`, `confidence_basis`, `warnings`, `output_version`. No module may output a numeric probability unless it has a defined, calibrated method and a documented evaluation sample. A target must be rule-derived or sourced, never invented.

## Release gates
- Unit tests for indicator math and edge cases.
- CSV parser tests including malformed rows, duplicate timestamps, missing values and unsorted bars.
- Backtest tests that prevent look-ahead leakage and include fees/slippage.
- Provenance/freshness labels on every external data point.
- Browser smoke tests and mobile layout review.
- Human confirmation before any order execution; execution integrations are out of scope until explicitly reviewed and authorised.
- Never claim a branch is deployed until merged and the actual Pages deployment is verified.

## Current implementation status
- MarketMind: public CSV-based analysis shell and unified specialist workbench are implemented. Technical, strategy, portfolio-risk, catalyst, fundamental, cross-asset, sentiment, thesis and independent-review modules can be run locally; several specialist inputs still require user-supplied JSON.
- Bright Future deterministic backtest engine: implemented in Node and browser-compatible form. It enforces chronological OHLCV with explicit timezone offsets, immutable point-in-time strategy history, next-bar-open default fills, fees/slippage, dataset SHA-256, equity curve, trade metrics and a buy-and-hold baseline. The first browser strategy is a long-only EMA regime rule.
- RiskDesk: offline-first risk calculator and local journal prototype.
- Not connected: live/delayed market data providers, news or macro feeds, broker APIs, autonomous trading agents, calibrated probability forecasts or guaranteed targets.
- Portfolio-level multi-instrument simulation, walk-forward orchestration, multiple-testing controls and robust statistical inference remain future research milestones.
