# Sponsor Map — Trustlane

> How each sponsor technology is used in this repository, where the code lives, and why
> the integration is more than a dependency line.

| Sponsor | Surface in this repo | Primary artefacts |
|---|---|---|
| **AG Grid** | Agentic Commerce command centre — four React grids over the agent's decision state | [`apps/web/src/components/grid/`](../../apps/web/src/components/grid), [`packages/integrations/ag-grid`](../../packages/integrations/ag-grid) |
| **Render** | Zero-touch deployment of a 17-workspace Node monorepo | [`render.yaml`](../../render.yaml), [`scripts/workspaces.mjs`](../../scripts/workspaces.mjs), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) |
| **PayPal** | OAuth2 + Orders v2 as the money-moving boundary, behind policy and approval gates | [`packages/integrations/paypal`](../../packages/integrations/paypal), [`apps/api/src/services/purchases.ts`](../../apps/api/src/services/purchases.ts) |

---

## AG Grid — the decision surface for an agent

Trustlane's core claim is that an *agent* can research and recommend, but a *human* signs the
receipt. That only works if a human can audit the agent's reasoning in seconds. AG Grid is the
component that turns a stream of agent stages into something reviewable: the operator sees every
candidate, every score, every disqualification reason and every tool call in one sortable,
filterable, exportable surface.

### 1. Four grids, one shared toolbar

| Grid | What the operator is judging | Notable columns |
|---|---|---|
| **Candidate comparison** | Which product the agent picked, and why | rank badge, price, availability pill, per-attribute values, evidence score, unverified-field count, pros/cons balance |
| **Purchase reviews** | What the agent has done so far | stage, status pill, engine (`deterministic` / LLM), candidate count, spend, wall-clock duration |
| **Audit trail** | Why the agent did it | event type, severity, actor, source, correlation id, raw payload |
| **Agent tool calls** | Which tools were touched | tool name, input preview, result summary, duration, correlation id |

All four reuse one toolbar (`GridToolbar.tsx`) with a quick-filter box, **Export CSV**, **Reset**,
and a live "N of M rows" counter, and one setup module (`setup.ts`) that registers
`AllCommunityModule`, the `ag-theme-quartz` legacy theme class, pagination, and the number/text
filter parameters. Advanced *Community* features in use: quick filter, text and number filters,
multi-sort, pagination with a page-size selector, CSV export, column grouping, stable row
identity, single-row selection with a details panel, and custom cell renderers.

### 2. Custom cell renderers — the product, not the widget

`apps/web/src/components/grid/cells.tsx` contains **15 bespoke renderers** written for this
product rather than relying on defaults:

- `RankCell` / `ScoreBarCell` — the agent's ranking as a monochrome bar, so a weak candidate is
  visibly weak without reading a number.
- `StatusPillCell` / `SeverityCell` — in-stock / preorder / backorder and info / warn / error as
  typographic pills, consistent with the rest of the black-and-white design system.
- `EvidenceChipCell` — renders an attribute's *evidence state*. `requiresEvidence: true` in the
  column model means the column header states "evidence required before this value can be
  presented as fact", and an unverified value is never rendered as a plain number. The grid
  enforces the same rule the agent does.
- `AttributeCell` / `MoneyCell` — value + unit, with currency rendered through one formatter
  (`money()`) so no cell invents its own rounding.
- `EngineCell` — shows whether a run was produced by the deterministic core or by an LLM, which is
  a trust signal, not decoration.
- `RelativeTimeCell` / `ClockCell` / `DurationCell` — times resolve against a single clock so
  server and client renderings cannot disagree.

### 3. Constraint-derived filtering (the P1 architecture)

The interesting integration problem was: *the request already contains machine-readable hard
constraints — why make the operator re-enter them as filters?*

`packages/integrations/ag-grid` is a **framework-agnostic adapter** that turns the agent's intent
into a grid state:

```text
IntentT.constraints.numeric          (server-side truth)
        │  constraintsToGridFilters()
        ▼
FilterModel  { ram_gb: greaterThanOrEqual 32, price: lessThanOrEqual 1500 }
        │  api.setFilterModel(model)
        ▼
AG Grid  →  the comparison table is already scoped to the request
```

- `gridFieldForConstraint()` resolves a constraint field to a **real column id**, so base columns
  such as `price` filter the price column while attribute keys filter `attributes.<key>`. A filter
  model that points at a non-existent column is silently ignored by AG Grid, which is exactly the
  kind of bug that ships a demo that "looks fine but filters nothing". There is a regression test
  asserting every constraint filter maps to a column id that exists.
