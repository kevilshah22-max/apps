# Bright Future — Strategy Research & Adaptive Learning Engine

**Status:** Programme charter and implementation contract  
**Owner:** Bright Future / Nexa Forge  
**Operating constraint:** Zero-budget by default; no paid API, account, data or execution commitment without explicit approval.

## Mission

Build a modular, evidence-led research system that helps analysts discover, test, compare and monitor trading-strategy candidates. Each analytical responsibility has a separable module or agent; the orchestration layer combines their outputs into a single traceable report without hiding disagreement or missing evidence.

The system is a research and decision-support platform. It must not imply that historical results guarantee future returns, invent current market data, or place real-money orders autonomously.

## Product topology

### Shared core

1. **Data Gateway & Steward** — canonical schemas for bars, quotes, corporate actions, macro observations, fundamentals, derivatives and news; source, licence, timestamp, timezone, latency, adjustment and quality metadata.
2. **Research Registry** — immutable strategy definitions, hypothesis, owner/version, parameters, supported instruments/timeframes, data dependencies and change history.
3. **Backtest Engine** — chronological event simulation, explicit fill model, fees, spread/slippage, funding/borrow costs where relevant, position sizing, corporate actions, partial fills and no-lookahead rules.
4. **Experiment Runner** — bounded parameter search, fixed train/validation/test partitions, walk-forward evaluation, experiment manifests and reproducible seeds.
5. **Metrics & Benchmark Service** — net returns, expectancy, profit factor, drawdown, volatility, turnover, exposure, trade count, tail loss, benchmark-relative performance and uncertainty.
6. **Regime & Drift Monitor** — point-in-time regime features, strategy degradation alerts, data-quality alerts and performance-versus-expectation checks.
7. **Risk Policy Engine** — pre-trade and portfolio limits, concentration, correlation, drawdown, leverage, liquidity, event and instrument-specific constraints. Fail closed when required inputs are missing.
8. **Independent Reviewer (SKEPTIC)** — challenge data provenance, sample size, survivorship bias, look-ahead, multiple-testing/selection bias, unrealistic fills, parameter fragility and regime dependence.
9. **Evidence Ledger (ARCHIVIST)** — store run IDs, code/version hashes, data snapshot IDs, configuration, metrics, reviewer findings, approvals and promotion history.
10. **Orchestrator** — invoke available specialists, reconcile incompatible outputs, preserve each source and timestamp, show confidence basis and abstain when evidence is insufficient.
11. **Report & Alert Layer** — consolidated research briefs, watchlists, paper-trade alerts and clear stale-feed/error status.
12. **Optional Paper Broker Adapter** — simulated order lifecycle only; separate from research and disabled unless its own tests pass.

### Market-specific specialist workstreams

- **BF-Intraday:** opening ranges, VWAP, session context, intraday breakout/pullback and intraday execution assumptions.
- **BF-Swing:** multi-day trend, pullback/breakout, gap risk, holding period and overnight exposure.
- **BF-FX-Commodities:** currency sessions, spreads, roll/contract specifications, commodity curves where data is available, macro-event risk.
- **BF-Crypto:** spot first; derivatives separate with funding, open interest, venue, liquidation and exchange risk.
- **BF-Currencies-Macro:** rates, inflation, central-bank decisions, yield differentials, policy paths and scenario analysis.
- **BF-Options:** payoff and defined-risk modelling, Greeks, implied/realised volatility, skew, expiry and assignment/exercise assumptions.
- **BF-Long-Term:** financial statements, cash flow, valuation, balance-sheet quality, corporate actions and long-horizon thesis monitoring.
- **BF-Akshat:** adversarial/distress review, severe drawdowns, financial fragility, recovery assumptions and explicit rejection cases. Treat this as a research mandate, not an assumption about a person or security.

The eight named BF repositories are not currently visible in the connected GitHub repository listing. Until those repositories are connected and verified, build shared interfaces and prototypes in the accessible `kevilshah22-max/apps` repository; do not claim that changes have been made to unavailable repositories.

## Agent roles and boundaries

- **LIBRARIAN / Data Steward:** collects and validates permitted evidence; never turns a missing source into a fact.
- **DRAFTER / Strategy Creator:** proposes explicit, falsifiable hypotheses and candidate rules; cannot approve its own candidate.
- **Quant Researcher:** implements and tests rules using point-in-time data and documented assumptions.
- **Cost & Execution Analyst:** stress-tests spread, slippage, fees, latency, liquidity, funding, borrow and fills.
- **Regime Analyst:** classifies market context using only information available at each simulated timestamp.
- **Risk Validator:** evaluates candidate and portfolio risk against hard limits; missing required risk inputs mean rejection/abstention.
- **SKEPTIC / Red Team:** independently challenges the candidate and attempts to falsify the claimed edge.
- **ARCHIVIST:** records exact inputs, code version, outputs, decisions and evidence.
- **Orchestrator:** combines outputs but cannot override a failed risk gate, erase dissent, or fabricate a consensus.

AI agents should return structured, schema-validated output with source references and explicit unknowns. Deterministic calculations should remain deterministic code, not be delegated to a language model.

## Strategy lifecycle

