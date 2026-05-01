# Example: support-agent

> Synthetic example. Not affiliated with any real SaaS company.

A fictional Tier-1 SaaS support agent. It answers product questions
based on a public-docs knowledge index, classifies tickets, and hands
off to a human if the request requires account-level changes.

## Why this example

A smaller-scope counterpart to `claims-agent`:

- `criticality: standard` (no regulated data),
- a single MCP tool (read-only docs lookup),
- a behavior contract focused on classification accuracy and on never
  promising an account-level change without escalation.

## Layout

```text
support-agent/
├── README.md
├── genome.yaml
├── agent.lock.yaml
├── behavior.contract.yaml
├── prompts/
│   ├── system.md
│   └── skills/
│       └── classify_ticket.md
├── memory/
│   └── memory.schema.yaml
└── attestations/
    └── README.md
```

## How to validate locally

```bash
npm ci
npm run validate
```