- Editing an attribute cell in the grid is the **reverse** edge: the cell edit becomes a
  `NumericConstraintT`, the intent is patched server-side (`PATCH /api/intents/:id`), the filter
  re-applies instantly, and the UI offers a **Re-run evaluation** action. Scoring stays server-side
  on purpose — the browser never decides that a product qualifies.
- Because the column model, row shaping, filter mapping and constraint round-trip all live in a
  plain TypeScript package, **the grid contract is unit-tested without a browser**
  (`packages/integrations/ag-grid/src/columns.test.ts`, 7 cases). Only the React renderers live in
  `apps/web`. That is the whole point of the split: framework-independent logic stays verifiable,
  framework code stays thin.

### 4. Row identity and honesty about filtering

- `getRowId` returns the stable `productId`, so filtering, sorting and re-selection never scramble
  selection state or lose the details panel.
- Disqualified rows keep their scores and are styled via `rowClassRules` instead of being hidden —
  the operator can see *what the agent rejected and why*.
- `rowsFromEvaluations()` sorts pinned (short-listed) products first, then by rank, then by score,
  and carries an `unverifiedCount` derived from each product's evidence records.

---

## Render — one blueprint for a 17-workspace monorepo

The repository is an npm-workspaces monorepo: 15 libraries plus two apps. Deploying that to a PaaS
naively fails, and the reason is the interesting part.

### 1. The build-order problem

Every workspace imports its siblings through `exports` maps that point at `dist/`:

```json
"exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } }
```

So `npm run build -w apps/api` — the obvious build command — **cannot work**: `@autopilot/schemas`
has not been compiled yet, so its declarations do not exist. `npm run --workspaces` does not help
either, because it walks directories rather than the dependency graph. `scripts/workspaces.mjs`
fixes it by resolving the workspace graph from the manifests, topologically sorting it, and
building each dependency before its dependents. Both CI and Render call that one command:

```yaml
buildCommand: npm ci && npm run build      # → node scripts/workspaces.mjs build
```

That single line is why "works on my machine" never reaches the judges' browser.

### 2. Two services, wired by reference

```yaml
- key: NEXT_PUBLIC_API_BASE_URL          # web  → api
  fromService: { type: web, name: trustlane-api, property: host }
- key: CORS_ORIGINS                      # api  → web
  fromService: { type: web, name: trustlane-web, property: host }
- key: WEB_URL                           # PayPal return/cancel redirects
  fromService: { type: web, name: trustlane-web, property: host }
```

Render resolves `property: host` to a **bare hostname** with no scheme. Left alone that turns every
browser fetch into a relative request and makes every CORS comparison miss. Both ends normalise
instead of hard-coding a URL that would be wrong after the first redeploy:

- `apps/web/src/lib/api.ts` → `normaliseApiBase()` restores `https://` (keeping `http://` for
  loopback) and strips trailing slashes.
- `apps/api/src/env.ts` → `normaliseOrigin()` does the same for `CORS_ORIGINS`, `WEB_URL` and
  `API_PUBLIC_URL`.

Both are unit-tested, because this is exactly the class of failure that only appears after deploy.

### 3. PaaS contract compliance

| Platform behaviour | Trustlane response |
|---|---|
| Injects `PORT`, routes only to it | `apps/web/scripts/start.mjs` binds `$PORT` (falling back to `3100` locally); the API reads `API_PORT ?? PORT` |
| Requires binding `0.0.0.0` | `API_HOST=0.0.0.0`; the web launcher passes `--hostname 0.0.0.0` |
| Health probes before routing | `healthCheckPath: /api/health`, which is exempt from the `API_TOKEN` guard so a probe can never 401 |
| Ephemeral filesystem | `startCommand: npm run seed -w @autopilot/api && npm run start -w @autopilot/api` — seeding is idempotent, so a cold deploy is always demo-ready |

Both start commands and the port bindings were verified locally against injected `PORT` /
`API_HOST` values before being written into the blueprint.

### 4. Same guarantees in CI as in production

Render runs `npm ci && npm run build`; `.github/workflows/ci.yml` runs lint → typecheck → build →
test on Node 22 with the npm cache. The blueprint pins `NODE_VERSION` to the same major, so a
green CI badge and a healthy deploy are produced by the same commands on the same runtime.

