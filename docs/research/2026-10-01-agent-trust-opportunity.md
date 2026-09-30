# Nexa Forge Research Brief — 2026-10-01

## Signal
Consumer AI agents are moving from answering to acting. Recent reporting indicates users increasingly grant agents access to email, browsers, messaging, cloud storage and calendars, while trust, security and privacy rank ahead of ease of use. Agentic traffic is also growing rapidly, and browser-based agents dominate observed agentic activity.

## Opportunity
Build a local-first **ActionGate** prototype: a human-in-the-loop approval layer that lets a user define which classes of actions an AI workflow may perform automatically and which always require explicit approval.

## Why this fits Nexa Forge
- Distinct from existing QueueLite, Signalboard, Decision Deck and FrictionLog.
- Addresses a current agent-adoption barrier: control and trust.
- Can start as a standalone simulation/decision UI without credentials, payments, browser permissions or external APIs.
- Low controversy and low operational risk.
- Zero-budget compatible.

## MVP boundary
1. Define action categories.
2. Set approval policy per category.
3. Simulate an agent request.
4. Show requested action, affected data and risk level.
5. Allow approve / deny / always approve / always deny.
6. Keep an immutable local decision history.
7. Export policy and history as JSON.

No real-world actions, credentials, purchases, account access or autonomous execution in v0.1.

## Evidence
- Digital Applied summary of the 2026 consumer AI survey: 41% of AI users had tried an agent; 32% had allowed an agent to act without final sign-off; trustworthiness and security/privacy ranked above ease of use. https://www.digitalapplied.com/blog/what-people-let-ai-agents-access-2026
- HUMAN Security: browser-based agents accounted for roughly 71% of observed top-agent activity in April 2026; August reporting continued to show strong agentic traffic and governance activity. https://www.humansecurity.com/learn/blog/state-of-agentic-traffic-april-26/
- AP, 28 Sep 2026: Nvidia introduced an open-source agent safety platform focused on authority limits and suspicious-behaviour quarantine. https://apnews.com/article/3c4d7eb4cfde82851c0577d1fa29b8621
- Reuters, 22 Sep 2026: banks raised concerns about AI shopping agents, especially privacy, fraud, transparency and consumer recourse. https://www.reuters.com/legal/litigation/banks-warn-ai-shopping-bots-raise-scam-fraud-data-privacy-risks-2026-09-22/

## Decision
Proceed to build the zero-cost simulation MVP. Do not build a privileged browser extension or autonomous transaction layer at this stage.
