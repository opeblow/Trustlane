# Trustlane

Trustlane is a trusted commerce execution layer for AI agents. It turns a
purchase request into a deterministic shortlist, checks it against spending
policies, and gates payment execution on explicit approval.

## Start the preview

From the project root, run:

```powershell
npm run preview
```

Then open <http://localhost:3100> for the landing page or
<http://localhost:3100/dashboard> for the Trustlane workspace. Press `Ctrl+C` to stop the preview server.
This static preview uses Node built-ins and does not require dependencies to be
installed.

## Connect the dashboard to the API

The dashboard shows live workspace data when the API is running. In a second
terminal from the project root, run:

```powershell
npm run dev:api
```

The API listens on port 4000. The local workspace uses simulated PayPal
payments unless sandbox credentials are configured; no money moves in that
mode.

The Next.js app serves the same landing page and dashboard at `/` and
`/dashboard`, respectively. Use `npm run dev:web` for its development server.

## Payments

Without PayPal credentials, purchase execution uses the simulated gateway and
does not move money. Configure sandbox credentials in `.env` before testing a
real PayPal sandbox flow. Never use live credentials for local development.