---

## PayPal — the only component allowed to move money

PayPal is wired as a **boundary**, not a convenience. The agent can reason about money; only this
package may move it, and only after the policy engine and a human (or hardware token) approve.

### 1. OAuth2 client-credentials with a cached token

`packages/integrations/paypal/src/client.ts`:

- `POST /v1/oauth2/token` with HTTP Basic `clientId:clientSecret` and
  `grant_type=client_credentials` — the token endpoint is called with `authenticated: false` so it
  can never recurse into the authenticated request path.
- The token is cached in memory and refreshed with a **60-second skew** (`expiresIn - 60`), so an
  order is never created against a token that expires mid-flight.
- `verifyCredentials()` obtains and discards a token as a **non-mutating** connectivity probe; that
  is what `/api/health` reports for the `paypal` provider.
- Secrets live only in server env (`PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`). The browser bundle
  only ever receives `NEXT_PUBLIC_*` values, so a credential cannot leak through the client build.

### 2. Orders v2, used as a state machine

| Step | Call | Guard |
|---|---|---|
| Prepare | `POST /v2/checkout/orders` with `intent: CAPTURE`, one `purchase_unit` keyed by `reference_id` | amount/currency already hashed into the plan |
| Authorise | `POST /v2/checkout/orders/{id}/authorize` | requires an approved, hash-matching approval record |
| Capture | `POST /v2/checkout/orders/{id}/capture` | `paypal-request-id` idempotency header |
| Verify | `GET /v2/checkout/orders/{id}` | **re-read from PayPal before any automation fires** |

Every mutating call sends `paypal-request-id`, so a retried request cannot create a second order or
a second capture.

### 3. Idempotency at two layers

1. **Provider layer** — `paypal-request-id` on `authorize` / `capture`.
2. **Service layer** — the API accepts an `Idempotency-Key` header on purchase writes, looks it up
   with `store.findIdempotent(key, operation)` and replays the stored response with
   `store.saveIdempotent(key, operation, status, body)`. A double-clicked "Capture" button returns
   the first result instead of charging twice.

`capturePurchase()` additionally short-circuits when a captured payment already exists: it
re-verifies and returns the original payment rather than calling PayPal again.

### 4. The cryptographic plan hash

`preparePurchase()` hashes the money-relevant decision with SHA-256 over a **stable stringify**
(sorted keys, `packages/schemas/src/ids.ts`) so the digest is reproducible:

```ts
sha256({ productId, amountMinor, currency, quantity, policyId, policyVersion, policyInputHash })
```

The hash therefore binds an approval to **both the basket and the policy that permitted it** —
change the product, the amount in minor units, the quantity, or the policy version, and the digest
changes. That `planHash` travels with the approval record and is re-checked at three points:

- approval (`plan.planHash` must match the submitted hash),
- capture (`PLAN_HASH_MISMATCH` → HTTP 409, no money moves),
- approval scope (`approval.authorizationScope.planHash` must match the current plan).

So a stale browser tab cannot authorise an amended basket: changing any parameter changes the hash
and the approval becomes worthless. Capture also requires an approval whose status is `approved` or
`consumed`, otherwise `APPROVAL_REQUIRED`.

### 5. Independent truth verification

After capture, `verifyPlan()` calls the registered `verify_order` tool, which re-reads the order
from PayPal and compares amount, currency and capture state. Automation is gated on that result —
`apps/api/src/services/purchases.ts` carries the comment *"Automation may only fire on verified
payment state"* immediately before dispatching the Zapier hook — so webhook delivery is downstream
of verification, never a substitute for it.

### 6. Honest degradation

With no credentials the runtime uses a deterministic offline gateway and labels itself
`SIMULATED` in `/api/health`, in the command-centre "Payment mode" tile and in the audit trail. No
code path ever claims a live PayPal call it did not make — the same rule the rest of the system
applies to Channel3, Elastic, Zapier and the LLM.

---

## Verification

```bash
npm ci            # install exactly what CI and Render install
npm run lint      # eslint (flat config)
npm run typecheck # tsc --noEmit across all 17 workspaces, dependency-ordered
npm test          # 68 vitest cases: schemas, policy, parser, scoring, grid, API, auth
npm run build     # every workspace, dependency-ordered
```

`GET /api/health` returns `status`, `llm`, `mode`, `database`, `providers`, `checks` and
`timestamp` — the same payload Render polls before routing traffic.