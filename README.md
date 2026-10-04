<p align="center">
  <img src="assets/trustlane-logo.svg" alt="Trustlane Logo" width="580" />
</p>

<p align="center">
  <strong>Autonomous, policy-driven procurement copilot and trusted commerce execution runtime built with PayPal.</strong>
</p>

<p align="center">
  <a href="https://github.com/opeblow/Trustlane/actions/workflows/ci.yml"><img src="https://img.shields.io/badge/CI-Passing-000000?style=for-the-badge&logo=githubactions&logoColor=white" alt="CI Status" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node-%3E%3D22.5.0-000000?style=for-the-badge&logo=node.js&logoColor=white" alt="Node Version" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-Strict-000000?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript Strict" /></a>
  <a href="https://fastify.dev/"><img src="https://img.shields.io/badge/Fastify-5.x-000000?style=for-the-badge&logo=fastify&logoColor=white" alt="Fastify" /></a>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-15.x-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js" /></a>
  <a href="https://vitest.dev/"><img src="https://img.shields.io/badge/Tests-45%20Passed-000000?style=for-the-badge&logo=vitest&logoColor=white" alt="Vitest Tests" /></a>
  <a href="https://developer.paypal.com/"><img src="https://img.shields.io/badge/PayPal-Orders%20v2-000000?style=for-the-badge&logo=paypal&logoColor=white" alt="PayPal Powered" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-000000?style=for-the-badge" alt="License" /></a>
</p>

---

## 🧭 Overview

**Trustlane** sits between high-level human intent and low-level financial execution. Rather than functioning as a conversational gimmick or a toy shopping bot, Trustlane is a **production-grade agentic commerce execution runtime**.

Tell Trustlane what your organization needs:
```text
"Procure 5 ergonomic developer chairs under $1,200 total. Ensure lumbar support 
and minimum 3-year warranty. Do not charge without explicit approval."
```

Trustlane autonomously parses structured constraints, discovers candidate products across verified catalogs, normalizes attributes, evaluates multi-factor trade-offs, enforces spending and merchant policies, prepares cryptographic purchase plans, coordinates approval boundaries, executes payments via PayPal Orders v2, independently verifies transactions, triggers post-purchase webhook automations, and writes an immutable audit trail.

---

## ⚡ The 10-Stage Autonomous Execution Loop

Trustlane guarantees that an AI model can reason, compare, and prepare, but **can never unilaterally move funds** without passing explicit policy boundaries and cryptographic approval gates.

```
┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────────┐
│ 1. INTENT │ ──> │ 2. SEARCH │ ──> │ 3. SCORE  │ ──> │ 4. CANDIDATES │
└───────────┘     └───────────┘     └───────────┘     └───────────────┘
                                                              │
┌───────────┐     ┌───────────┐     ┌───────────┐             │
│ 8. VERIFY │ <── │  7. PAY   │ <── │ 6.APPROVE │ <── 5. POLICY   │
└───────────┘     └───────────┘     └───────────┘     └───────────────┘
      │
      ▼
┌──────────────┐     ┌───────────┐
│ 9. AUTOMATE  │ ──> │ 10. AUDIT │
└──────────────┘     └───────────┘
```

1. **Intent Formulation**: Natural language is parsed into typed constraints (numeric bounds, currency, vendor preferences, approval flags).
2. **Catalog Discovery**: Federated search across product providers (Channel3 catalog with resilient local fallback).
3. **Multi-Factor Scoring**: Attribute extraction and mathematical scoring against constraints (price-to-performance, warranties, dimensions).
4. **Candidate Selection**: Produces a ranked, explainable shortlist with structured rationale for why items won or lost.
5. **Policy Gatekeeping**: Evaluates the proposal against spending rules: maximum single transaction, daily velocity limit, blocked merchants, and permitted categories.
6. **Plan Cryptographic Preparation**: Builds an immutable `PurchasePlan` with an SHA-256 hash. If any parameter changes, the approval signature is invalidated.
7. **Human-in-the-Loop Approval**: When a plan exceeds autonomous thresholds, the transaction is suspended pending buyer approval or hardware token confirmation.
8. **PayPal Settlement**: Executes payment using PayPal Orders v2 API (supporting sandbox and mock environments).
9. **Independent Truth Verification**: Re-queries the PayPal Orders API server-to-server to ensure amounts, currency, and capture state match before proceeding.
10. **Post-Purchase Automation & Audit**: Emits verified events to Zapier webhooks and writes structured events to the local SQLite / Elastic audit log.

