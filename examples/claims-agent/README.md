# Example: claims-agent

> Synthetic example. Not affiliated with any real insurer. No real customer
> data, model API keys, or production endpoints.

A fictional first-line insurance claims triage agent. Given a customer's
claim narrative, it classifies the claim type, retrieves policy
information through MCP tools, drafts a compensation reasoning note, and
hands off to a human adjuster for any payout decision.

## Why this example

It exercises the parts of the spec most likely to matter in regulated
domains:

- `criticality: regulated_customer_facing`,
- multiple MCP tools with distinct permission scopes,
- explicit `requires_human_approval` on the payout-related tool,
- a behavior contract with both deterministic rules ("never
  auto-authorize a payout") and probabilistic rules ("classification
  accuracy ≥ 0.92 with 95 % confidence"),
- a memory model that pins the runtime schema version without bundling
  user data,
- compatibility metadata for safe rollback.

## Layout

```text
claims-agent/
├── README.md                         (this file)
├── genome.yaml
├── agent.lock.yaml
├── behavior.contract.yaml
├── prompts/
│   ├── system.md
│   └── skills/
│       ├── classify_claim.md
│       └── compensation_reasoning.md
├── tools/
│   └── mcp.lock.yaml
├── memory/
│   └── memory.schema.yaml
├── policies/
│   └── compensation_policy.md
├── knowledge/
│   └── snapshots.yaml
├── evals/
│   └── replay_manifest.yaml
└── attestations/
    └── README.md
```

## How to validate locally

```bash
npm ci
npm run validate
```

The validator runs all examples and conformance fixtures against the
schemas in `schemas/v0.1/`. The expected result is `PASS` for everything
under `examples/`.