`IDEA → SPECIFIED → DATA-VALIDATED → BACKTESTED → OUT-OF-SAMPLE → WALK-FORWARD → RED-TEAM REVIEW → PAPER TRIAL → REVIEWED CANDIDATE`

A failed gate sends a candidate to `REJECTED`, `NEEDS DATA` or `RESEARCH AGAIN`; it must not skip forward. Passing research gates does not imply live-trading authorisation. Any live execution would require a separate, explicitly approved project with broker, security, legal, operational and risk review.

## Minimum strategy specification

Every candidate must define:
- Hypothesis and economic/behavioural rationale.
- Eligible asset classes, symbols/contracts and trading sessions.
- Data fields, source, adjustment policy, timeframe and minimum history.
- Entry, exit, stop/invalidation, sizing, holding period and no-trade conditions.
- Order/fill assumptions, costs, funding/borrow, liquidity and market impact assumptions.
- Parameters and permitted search ranges fixed before evaluation.
- Benchmark, train/validation/test windows and walk-forward schedule.
- Expected failure modes, regime dependencies and risk limits.
- Code version, data snapshot IDs and reproducible experiment ID.

## Required validation metrics

Evaluate net performance and risk, not just headline return: trade count, expectancy, average win/loss, profit factor, max drawdown, drawdown duration, tail loss, turnover, exposure, volatility, benchmark-relative performance, cost sensitivity, parameter stability, regime stability and uncertainty. Use methods appropriate to the sample and strategy. Explicitly account for multiple trials and selection bias when searching many candidates.

## Adaptive learning policy

Permitted automatic actions:
- Refresh permitted datasets and recompute indicators.
- Generate new research hypotheses from documented templates.
- Run bounded, logged experiments.
- Detect data drift and performance deterioration.
- Recommend a version for further evaluation or pause its paper-trial eligibility.
- Produce reports and alerts.

Prohibited without a separate approval:
- Rewriting or bypassing risk policy.
- Promoting a candidate solely on in-sample results.
- Treating a paper signal as a real order.
- Live trading, leverage changes, account access or movement of funds.
- Purchasing paid data/API access.

A loss or one short performance window must not trigger unconstrained parameter changes. Adaptation must be pre-defined, logged, tested on unseen data and reversible.

## Shared module contract

Use versioned JSON contracts. Every specialist result must include:
```json
{
  "module_id": "technical-structure",
  "module_version": "0.1.0",
  "run_id": "reproducible-run-id",
  "as_of": "ISO-8601 timestamp",
  "status": "OK | INCOMPLETE | STALE | FAILED | REJECTED",
  "source_refs": [],
  "input_snapshot_ids": [],
  "observations": [],
  "limitations": [],
  "warnings": [],
  "confidence_basis": null,
  "required_followups": []
}
```

Numeric probabilities are prohibited unless the method is defined, calibrated, and evaluated on a documented out-of-sample sample. Targets must be rule-derived or source-backed, never invented. Missing or stale critical data must produce a visible abstention.

## Zero-budget implementation order

1. **Foundation:** contracts, data validation, registry, run IDs, evidence ledger and CI.
2. **Research engine:** backtest event model, fees/slippage, benchmark and no-lookahead tests.
3. **Candidate factory:** versioned strategy DSL/templates and bounded parameter search.
4. **Validation stack:** train/validation/test, walk-forward, robustness and red-team gates.
5. **Regime/drift:** point-in-time regime features, performance monitoring and paper-trial pause logic.
6. **Specialists:** connect the eight market-specific workstreams through the same contracts.
7. **Unified interface:** one dashboard and report with data status, candidate comparison, conflicts and audit trail.
8. **Permitted data adapters:** only after provider access, licence, quota and freshness are verified.
9. **Paper-trading adapter:** simulated lifecycle, reconciliation, failure recovery and monitoring.

Use Python for numerical research and backtesting, Node/TypeScript for the existing web shell and orchestration, and n8n only where a free, available installation can reliably schedule or notify. Do not add infrastructure that requires recurring payment.

## Release checklist

- [ ] Unit tests cover indicator math, edge cases and timezone handling.
- [ ] CSV/data tests cover gaps, duplicates, bad OHLC, missing values, unsorted timestamps and stale feeds.
- [ ] Backtest tests prove no future-bar leakage and model realistic costs.
- [ ] A synthetic dataset has deterministic expected outputs.
- [ ] Strategy versions and experiment configuration are immutable and replayable.
- [ ] Out-of-sample and walk-forward results are distinct from in-sample results.
- [ ] Independent reviewer can reject a candidate and the orchestrator cannot bypass that rejection.
- [ ] Every report shows provenance, freshness, limitations, disagreements and unknowns.
- [ ] Browser/mobile QA and failure-path tests pass.
- [ ] Deployment status is verified from actual workflow/deployment evidence.

## Current baseline and next engineering task

MarketMind in `site/marketmind/` already contains a CSV-oriented analysis shell and initial specialist modules. RiskDesk is an offline-first risk calculator. These are prototypes, not a connected live market service. The immediate next code milestone is the **Research Registry + Strategy Specification + Experiment Ledger**, followed by a tested backtest engine that prevents look-ahead leakage. Do not add superficial AI labels before these contracts and validation gates work.