---

## 🏛 Project Architecture & Monorepo Layout

Trustlane is structured as an npm workspaces monorepo:

```plaintext
Trustlane/
├── apps/
│   ├── api/                  # Fastify REST API & runtime orchestration engine
│   │   ├── src/
│   │   │   ├── routes.ts     # Route registrations, request validation & error handlers
│   │   │   ├── server.ts     # Fastify server bootstrap & authentication hooks
│   │   │   ├── env.ts        # Strongly-typed environment configuration
│   │   │   ├── services/     # Container, intent, purchase, run, and tool services
│   │   │   └── scripts/      # Database seeding and spec emitters
│   └── web/                  # Next.js web application and interactive operator console
│       ├── public/
│       │   ├── landing.html  # High-converting minimalist black & white landing page
│       │   ├── dashboard.html# Operator command center & procurement review rail
│       │   └── hero-illustration.jpg
├── packages/
│   ├── agent-tools/          # Agent tool registry, intent parser, scoring engine, stages
│   ├── integrations/
│   │   ├── paypal/           # PayPal Orders v2 client, token caching, order capture
│   │   ├── zapier/           # Post-purchase catch hook webhook adapter with retry logic
│   │   ├── channel3/         # Product discovery catalog provider with local fallback
│   │   ├── elastic/          # Enterprise audit log indexer & local query adapter
│   │   ├── kernel/           # Agent execution trace and memory tracking
│   │   ├── astropods/        # OpenTelemetry distributed tracing wrapper
│   │   ├── apimatic/         # OpenAPI 3.1 contract generation and SDK schemas
│   │   ├── bryntum/          # Execution timeline & Gantt chart data models
│   │   ├── ag-grid/          # Candidate comparison grid definitions
│   │   └── postman/          # Automated Postman collection builder
│   ├── persistence/          # SQLite transactional store with audit event bus
│   ├── policy-engine/        # Rules evaluator (limits, categories, merchants, velocity)
│   └── schemas/              # Monorepo-wide Zod schemas & shared TypeScript types
├── scripts/                  # Development preview servers & workspace scaffolding
├── assets/                   # Vector logos, visual diagrams, and brand assets
└── .github/
    └── workflows/
        └── ci.yml            # GitHub Actions CI workflow (lint, typecheck, vitest)
```

---

## 🛡 Security Model & Safeguards

Trustlane follows zero-trust agentic design principles:

- **No Blind Spending**: The LLM never touches payment credentials directly and cannot create payment transactions outside strictly typed Zod contracts.
- **Cryptographic Plan Hashing**: Every `PurchasePlan` generates a deterministic SHA-256 fingerprint from its line items, amount, currency, and merchant. Attempting to approve an altered plan triggers an instant `PLAN_TAMPERED` conflict (HTTP 409).
- **Idempotency Protection**: All write endpoints accept an `Idempotency-Key` header, guaranteeing that network retries or duplicate button clicks never create duplicate charges.
- **Server-Side Verification**: Downstream automations and fulfillment webhooks fire **only** after Trustlane re-verifies capture status directly with PayPal's API.
- **Sanitized Error Boundaries**: Internal exceptions, stack traces, and database locations are masked from external API consumers and safely logged server-side.
- **Token-Guarded Endpoints**: Optional `API_TOKEN` bearer authentication enforces strict request rejection (`401 Unauthorized`) at the Fastify hook level.

---

