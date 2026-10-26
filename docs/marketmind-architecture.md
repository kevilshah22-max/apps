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
- RiskDesk: offline-first risk calculator and local journal prototype (separate feature PR).
- MarketMind: initial CSV-based analysis shell is being built; it is not a live-data service.
- Other workstreams above are planned specialist branches, not yet completed bots or services.
