# Trustlane

Trustlane is an autonomous, policy-driven procurement copilot and agentic purchasing platform built with PayPal.

### Project Structure

```plaintext
Trustlane/
├── apps/
│   ├── api/           # REST API server & Fastify runtime
│   └── web/           # Next.js web application & preview UI
├── packages/
│   ├── agent-tools/   # Agent tool implementations & scoring
│   ├── integrations/  # Third-party integrations (PayPal, Zapier, etc.)
│   ├── persistence/   # Data persistence & audit trail layer
│   ├── policy-engine/ # Policy evaluation & gatekeeper
│   └── schemas/       # Shared type schemas & validation
├── scripts/           # Utility scripts
└── .github/           # GitHub CI/CD workflows
```