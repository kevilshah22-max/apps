# AgentGuard v0.1 — Public static MVP

AgentGuard is a local-only preflight checklist for reviewing AI-generated action plans before execution. It uses deterministic text patterns to highlight possible prompt injection, credential access, destructive changes, external communication, financial actions, privilege changes, code execution, sensitive data, and hard-to-reverse operations.

## Run locally

Serve the repository's `site` directory with any static HTTP server and open `agentguard/`. The app uses a JavaScript ES module; opening the file directly via `file://` may be blocked by browser module rules.

## Verify

Requires Node.js 22 or later:

```sh
node --test site/agentguard/tests/*.test.mjs
node --check site/agentguard/app.js
node --check site/agentguard/risk-engine.mjs
```

## Privacy and limits

The plan text is processed in the browser and is not uploaded or persisted by the app. The JSON export includes the score, matched categories, advice and character count, but not the original plan text. Clipboard access may require a secure context.

This is a heuristic checklist, not a security scanner, model, policy enforcement point or guarantee. It does not execute actions, access credentials, or control an AI agent. False positives and false negatives are possible; a low score is not proof of safety.