## 🔌 API Reference & Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Comprehensive health check (database, PayPal mode, providers). |
| `GET` | `/api/openapi.json` | Dynamically generated OpenAPI 3.1 specification. |
| `POST` | `/api/intents` | Creates a new procurement intent from natural language. |
| `PATCH` | `/api/intents/:id` | Updates intent constraints (budget range, keywords, approval requirements). |
| `POST` | `/api/runs` | Launches an autonomous procurement run for an intent. |
| `GET` | `/api/runs` | Lists historical procurement runs with status summaries. |
| `GET` | `/api/runs/:id` | Returns run details, candidate shortlist, and timeline. |
| `GET` | `/api/runs/:id/events` | Streams or fetches audit events associated with a run. |
| `GET` | `/api/runs/:id/stream` | Server-Sent Events (SSE) live stream of agent execution progress. |
| `POST` | `/api/discovery/search` | Performs catalog searches across verified product sources. |
| `GET` | `/api/products/:id` | Fetches normalized product details and specifications. |
| `POST` | `/api/policies/check` | Evaluates a proposed cart item against the active policy. |
| `GET` | `/api/policies` | Lists active and historical corporate spending policies. |
| `POST` | `/api/policies` | Upserts a policy with automatic version bumping and audit logging. |
| `POST` | `/api/purchases/prepare` | Generates a hashed purchase plan and PayPal approval link. |
| `GET` | `/api/purchases/:id` | Returns purchase plan state, approval details, and payment verification. |
| `POST` | `/api/purchases/:id/approve` | Submits human or automated approval for a plan. |
| `POST` | `/api/purchases/:id/capture` | Captures funds through PayPal and finalizes payment. |
| `GET` | `/api/payments/:id` | Retrieves PayPal payment verification state. |
| `POST` | `/api/automations/test` | Verifies post-purchase webhook connectivity (Zapier). |
| `GET` | `/api/automations/history` | Returns delivery status and logs of post-purchase automations. |
| `POST` | `/api/automations/retry/:id` | Retries a failed or unconfigured webhook for a verified payment. |
| `GET` | `/api/events` | Queries the audit log with faceted search filters. |

---

## 🎨 Design Philosophy: Pure Monochrome

Trustlane adheres strictly to a clean, tactile **black-and-white architectural aesthetic**:

- **Color Palette**: Curated monochrome (`--ink: #000000`, `--paper: #ffffff`, `--wash: #fafafa`, `--line: #e5e5e5`, `--muted: #737373`).
- **Typography**: Clean, geometric sans-serif (Inter) with monospace accents (JetBrains Mono) for financial and audit figures.
- **Micro-Animations**: Staggered entrance reveals (`fadeUp`), live pulse connection indicators, smooth rail navigation, and hover state elevation without garish colors or distractions.
- **Accessibility**: Native semantic markup with full `aria-live`, `aria-current`, keyboard navigable controls, and `prefers-reduced-motion` compliance.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `>= 22.5.0`
- **npm**: `>= 10.0.0`

### 1. Installation
Clone the repository and install all workspace dependencies:
```bash
git clone https://github.com/opeblow/Trustlane.git
cd Trustlane
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Key environment settings:
```env
# Server
PORT=4000
HOST=127.0.0.1
LOG_LEVEL=info

# PayPal Configuration (mock | sandbox | live)
PAYPAL_MODE=mock
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=

# Catalog & Discovery
CATALOG_PROVIDER=local

# Post-Purchase Automation (Zapier Catch Hook)
ZAPIER_HOOK_URL=

# Persistence
DATABASE_PATH=data/trustlane.sqlite
```

### 3. Seed Reference Data
Populate the local SQLite database with default reference products and initial spending policy:
```bash
npm run seed
```

### 4. Running the Development Stack
Start both the Fastify API and the Next.js frontend concurrently:
```bash
npm run dev
```

- **Landing Page**: `http://localhost:3000` (or `http://localhost:3000/landing.html`)
- **Operator Dashboard**: `http://localhost:3000/dashboard`
- **API Server**: `http://localhost:4000`
- **OpenAPI Specification**: `http://localhost:4000/api/openapi.json`
- **Health Check**: `http://localhost:4000/api/health`

---

## 🧪 Testing & Quality Gates

Trustlane maintains comprehensive test coverage across unit, integration, and security layers:

```bash
# Run all Vitest suites (45 tests covering schemas, policies, parser, scoring, routes, auth)
npm test

# Run strict monorepo typecheck across all packages
npm run typecheck

# Run ESLint validation
npm run lint

# Build production artifacts for all packages and web app
npm run build
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).