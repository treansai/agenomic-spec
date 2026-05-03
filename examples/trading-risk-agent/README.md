# Example: trading-risk-agent

> Synthetic example. Not affiliated with any real trading firm or
> exchange. No real positions, instruments, or market data are
> referenced.

A fictional **risk-flagging** agent for a synthetic trading desk.
Critically, this agent **only flags risk**; it never executes,
modifies, or cancels trades. All execution actions are delegated to
human risk officers.

## Why this example

This bundle exercises the parts of the spec most relevant to
high-stakes, action-bounded agents:

- `criticality: life_critical` (a misfire here can move significant
  money very fast),
- explicit `forbidden_decisions` covering every action that would
  modify trading state,
- behavior contract with `critical` deterministic rules covering max
  flagged position size, mandatory human approval, and zero-tolerance
  rules on action verbs in the final output,
- read-only MCP tools only,
- ATEP-friendly: every flag carries enough context to be reproduced
  from the bundle hash plus the trace event.

## Layout

```text
trading-risk-agent/
├── README.md
├── genome.yaml
├── agent.lock.yaml
├── behavior.contract.yaml
├── prompts/
│   ├── system.md
│   └── skills/
│       └── flag_risk.md
└── attestations/
    └── README.md
```

## How to validate locally

```bash
npm ci
npm run validate
```
