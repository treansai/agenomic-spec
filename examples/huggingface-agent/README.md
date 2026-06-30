# Example: huggingface-agent

> Synthetic example. Not affiliated with Hugging Face or any model author.

A fictional assistant served by an open-weight model hosted on Hugging
Face (`mistralai/Mistral-7B-Instruct-v0.3`). It demonstrates the
optional Hugging Face fields in the genome `runtime` block and the
agent lockfile `model` block.

## Why this example

- `model_provider: huggingface` with `task: text-generation`,
  `revision: main`, an `organization`, and provider-specific generation
  `parameters`.
- A lockfile that pins the `resolved_commit`, a REDACTED `endpoint_ref`
  (scheme://host/path, never credentials), and `endpoint_hash`,
  `metadata_hash`, and `parameter_hash` for drift detection.
- `criticality: standard`, no tools, no knowledge index.

See [`docs/providers/huggingface.md`](../../docs/providers/huggingface.md)
for the full provider reference (aliases, env vars, security notes).

## Layout

```text
huggingface-agent/
├── README.md
├── genome.yaml
├── agent.lock.yaml
├── prompts/
│   ├── system.md
│   └── skills/
│       └── answer_question.md
├── policies/
│   └── data_handling.md
└── memory/
    └── memory.schema.yaml
```

## Security

No token is ever stored in any artifact. The runtime supplies
`HUGGINGFACE_API_TOKEN` (or the `HF_TOKEN` fallback) from the
environment. The `endpoint_ref` carries only scheme://host/path with no
inline credentials.

## How to validate locally

```bash
npm ci
npm run validate
```
