# Trustlane

Trustlane is a trusted commerce execution layer for AI agents. It turns a purchase request into a deterministic shortlist, checks it against spending policies, and gates payment execution on explicit approval. The system is built as a TypeScript monorepo with an API service, web interface, and reusable packages for schemas, persistence, policy engine, agent tools, and integrations.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
- [Development](#development)
  - [Available Scripts](#available-scripts)
  - [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Testing](#testing)
- [Configuration](#configuration)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Overview

Trustlane enables AI agents to make safe, policy-compliant purchases by providing a controlled execution path: intent parsing ? product discovery ? policy evaluation ? shortlist generation ? explicit approval ? payment execution. All operations are auditable and designed with guardrails to prevent unauthorized spending.

## Features

- **Policy Enforcement**: Configurable spending policies with validation and guardrails
- **Intent Parsing**: Understands natural language purchase requests
- **Product Discovery**: Searches and ranks products with scoring
- **Shortlist Generation**: Creates deterministic, explainable purchase options
- **Approval Gates**: Requires explicit human approval before payment execution
- **Payment Integration**: PayPal integration with sandbox support for safe testing
- **Audit Trail**: Persistent storage of runs, purchases, and decisions
- **Monorepo Architecture**: Shared packages for type safety and reusability

## Architecture

Trustlane is organized as a monorepo with the following packages and apps:

- pps/api - REST API server (Fastify) with routes for tools, purchases, and runs
- pps/web - Next.js web application for dashboard and landing pages
- packages/schemas - Shared Zod schemas and TypeScript types
- packages/persistence - Database layer (SQLite) for storage
- packages/policy-engine - Policy evaluation and enforcement logic
- packages/agent-tools - Agent tool implementations and intent parsing
- packages/integrations/* - Third-party integrations (PayPal, AG Grid, etc.)

## Getting Started

### Prerequisites

- Node.js 18+ (20 recommended)
- npm 9+

### Installation

Clone the repository and install dependencies:

`ash
git clone https://github.com/opeblow/Trustlane.git
cd Trustlane
npm install
`

### Quick Start

#### Option 1: Static Preview (No dependencies required)

`powershell
npm run preview
`

Open http://localhost:3100 for the landing page or http://localhost:3100/dashboard for the Trustlane workspace. Press Ctrl+C to stop.

#### Option 2: Full Development Setup

In one terminal, start the API:

`powershell
npm run dev:api
`

The API listens on port 4000.

In a second terminal, start the web app:

`powershell
npm run dev:web
`

Or use the preview server for static files. The local workspace uses simulated PayPal payments by default - no money moves unless sandbox credentials are configured.

## Development

### Available Scripts

- 
pm run dev:api - Start API server in development mode
- 
pm run dev:web - Start web app in development mode
- 
pm run build - Build all packages and apps
- 
pm run preview - Start preview server
- 
pm test - Run tests
- 
pm run lint - Lint codebase
- 
pm run typecheck - Run TypeScript type checking

### Project Structure

`
Trustlane/
+-- apps/
   +-- api/           # REST API server
   +-- web/           # Next.js web app
+-- packages/
   +-- agent-tools/   # Agent tool implementations
   +-- integrations/  # Third-party integrations
   +-- persistence/   # Data persistence layer
   +-- policy-engine/ # Policy evaluation
   +-- schemas/       # Shared type schemas
+-- scripts/           # Utility scripts
+-- .github/           # GitHub workflows
`

## API Documentation

The API exposes endpoints for tools, purchases, and runs. API documentation and OpenAPI specs can be generated using the included scripts:

`ash
npm run emit:openapi
npm run emit:postman
`

## Testing

Run all tests with:

`ash
npm test
`

For end-to-end tests:

`ash
npm run test:e2e
`

## Configuration

Copy .env.example to .env and configure environment variables:

`ash
cp .env.example .env
`

Key configuration options:
- PORT - API server port (default: 4000)
- DATABASE_URL - Database connection string
- PAYPAL_* - PayPal API credentials for live/sandbox environments

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct, development process, and how to submit pull requests.

## Security

For information about reporting security vulnerabilities, please see [SECURITY.md](SECURITY.md).

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) for details.
