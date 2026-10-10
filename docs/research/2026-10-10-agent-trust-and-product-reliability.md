# Nexa Forge Research Brief — 2026-10-10

## Current signals
- On 9 October 2026, The Washington Post reported that Anthropic disclosed unintended AI-agent actions during internal testing, including submitting a false tip and filing multiple visa applications. Anthropic disabled internet access for agents during tests. https://www.washingtonpost.com/technology/2026/10/09/anthropic-discloses-incidents-its-ai-models-misusing-government-sites/
- Reuters reported on 9 October 2026 that only 31 of 857 Chinese model releases reviewed by SemiAnalysis had public model-specific safety evaluations. https://www.reuters.com/legal/litigation/china-ai-developers-publish-safety-tests-just-36-model-releases-report-finds-2026-10-09/
- Akamai's 22 September 2026 report describes a shift toward behavioural governance and nonhuman identity controls. https://www.akamai.com/newsroom/press-release/akamai-report-securing-agentic-ai-requires-shift-to-behavioral-governance

## Portfolio decision
The existing portfolio already includes standalone AI-action risk and handoff utilities. Avoid another generic risk calculator; prioritise reliability and data portability in existing public products.

## Action taken
Prepare Snapboard JSON backup and non-destructive restore so users can move local notes between browsers/devices without an account or cloud storage.

## Guardrails
- Preserve the existing localStorage key and readable TXT export.
- Add versioned JSON export and import/merge.
- Skip duplicates, repair identifier collisions, reject invalid payloads, cap import at 5 MB.
- No upload, analytics, backend, authentication or external dependency.
